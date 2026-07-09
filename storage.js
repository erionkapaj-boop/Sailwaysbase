"use client";
import { supabase } from "./supabaseClient";

// Mimics the original window.storage API used in the prototype:
// - shared=true  -> team-wide data, stored in Supabase (table "kv")
// - shared=false -> per-device data (e.g. remembered login code), stored in localStorage

export const storage = {
  async get(key, shared = true) {
    if (!shared) {
      try {
        const v = localStorage.getItem("lg:" + key);
        if (v === null) throw new Error("not found");
        return { key, value: v, shared: false };
      } catch (e) {
        throw e;
      }
    }
    if (!supabase) return null;
    const { data, error } = await supabase.from("kv").select("value").eq("key", key).maybeSingle();
    if (error || !data) throw new Error("not found");
    return { key, value: data.value, shared: true };
  },

  async set(key, value, shared = true) {
    if (!shared) {
      localStorage.setItem("lg:" + key, value);
      return { key, value, shared: false };
    }
    if (!supabase) return null;
    const { error } = await supabase.from("kv").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return null;
    return { key, value, shared: true };
  },

  async delete(key, shared = true) {
    if (!shared) {
      localStorage.removeItem("lg:" + key);
      return { key, deleted: true, shared: false };
    }
    if (!supabase) return null;
    const { error } = await supabase.from("kv").delete().eq("key", key);
    if (error) return null;
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "", shared = true) {
    if (!shared) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("lg:" + prefix)).map(k => k.slice(3));
      return { keys, prefix, shared: false };
    }
    if (!supabase) return null;
    let q = supabase.from("kv").select("key");
    if (prefix) q = q.like("key", prefix + "%");
    const { data, error } = await q;
    if (error) return null;
    return { keys: (data || []).map(r => r.key), prefix, shared: true };
  },
};
