"use client";
import { createClient } from "@supabase/supabase-js";

// Deliberately separate from lib/supabaseClient.js (used by the pre-existing
// task-management app) and its own env var names, so the two apps can never
// end up pointing at the same Supabase project by accident just because
// they share a Vercel project.
const url = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY;

// A malformed env var (e.g. missing "https://") must never fail the Next.js
// build itself — several /platform pages are statically prerendered, and
// createClient() validates the URL eagerly at import time. Catch it and
// degrade to the same "not configured" state as missing env vars, so the
// build always succeeds and the real problem shows up as a page-level error
// message instead of blocking deployment entirely.
let client = null;
if (url && anonKey) {
  try {
    client = createClient(url, anonKey);
  } catch (e) {
    console.error("Invalid platform Supabase config:", e.message);
  }
}
export const supabase = client;
