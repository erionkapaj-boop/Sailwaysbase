import { createClient } from "@supabase/supabase-js";

// Service-role client for API routes only. Never import this from anything
// under app/platform/** — it would ship the key to the browser.
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
