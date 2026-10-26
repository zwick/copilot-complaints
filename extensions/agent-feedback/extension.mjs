import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { FeedbackStore, parameters, publicError } from "./feedback.mjs";
import { startServer } from "./server.mjs";

const store = new FeedbackStore();
const servers = new Map();

async function action(callback) {
    try {
        return await callback();
    } catch (error) {
        throw new CanvasError("feedback_error", publicError(error));
    }
}

await joinSession({
    tools: [{
        name: "dev_loop_feedback",
        description: "Briefly report friction you encounter in agent tools, setup, or workflow. Use complaint for a reaction, suggestion for a concrete improvement; fix is optional. Paraphrase without secrets, customer details, people, repo names, paths, copied code, prompts, or logs. Submit once per incident, then continue the task without a routine announcement. If reporting fails, keep working.",
        parameters,
        handler: async (args, invocation) => {
            try {
                const report = await store.submit(args, invocation.sessionId);
                return JSON.stringify({ id: report.id, saved: true });
            } catch (error) {
                return { resultType: "failure", textResultForLlm: publicError(error) };
            }
        },
    }],
    canvases: [createCanvas({
        id: "agent-feedback",
        displayName: "Agent inbox",
        description: "Read personal agent complaints and suggestions, and resolve them with an optional note.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        actions: [
            {
                name: "refresh",
                description: "Read the latest reports, newest first.",
                inputSchema: { type: "object", properties: {}, additionalProperties: false },
                handler: () => action(() => store.list()),
            },
            {
                name: "resolve",
                description: "Resolve a report after review, with an optional note.",
                inputSchema: {
                    type: "object", additionalProperties: false,
                    properties: { id: { type: "string" }, note: { type: "string", maxLength: 1000 } },
                    required: ["id"],
                },
                handler: (ctx) => action(() => store.resolve(ctx.input.id, ctx.input.note)),
            },
        ],
        open: async (ctx) => {
            let entry = servers.get(ctx.instanceId);
            if (!entry) {
                entry = await startServer(store);
                servers.set(ctx.instanceId, entry);
            }
            return { title: "Agent inbox", url: entry.url };
        },
        onClose: async (ctx) => {
            const entry = servers.get(ctx.instanceId);
            if (entry) {
                servers.delete(ctx.instanceId);
                await new Promise((resolve, reject) => entry.server.close((error) => error ? reject(error) : resolve()));
            }
        },
    })],
});
