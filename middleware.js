import { NextResponse } from "next/server";

// skipperfinder.gr (and, once registered, skipperfinder.com) are meant to
// open straight into the /platform app — no one visiting either domain
// should ever need to type "/platform" themselves. Scoped to these
// hostnames only: every other domain (the .vercel.app preview link, any
// future domain pointed at the base manager app) keeps showing exactly what
// it shows today, completely untouched. The .com entries are inert until
// that domain is actually pointed here — same as .gr was before its DNS was
// configured.
const SKIPPERFINDER_HOSTS = new Set([
  "skipperfinder.gr", "www.skipperfinder.gr",
  "skipperfinder.com", "www.skipperfinder.com",
]);

export function middleware(request) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  if (SKIPPERFINDER_HOSTS.has(hostname) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/platform", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
