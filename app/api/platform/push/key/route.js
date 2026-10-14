import { vapidKeys } from "../../../../../lib/platform/pushKeys";

// Το δημόσιο κλειδί που χρειάζεται ο browser για να εγγραφεί στις ειδοποιήσεις.
// Είναι δημόσιο από τη φύση του (το βλέπει κάθε συσκευή)· το ιδιωτικό δεν φεύγει ποτέ.
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = vapidKeys();
  if (!keys) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  return Response.json({ ok: true, key: keys.publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
