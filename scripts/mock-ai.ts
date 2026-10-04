/**
 * Fake OpenAI-compatible provider for local end-to-end testing (no real keys or spend).
 *   npm run dev:mock-ai   → http://127.0.0.1:8791/v1
 * Add it in Settings → AI providers as "OpenAI-compatible" with base URL http://127.0.0.1:8791/v1
 * (requires AI_ALLOW_PRIVATE_BASE_URLS=true on the dev API). Any key starting with "sk-mock-" works.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_AI_PORT ?? 8791);
const MODELS = ["mock-coder-1", "mock-coder-mini"];

createServer(async (req, res) => {
  const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer sk-mock-")) return send(401, { error: { message: "Invalid API key." } });
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "GET" && url.pathname === "/v1/models") return send(200, { data: MODELS.map((id) => ({ id, object: "model" })) });
  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || "{}") as { model?: string };
    if (!body.model || !MODELS.includes(body.model)) return send(404, { error: { message: `The model ${body.model} does not exist.` } });
    return send(200, { model: body.model, choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1 } });
  }
  send(404, { error: { message: "Not found" } });
}).listen(port, "127.0.0.1", () => console.log(`mock AI provider on http://127.0.0.1:${port}/v1`));
