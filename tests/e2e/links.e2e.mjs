// Every link a notification can carry must open a real page — a link to a
// page that was removed shows the visitor a bare 404 (the "Το ταξίδι
// ολοκληρώθηκε" notification did exactly that).
import { existsSync } from "node:fs";
import { BASE, check, finish, sql } from "./lib.mjs";

const APP = new URL("../../app/", import.meta.url).pathname;
// /platform/admin/user/<id> → app/platform/admin/user/[id]/page.js
const pageFor = (path) => {
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const tryDirs = (dir, rest) => {
    if (!rest.length) return existsSync(`${dir}/page.js`);
    if (existsSync(`${dir}/${rest[0]}`) && tryDirs(`${dir}/${rest[0]}`, rest.slice(1))) return true;
    return existsSync(`${dir}/[id]`) && tryDirs(`${dir}/[id]`, rest.slice(1));
  };
  return tryDirs(APP.replace(/\/$/, ""), parts);
};

// Links written into the database's own functions ('/platform/...').
const inCode = sql(`
  select distinct m[1] from pg_proc p, regexp_matches(p.prosrc, '''(/platform[^''?#]*)', 'g') m
   where p.pronamespace = 'public'::regnamespace`).split("\n").filter(Boolean);
const dead = inCode.filter((p) => !pageFor(p.endsWith("/") ? p + "x" : p));
check(`κάθε σύνδεσμος ειδοποίησης στη βάση ανοίγει σελίδα (${inCode.length})`, dead.length === 0, dead.join(", "));

// Links already stored on notifications (after the tests before this one).
const stored = sql(`select distinct split_part(split_part(link, '?', 1), '#', 1) from notifications where link like '/platform%'`)
  .split("\n").filter(Boolean);
const deadStored = stored.filter((p) => !pageFor(p));
check(`κάθε αποθηκευμένη ειδοποίηση ανοίγει σελίδα (${stored.length})`, deadStored.length === 0, deadStored.join(", "));

for (const p of stored.slice(0, 30)) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  check(`${p} δεν δίνει 404`, r.status !== 404, `πήρε ${r.status}`);
}
finish();
