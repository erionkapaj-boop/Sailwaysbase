import { createClient } from "@supabase/supabase-js";

// Isolated from /api/cron/nightly (the base task-management app's cron) —
// separate path, separate schedule, touches only the skipper-platform tables.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL,
    process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY
  );

  const results = {};
  try {
    const { data, error } = await db.rpc("mark_bookings_completed");
    if (error) throw error;
    results.bookingsCompleted = data;
  } catch (e) {
    results.markCompletedError = String(e);
  }

  try {
    const { data, error } = await db.rpc("expire_stale_booking_requests");
    if (error) throw error;
    results.requestsExpired = data;
  } catch (e) {
    results.expireError = String(e);
  }

  return Response.json({ ok: true, ...results });
}
