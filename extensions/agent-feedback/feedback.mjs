import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const parameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        kind: { type: "string", enum: ["complaint", "suggestion"] },
        summary: { type: "string", minLength: 1, maxLength: 2000 },
        fix: { type: "string", maxLength: 1000 },
    },
    required: ["kind", "summary"],
};

export class FeedbackError extends Error {}

function text(value, max) {
    if (typeof value !== "string" || !value.trim() || value.length > max) {
        throw new FeedbackError(`Use non-empty text up to ${max} characters.`);
    }
    return value.trim();
}

export function publicError(error) {
    return error instanceof FeedbackError ? error.message : "Could not access the local inbox. Check file permissions and disk space.";
}

export class FeedbackStore {
    constructor(root = join(process.env.COPILOT_HOME || join(homedir(), ".copilot"),
        "extensions", "agent-feedback", "artifacts")) {
        this.file = join(root, ".feedback.jsonl");
        this.root = root;
    }

    async append(event) {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await appendFile(this.file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    }

    async submit(args, sessionId) {
        if (!args || !["complaint", "suggestion"].includes(args.kind) ||
            Object.keys(args).some((key) => !["kind", "summary", "fix"].includes(key))) {
            throw new FeedbackError("Provide a complaint or suggestion with a short summary and optional fix.");
        }
        if (typeof sessionId !== "string" || !sessionId) throw new FeedbackError("Session attribution is unavailable.");
        const report = {
            type: "report", id: randomUUID(), sessionId, timestamp: new Date().toISOString(),
            kind: args.kind, summary: text(args.summary, 2000),
        };
        if (args.fix !== undefined) report.fix = text(args.fix, 1000);
        await this.append(report);
        return report;
    }

    async list() {
        let source;
        try {
            source = await readFile(this.file, "utf8");
        } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
        }
        const reports = new Map();
        try {
            for (const line of source.split("\n").filter((line) => line.trim())) {
                const event = JSON.parse(line);
                if (event.type === "report" && typeof event.id === "string" &&
                    typeof event.sessionId === "string" && typeof event.timestamp === "string" &&
                    Number.isFinite(Date.parse(event.timestamp)) &&
                    ["complaint", "suggestion"].includes(event.kind)) {
                    text(event.summary, 2000);
                    if (event.fix !== undefined) text(event.fix, 1000);
                    reports.set(event.id, { ...event, resolved: false });
                } else if (event.type === "resolve" && reports.has(event.id)) {
                    if (event.note !== undefined) text(event.note, 1000);
                    const report = reports.get(event.id);
                    report.resolved = true;
                    report.note = event.note;
                } else {
                    throw new Error();
                }
            }
        } catch {
            throw new FeedbackError("The inbox contains an unreadable record. Inspect .feedback.jsonl before continuing.");
        }
        return [...reports.values()].reverse().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    async resolve(id, note) {
        if (typeof id !== "string" || !(await this.list()).some((report) => report.id === id)) {
            throw new FeedbackError("Report not found. Refresh the inbox.");
        }
        const event = { type: "resolve", id, timestamp: new Date().toISOString() };
        if (note !== undefined) event.note = text(note, 1000);
        await this.append(event);
        return { id, resolved: true };
    }
}
