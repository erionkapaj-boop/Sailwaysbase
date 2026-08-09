"use client";
import { createClient } from "@supabase/supabase-js";

// Deliberately separate from lib/supabaseClient.js (used by the pre-existing
// task-management app) and its own env var names, so the two apps can never
// end up pointing at the same Supabase project by accident just because
// they share a Vercel project.
const url = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
