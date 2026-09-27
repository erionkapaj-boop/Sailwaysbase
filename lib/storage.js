"use client";

// Mimics the original window.storage API used in the prototype:
// - shared=true  -> team-wide data, through /api/kv (the server checks the
//   person's code before touching the "kv" table — docs/AUDIT.md #27, #28)
// - shared=false -> per-device data (e.g. remembered login code), stored in localStorage

let appCode = null;

// The personal code the server checks on every shared read and write.
export function setAppCode(code) {
  appCode = code || null;
}
function currentCode() {
  if (appCode) return appCode;
  try {
    return localStorage.getItem("lg:my-code") || "";
  } catch {
    return "";
  }
}
export function appHeaders(code = currentCode()) {
  return { "Content-Type": "application/json", "x-app-code": code || "" };
}

async function kv(body, code) {
  const res = await fetch("/api/kv", { method: "POST", headers: appHeaders(code), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "kv_failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Checks a code with the server: { ok, bootstrap } or throws (bad_code,
// too_many_attempts).
export async function verifyAppCode(code) {
  return kv({ op: "login" }, code);
}

export const storage = {
  async get(key, shared = true) {
    if (!shared) {
      const v = localStorage.getItem("lg:" + key);
      if (v === null) throw new Error("not found");
      return { key, value: v, shared: false };
    }
    const { value } = await kv({ op: "get", key });
    if (value == null) throw new Error("not found");
    return { key, value, shared: true };
  },

  async set(key, value, shared = true) {
    if (!shared) {
      localStorage.setItem("lg:" + key, value);
      return { key, value, shared: false };
    }
    try {
      await kv({ op: "set", key, value });
    } catch {
      return null;
    }
    return { key, value, shared: true };
  },

  async delete(key, shared = true) {
    if (!shared) {
      localStorage.removeItem("lg:" + key);
      return { key, deleted: true, shared: false };
    }
    try {
      await kv({ op: "delete", key });
    } catch {
      return null;
    }
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "", shared = true) {
    if (!shared) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("lg:" + prefix)).map(k => k.slice(3));
      return { keys, prefix, shared: false };
    }
    try {
      const { keys } = await kv({ op: "list", prefix });
      return { keys, prefix, shared: true };
    } catch {
      return null;
    }
  },
};
