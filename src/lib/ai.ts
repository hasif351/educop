import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// One place that talks to Claude. When ANTHROPIC_API_KEY is not set (local
// dev, the public demo) callers get offline=true and use their own
// rule-based fallback, so every AI screen still works without a key.

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

export type AiTurn = { role: "user" | "assistant"; content: string };
export type AiResult = { text: string; model: string | null; inputTokens: number; outputTokens: number; offline: boolean; refused?: boolean };

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export async function generate(opts: { system: string; messages: AiTurn[]; maxTokens?: number }): Promise<AiResult> {
  if (!aiAvailable()) return { text: "", model: null, inputTokens: 0, outputTokens: 0, offline: true };
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: opts.system,
      messages: opts.messages,
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return {
      text, model: res.model, offline: false, refused: res.stop_reason === "refusal",
      inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
    };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`AI request failed (${e.status}): ${e.message}`);
    else console.error("AI request failed", e);
    return { text: "", model: null, inputTokens: 0, outputTokens: 0, offline: true };
  }
}

/** Pull the first JSON object or array out of a model reply. */
export function parseJson<T>(text: string): T | null {
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}
