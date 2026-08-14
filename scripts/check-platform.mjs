// Two static checks that run before every build.
//
// `next build` here lints nothing — ESLint isn't installed — so two separate
// mistakes of mine shipped: a JSX component used without being imported (which
// blanked every page under the shell) and a variable renamed at its use site
// but not at its declaration. Both are trivially detectable and neither is
// worth catching in a browser after the fact.
//
// Deliberately narrow. A check that blocks deploys on a false positive is
// worse than the bugs it prevents, so it only reports things that cannot be
// anything but an error.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const JSX_BUILTINS = new Set(["Suspense", "Fragment", "Image", "Link", "React"]);
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".js") || entry.endsWith(".jsx")) checkFile(full);
  }
}

function importedNames(src) {
  const names = new Set();
  // default and namespace imports
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z0-9_$]+)\s*(?:,|from)/g)) {
    names.add(m[1]);
  }
  // named imports, including aliases
  for (const m of src.matchAll(/import[^;]*?\{([^}]*)\}[^;]*?from/gs)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function checkFile(path) {
  const src = readFileSync(path, "utf8");

  // 1. Every capitalised JSX tag must resolve to an import or a local
  //    definition. Anything else is a guaranteed runtime crash.
  const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const declared = new Set([
    ...[...src.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ...[...src.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1]),
    ...importedNames(src),
  ]);
  for (const name of used) {
    if (!declared.has(name) && !JSX_BUILTINS.has(name)) {
      problems.push(`${path}: <${name}> is used but never imported or defined`);
    }
  }

  // 2. Inside lib/platform/db.js specifically, `uid` must be declared in the
  //    function that uses it. Bulk-renaming its call sites without its
  //    declaration is the exact mistake that broke "view as".
  if (path.endsWith("lib/platform/db.js")) {
    for (const m of src.matchAll(/export async function (\w+)\([^)]*\)\s*\{/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      const body = src.slice(m.index + m[0].length, i);
      if (/\buid\b/.test(body) && !body.includes("const uid")) {
        problems.push(`${path}: ${m[1]}() uses \`uid\` without declaring it`);
      }
      // bare `auth.x`, not `db.auth.x`, with no `const { data: auth }` above it
      if (/(?<!db\.)\bauth\??\./.test(body) && !body.includes("data: auth")) {
        problems.push(`${path}: ${m[1]}() uses \`auth\` without declaring it`);
      }
    }
  }
}

walk("app/platform");
checkFile("lib/platform/db.js");

if (problems.length) {
  console.error("\nΈλεγχος απέτυχε:\n");
  for (const p of problems) console.error("  " + p);
  console.error("");
  process.exit(1);
}
console.log("check-platform: ok");
