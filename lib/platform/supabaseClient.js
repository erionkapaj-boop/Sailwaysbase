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

// Κινητό που ξυπνά: το κλειδί σύνδεσης έχει λήξει και, αν η ανανέωση αποτύχει
// (το δίκτυο δεν έχει έρθει ακόμα), η Supabase στέλνει τα αιτήματα ως
// επισκέπτης και η βάση απαντά «permission denied» (401). Ο χρήστης όμως είναι
// ακόμα συνδεδεμένος: ανανεώνουμε τη σύνδεση και ξαναστέλνουμε μία φορά.
// Απευθείας κλήση στο /token, γιατί η βιβλιοθήκη κρατά την αποτυχία για ένα
// λεπτό και δεν ξαναδοκιμάζει. Πολλά αιτήματα μαζί μοιράζονται μία ανανέωση.
let renewing = null;
function renewSession() {
  if (renewing) return renewing;
  renewing = (async () => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(client.auth.storageKey) || "null");
    } catch {
      stored = null;
    }
    if (!stored?.refresh_token) return null;
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!res.ok) return null;
    const fresh = await res.json();
    if (!fresh?.access_token || !fresh?.refresh_token) return null;
    const { data } = await client.auth.setSession({ access_token: fresh.access_token, refresh_token: fresh.refresh_token });
    return data?.session?.access_token || null;
  })()
    .catch(() => null)
    .finally(() => {
      setTimeout(() => {
        renewing = null;
      }, 2000);
    });
  return renewing;
}

async function fetchWithSessionRetry(input, init) {
  const res = await fetch(input, init);
  if (res.status !== 401 || !client) return res;
  const reqUrl = typeof input === "string" ? input : input?.url || "";
  if (!reqUrl.includes("/rest/v1/")) return res;
  const headers = new Headers(init?.headers || (typeof input === "object" ? input.headers : undefined));
  if (headers.get("Authorization") !== `Bearer ${anonKey}`) return res;
  const token = await renewSession();
  if (!token) return res;
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

if (url && anonKey) {
  try {
    client = createClient(url, anonKey, { global: { fetch: fetchWithSessionRetry } });
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
