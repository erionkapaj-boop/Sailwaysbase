import { NextResponse } from "next/server";

// skipperfinder.gr is meant to open straight into the /platform app — no
// one visiting that domain should ever need to type "/platform" themselves.
// Scoped to this one hostname only: every other domain (the .vercel.app
// preview link, any future domain pointed at the base manager app) keeps
// showing exactly what it shows today, completely untouched.
const SKIPPERFINDER_HOSTS = new Set(["skipperfinder.gr", "www.skipperfinder.gr"]);

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
