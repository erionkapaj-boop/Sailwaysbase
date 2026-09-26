// Proxy to the Anthropic API for the task app (components/App.jsx), using the
// owner's key. It must not be an open relay for the whole internet:
//   - only pages of this same site may call it (Origin/Referer must match);
//   - the request size and the answer length are capped, the model is fixed.
// A script that forges the Origin header can still get through — a real
// sign-in for the task app is the full fix (docs/AUDIT.md #16, #27).
const MAX_PROMPT_CHARS = 60000;
const MAX_TOKENS = 2000;

function sameOrigin(req) {
  const host = req.headers.get("host");
  const from = req.headers.get("origin") || req.headers.get("referer");
  if (!host || !from) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

export async function POST(req) {
  if (!sameOrigin(req)) return Response.json({ content: [], error: "forbidden" }, { status: 403 });
  try {
    const { prompt, max_tokens } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
      return Response.json({ content: [], error: "bad_prompt" }, { status: 400 });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ content: [] }, { status: 200 });
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: Math.min(Math.max(Number(max_tokens) || 1000, 1), MAX_TOKENS),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ content: [], error: "failed" }, { status: 200 });
  }
}
