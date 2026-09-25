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

const user = (id, phone) => ({
  id, phone: (phone || "").replace(/^\+/, ""), aud: "authenticated", role: "authenticated",
  app_metadata: { provider: "phone" }, user_metadata: {}, created_at: new Date().toISOString(),
});
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

  if (url.pathname.startsWith("/auth/v1")) {
    const path = url.pathname.slice("/auth/v1".length);
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
    if (path === "/user") {
      const c = claimsOf((req.headers.authorization || "").replace(/^Bearer /, ""));
      return c?.sub ? json(res, 200, user(c.sub, c.phone)) : json(res, 401, { msg: "no user" });
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
