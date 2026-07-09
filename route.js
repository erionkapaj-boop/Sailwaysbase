export async function POST(req) {
  try {
    const { prompt, max_tokens } = await req.json();
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
        max_tokens: max_tokens || 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ content: [], error: String(e) }, { status: 200 });
  }
}
