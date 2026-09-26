// Email goes through Resend's HTTP API — the only provider-specific part.
// Both variables unset means email is off everywhere that uses this.
// PLATFORM_EMAIL_API_URL only exists so the browser tests can point it at a
// local stand-in instead of Resend.
export function emailConfig() {
  const key = process.env.PLATFORM_EMAIL_API_KEY;
  const from = process.env.PLATFORM_EMAIL_FROM;
  const url = process.env.PLATFORM_EMAIL_API_URL || "https://api.resend.com/emails";
  return key && from ? { key, from, url } : null;
}

// Resolves to the HTTP status (0 when the request never got an answer), so a
// caller can tell a bad address (4xx: give up) from an outage (retry later).
export async function sendEmail({ key, from, url }, { to, subject, text, html }) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    return res.status;
  } catch {
    return 0;
  }
}
