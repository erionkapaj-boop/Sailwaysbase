// Stand-in for the Supabase API during browser tests. /rest/v1 is proxied to
// a real PostgREST over the real schema, so every query, RPC and row-level
// security rule is the genuine one. Only /auth/v1 is faked: any account that
// exists in auth.users signs in with PIN 123456.
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const POSTGREST = process.env.POSTGREST_URL || "http://127.0.0.1:3001";
export const SECRET = process.env.JWT_SECRET || "e2e-secret-e2e-secret-e2e-secret-0123456789";
export const TEST_PIN = "123456";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(payload, secret = SECRET) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64(payload);
  return `${h}.${p}.${crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
const claimsOf = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
};

// Only ever called with digits / a uuid, never with user-controlled text.
function lookup(sql) {
  return execFileSync("psql", ["-X", "-At", "-c", sql], { env: process.env }).toString().trim();
}

const esc = (v) => String(v ?? "").replace(/'/g, "''");

// Ο χρήστης όπως τον έχει η βάση: τηλέφωνο, email και συνδέσεις (Google).
function dbUser(id) {
  const raw = lookup(
    `select json_build_object('phone', phone, 'email', email, 'meta', coalesce(raw_app_meta_data, '{}'::jsonb), ` +
      `'identities', (select coalesce(json_agg(json_build_object('provider', provider, 'identity_data', identity_data)), '[]'::json) ` +
      `from auth.identities i where i.user_id = u.id)) from auth.users u where id = '${esc(id)}'`
  );
  return raw ? JSON.parse(raw) : null;
}
const user = (id, phone) => {
  const d = dbUser(id) || {};
  return {
    id, phone: String((d.phone ?? phone) || "").replace(/^\+/, ""), email: d.email || undefined,
    aud: "authenticated", role: "authenticated",
    app_metadata: { provider: "phone", ...(d.meta || {}) }, user_metadata: {},
    identities: (d.identities || []).map((i) => ({ provider: i.provider, identity_data: i.identity_data })),
    created_at: new Date().toISOString(),
  };
};

// Η «Google» των δοκιμών: το τεστ ορίζει ποιος θα επιστρέψει (POST /__google/next),
// το authorize τον γυρίζει στην εφαρμογή με ένα code, και το code γίνεται σύνδεση.
let nextGoogle = { email: "giannis.test@gmail.com", name: "Γιάννης Δοκιμής" };
const codes = new Map();
function session(id, phone) {
  const exp = Math.floor(Date.now() / 1000) + 8 * 3600;
  return {
    access_token: sign({ sub: id, role: "authenticated", aud: "authenticated", exp, phone }),
    token_type: "bearer", expires_in: 8 * 3600, expires_at: exp, refresh_token: `r.${id}`, user: user(id, phone),
  };
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range, content-profile, x-client-info",
};
const json = (res, code, body) => {
  res.writeHead(code, { ...cors, "content-type": "application/json" });
  res.end(body == null ? "" : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/__google/next" && req.method === "POST") {
    nextGoogle = JSON.parse(body.toString() || "{}");
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith("/auth/v1")) {
    const path = url.pathname.slice("/auth/v1".length);
    if (path === "/authorize" && req.method === "GET") {
      const back = url.searchParams.get("redirect_to") || `http://localhost:3000/platform/auth/google`;
      const target = new URL(back);
      const linkUser = url.searchParams.get("link_user");
      const ownerOfGoogle =
        linkUser && lookup(`select user_id from auth.identities where provider = 'google' and identity_data ->> 'email' = '${esc(nextGoogle.email)}'`);
      if (nextGoogle.error) {
        target.searchParams.set("error", "access_denied");
        target.searchParams.set("error_description", "Access denied");
      } else if (ownerOfGoogle && ownerOfGoogle !== linkUser) {
        // Όπως το Supabase: ο λογαριασμός Google ανήκει ήδη σε άλλον χρήστη.
        target.searchParams.set("error", "server_error");
        target.searchParams.set("error_code", "identity_already_exists");
        target.searchParams.set("error_description", "Identity is already linked to another user");
      } else {
        const code = crypto.randomUUID();
        codes.set(code, { persona: nextGoogle, linkUserId: url.searchParams.get("link_user") || null });
        target.searchParams.set("code", code);
      }
      res.writeHead(302, { location: target.toString() });
      return res.end();
    }
    // linkIdentity: η εφαρμογή ζητά τη διεύθυνση της Google για τον συνδεδεμένο χρήστη.
    if (path === "/user/identities/authorize") {
      const c = claimsOf((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (!c?.sub) return json(res, 401, { msg: "no user" });
      const q = new URLSearchParams({ provider: "google", redirect_to: url.searchParams.get("redirect_to") || "", link_user: c.sub });
      return json(res, 200, { url: `http://localhost:${PORT}/auth/v1/authorize?${q}` });
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "pkce") {
      const j = JSON.parse(body.toString() || "{}");
      const entry = codes.get(String(j.auth_code));
      if (!entry) return json(res, 400, { error: "invalid_grant", error_description: "invalid flow state", msg: "invalid flow state" });
      codes.delete(String(j.auth_code));
      const { persona, linkUserId } = entry;
      // Όπως η Google/Supabase: ο λογαριασμός βρίσκεται από την ταυτότητα, όχι από το email του χρήστη.
      let id =
        linkUserId ||
        lookup(`select user_id from auth.identities where provider = 'google' and identity_data ->> 'email' = '${esc(persona.email)}'`) ||
        lookup(`select id from auth.users where email = '${esc(persona.email)}'`);
      if (!id) {
        id = crypto.randomUUID();
        lookup(`insert into auth.users (id, email, raw_app_meta_data) values ('${id}', '${esc(persona.email)}', '{"provider":"google","providers":["google"]}')`);
      }
      if (!lookup(`select 1 from auth.identities where user_id = '${id}' and provider = 'google'`)) {
        const data = JSON.stringify({ email: persona.email, email_verified: true, full_name: persona.name, name: persona.name });
        lookup(`insert into auth.identities (user_id, provider, provider_id, identity_data) values ('${id}', 'google', 'g-${id}', '${esc(data)}')`);
        if (linkUserId) lookup(`update auth.users set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{providers}', '["phone","google"]'::jsonb) where id = '${id}'`);
      }
      return json(res, 200, session(id, lookup(`select coalesce(phone, '') from auth.users where id = '${id}'`)));
    }
    if (path === "/token") {
      const j = JSON.parse(body.toString() || "{}");
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const id = String(j.refresh_token || "").slice(2).replace(/[^0-9a-f-]/gi, "");
        return json(res, 200, session(id, lookup(`select phone from auth.users where id = '${id}'`)));
      }
      const digits = String(j.phone || "").replace(/\D/g, "");
      const id = digits && lookup(`select id from auth.users where regexp_replace(phone, '\\D', '', 'g') = '${digits}'`);
      if (!id || j.password !== TEST_PIN) {
        return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      }
      return json(res, 200, session(id, `+${digits}`));
    }
    if (path === "/user" && req.method === "GET") {
      const c = claimsOf((req.headers.authorization || "").replace(/^Bearer /, ""));
      return c?.sub ? json(res, 200, user(c.sub, c.phone)) : json(res, 401, { msg: "no user" });
    }
    // auth.admin.updateUserById (service role): η αλλαγή τηλεφώνου ενός λογαριασμού.
    if (path.startsWith("/admin/users/") && req.method === "PUT") {
      const c = claimsOf((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (c?.role !== "service_role") return json(res, 403, { msg: "not allowed" });
      const id = path.slice("/admin/users/".length).replace(/[^0-9a-f-]/gi, "");
      const payload = JSON.parse(body.toString() || "{}");
      if (payload.phone) {
        const digits = String(payload.phone).replace(/\D/g, "");
        if (lookup(`select 1 from auth.users where regexp_replace(phone, '\\D', '', 'g') = '${digits}' and id <> '${id}'`)) {
          return json(res, 422, { msg: "A user with this phone number has already been registered", code: "phone_exists" });
        }
        lookup(`update auth.users set phone = '${digits}' where id = '${id}'`);
      }
      return json(res, 200, user(id, ""));
    }
    // auth.admin.createUser (service role only, as in Supabase): a new
    // identity that then signs in with the test PIN like any other.
    if (path === "/admin/users" && req.method === "POST") {
      const c = claimsOf((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (c?.role !== "service_role") return json(res, 403, { msg: "not allowed" });
      const payload = JSON.parse(body.toString() || "{}");
      const digits = String(payload.phone || "").replace(/\D/g, "");
      if (!digits) return json(res, 400, { msg: "phone required" });
      if (lookup(`select 1 from auth.users where regexp_replace(phone, '\\D', '', 'g') = '${digits}'`)) {
        return json(res, 422, { msg: "A user with this phone number has already been registered", code: "phone_exists" });
      }
      const id = crypto.randomUUID();
      const meta = JSON.stringify(payload.app_metadata || {}).replace(/'/g, "''");
      lookup(`insert into auth.users (id, phone, raw_app_meta_data) values ('${id}', '${digits}', '${meta}')`);
      return json(res, 200, user(id, `+${digits}`));
    }
    if (path === "/logout") {
      res.writeHead(204, cors);
      return res.end();
    }
    return json(res, 200, {});
  }

  if (url.pathname.startsWith("/rest/v1")) {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const r = await fetch(POSTGREST + url.pathname.slice("/rest/v1".length) + url.search, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    const out = Buffer.from(await r.arrayBuffer());
    const h = { ...cors };
    r.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) h[k] = v;
    });
    res.writeHead(r.status, h);
    return res.end(out);
  }

  if (url.pathname.startsWith("/storage/v1")) return json(res, 200, []);
  json(res, 404, { msg: "not found" });
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  server.listen(PORT, () => console.log(`gateway listening on ${PORT}`));
}
