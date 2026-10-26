import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { FeedbackError, publicError } from "./feedback.mjs";

const assets = new Map([
    ["/", ["inbox.html", "text/html; charset=utf-8"]],
    ["/inbox.js", ["inbox.js", "text/javascript; charset=utf-8"]],
    ["/inbox.css", ["inbox.css", "text/css; charset=utf-8"]],
]);

export async function startServer(store) {
    const server = createServer(async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        try {
            if (req.method === "GET" && assets.has(req.url)) {
                const [file, type] = assets.get(req.url);
                res.setHeader("Content-Type", type);
                res.end(await readFile(new URL(file, import.meta.url)));
            } else if (req.method === "GET" && req.url === "/reports") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(await store.list()));
            } else if (req.method === "POST" && req.url === "/resolve") {
                if (req.headers["content-type"] !== "application/json") throw new FeedbackError("Expected JSON.");
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 16384) throw new FeedbackError("Request is too large.");
                    chunks.push(chunk);
                }
                let input;
                try { input = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); } catch {
                    throw new FeedbackError("Invalid JSON.");
                }
                const result = await store.resolve(input?.id, input?.note);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(result));
            } else {
                res.writeHead(404).end();
            }
        } catch (error) {
            res.writeHead(error instanceof FeedbackError ? 400 : 500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: publicError(error) }));
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
