import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FeedbackStore } from "./feedback.mjs";
import { startServer } from "./server.mjs";

async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), "feedback-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return new FeedbackStore(dir);
}

function postChunks(url, chunks) {
    return new Promise((resolve, reject) => {
        const req = request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, (res) => {
            const body = [];
            res.on("data", (chunk) => body.push(chunk));
            res.on("end", () => resolve({
                status: res.statusCode,
                body: JSON.parse(Buffer.concat(body).toString("utf8")),
            }));
        });
        req.on("error", reject);
        let index = 0;
        const writeNext = () => {
            if (index === chunks.length) return req.end();
            req.write(chunks[index++]);
            setImmediate(writeNext);
        };
        writeNext();
    });
}

test("reports append with session attribution and survive reopening, newest first", async (t) => {
    const store = await fixture(t);
    assert.deepEqual(await store.list(), []);
    const first = await store.submit({ kind: "complaint", summary: "The permission prompt repeated." }, "session-1");
    const second = await store.submit({
        kind: "suggestion", summary: "The setup instructions missed a step.", fix: "Add the missing prerequisite.",
    }, "session-2");
    const reopened = new FeedbackStore(store.root);
    assert.equal((await reopened.list())[0].id, second.id);
    assert.equal((await reopened.list())[1].sessionId, "session-1");
    assert.ok(Number.isFinite(Date.parse(first.timestamp)));
    assert.equal((await readFile(store.file, "utf8")).trim().split("\n").length, 2);
    await reopened.resolve(first.id, "Updated the permission guidance.");
    await reopened.resolve(second.id);
    const reports = await new FeedbackStore(store.root).list();
    assert.ok(reports.every((report) => report.resolved));
    assert.equal(reports[1].note, "Updated the permission guidance.");
    assert.equal((await readFile(store.file, "utf8")).trim().split("\n").length, 4);
});

test("invalid reports and damaged files surface errors", async (t) => {
    const store = await fixture(t);
    await assert.rejects(store.submit({ kind: "other", summary: "Example." }, "session-1"));
    await assert.rejects(store.submit({ kind: "complaint", summary: " " }, "session-1"));
    await assert.rejects(store.submit({ kind: "suggestion", summary: "x".repeat(2001) }, "session-1"));
    await assert.rejects(store.submit({ kind: "complaint", summary: "Example.", sessionId: "spoofed" }, "session-1"));
    await assert.rejects(store.submit({ kind: "complaint", summary: "Example." }));
    await assert.rejects(store.resolve("missing"), /not found/);
    await writeFile(store.file, "{");
    await assert.rejects(store.list(), /unreadable/);
});

test("canvas serves reports, assets, and the resolve action", async (t) => {
    const store = await fixture(t);
    const saved = await store.submit({ kind: "complaint", summary: "<script>example</script>" }, "session-1");
    const { server, url } = await startServer(store);
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    assert.equal(server.address().address, "127.0.0.1");
    assert.match(await (await fetch(url)).text(), /Agent feedback void/);
    const script = await (await fetch(new URL("inbox.js", url))).text();
    assert.match(script, /textContent/);
    assert.doesNotMatch(script, /innerHTML|outerHTML/);
    assert.equal((await (await fetch(new URL("reports", url))).json())[0].id, saved.id);
    const response = await fetch(new URL("resolve", url), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: saved.id, note: "Improved the instructions." }),
    });
    assert.equal(response.status, 200);
    assert.equal((await store.list())[0].resolved, true);
    assert.equal((await fetch(new URL("missing", url))).status, 404);
    const invalid = await fetch(new URL("resolve", url), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(invalid.status, 400);
});

test("resolve decodes split UTF-8 once and enforces the raw byte limit", async (t) => {
    const store = await fixture(t);
    const saved = await store.submit({ kind: "complaint", summary: "Example." }, "session-1");
    const oversized = await store.submit({ kind: "suggestion", summary: "Another example." }, "session-2");
    const { server, url } = await startServer(store);
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

    const body = Buffer.from(JSON.stringify({ id: saved.id, note: "café" }));
    const character = body.indexOf(Buffer.from("é"));
    const response = await postChunks(new URL("resolve", url), [
        body.subarray(0, character + 1),
        body.subarray(character + 1),
    ]);
    assert.equal(response.status, 200);
    assert.equal((await store.list()).find((report) => report.id === saved.id).note, "café");

    const tooLarge = await postChunks(new URL("resolve", url), [
        Buffer.alloc(8192, "a"),
        Buffer.alloc(8193, "b"),
    ]);
    assert.equal(tooLarge.status, 400);
    assert.equal(tooLarge.body.error, "Request is too large.");
    assert.equal((await store.list()).find((report) => report.id === oversized.id).resolved, false);
});
