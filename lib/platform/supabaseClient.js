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
// Κάθε κλήση συνάρτησης της βάσης (rpc) περνά από εδώ: όποιος θέλει μαθαίνει
// το όνομα και το αποτέλεσμα (lib/platform/health.js τα κρατά ως «βήματα» και
// αναφέρει τις απρόσμενες αποτυχίες). Τα builders της Supabase επιστρέφουν το
// ίδιο αντικείμενο σε .single()/.maybeSingle(), οπότε η αλυσίδα δεν σπάει.
const rpcListeners = new Set();
export function onRpcResult(listener) {
  rpcListeners.add(listener);
  return () => rpcListeners.delete(listener);
}
function emitRpc(fn, error) {
  for (const l of rpcListeners) {
    try {
      l(fn, error);
    } catch {
      // ένας ακροατής που σπάει δεν επηρεάζει την κλήση
    }
  }
}
if (client) {
  const rpc = client.rpc.bind(client);
  client.rpc = (fn, args, options) => {
    const builder = rpc(fn, args, options);
    const then = builder.then.bind(builder);
    builder.then = (onOk, onErr) =>
      then(
        (res) => {
          emitRpc(fn, res?.error || null);
          return res;
        },
        (err) => {
          emitRpc(fn, err || new Error("network"));
          throw err;
        }
      ).then(onOk, onErr);
    return builder;
  };
}

export const supabase = client;
