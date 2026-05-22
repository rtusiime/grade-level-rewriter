// Direct browser calls to each LLM provider. The user's key never leaves
// the browser — it's stored in localStorage and sent only to the provider.

export type Provider = "claude" | "openai" | "gemini";

export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

export const PROVIDER_KEY_LABEL: Record<Provider, string> = {
  claude: "Anthropic API key (sk-ant-...)",
  openai: "OpenAI API key (sk-...)",
  gemini: "Google AI Studio key (AIza...)",
};

export const PROVIDER_KEY_LINK: Record<Provider, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/app/apikey",
};

export function buildPrompt(
  text: string,
  targetDesc: string,
  feedback: string | null,
): string {
  let base =
    "You are an expert at adapting reading passages for younger students " +
    "while preserving the key information and meaning.\n\n" +
    `TARGET: Rewrite the passage so that ${targetDesc}.\n` +
    "Rules:\n" +
    "- Keep every important fact and idea from the original.\n" +
    "- Use shorter sentences and common, concrete words.\n" +
    "- Do NOT add new information or opinions.\n" +
    "- Return ONLY the rewritten passage, no preamble.\n";
  if (feedback) {
    base +=
      "\nIMPORTANT FEEDBACK on your previous attempt:\n" +
      feedback +
      "\nRevise accordingly. Measured grade levels are ABSOLUTE targets, " +
      "not relative to the source.\n";
  }
  base += `\nPASSAGE:\n${text}\n`;
  return base;
}

async function asJson(res: Response): Promise<any> {
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return { _raw: body };
  }
}

async function callClaude(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await asJson(res);
  if (!res.ok) {
    throw new Error(
      `Claude API error (${res.status}): ${json?.error?.message || json?._raw || "unknown"}`,
    );
  }
  const text = (json.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude returned no text");
  return text;
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await asJson(res);
  if (!res.ok) {
    throw new Error(
      `OpenAI API error (${res.status}): ${json?.error?.message || json?._raw || "unknown"}`,
    );
  }
  const text: string = json?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenAI returned no text");
  return text;
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    }),
  });
  const json = await asJson(res);
  if (!res.ok) {
    throw new Error(
      `Gemini API error (${res.status}): ${json?.error?.message || json?._raw || "unknown"}`,
    );
  }
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text: string = parts
    .map((p: any) => p?.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

export async function rewrite(
  provider: Provider,
  text: string,
  targetDesc: string,
  feedback: string | null,
  apiKey: string,
  model?: string,
): Promise<string> {
  const m = model?.trim() || DEFAULT_MODELS[provider];
  const prompt = buildPrompt(text, targetDesc, feedback);
  if (provider === "claude") return callClaude(prompt, apiKey, m);
  if (provider === "openai") return callOpenAI(prompt, apiKey, m);
  return callGemini(prompt, apiKey, m);
}
