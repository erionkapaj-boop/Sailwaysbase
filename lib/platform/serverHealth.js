import { serviceClient } from "./serverDb";

// Σφάλματα του διακομιστή στην «Υγεία εφαρμογής» (0120, report_server_issue).
// Μόνο από κώδικα διακομιστή (API routes, cron, instrumentation.js). Ποτέ δεν
// πετά: αν η αναφορά αποτύχει, απλώς χάνεται.
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || "local").slice(0, 7);

export async function reportServerIssue(code, route, err, steps = []) {
  try {
    const db = serviceClient();
    if (!db) return;
    await db.rpc("report_server_issue", {
      p_code: String(code || "unexpected").slice(0, 80),
      p_route: route || null,
      p_detail: String(err?.message || err || "").slice(0, 300) || null,
      p_context: { v: VERSION, t: steps.filter(Boolean).slice(0, 8) },
    });
  } catch {
    // η αναφορά δεν σπάει ποτέ τη λειτουργία που την έστειλε
  }
}
