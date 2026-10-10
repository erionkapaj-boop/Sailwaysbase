import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.js");

// Sent with every page and API response (docs/AUDIT.md #21):
//   - no other site may show these pages inside a frame (clickjacking);
//   - the browser must not guess file types;
//   - links to other sites carry only the domain, not the full address;
//   - HTTPS only, for a year;
//   - camera, microphone and location stay off (the app uses none of them).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Η έκδοση (το deploy) μπαίνει σε κάθε αναφορά της «Υγείας εφαρμογής»,
  // ώστε να φαίνεται αν ένα σφάλμα ξεκίνησε μετά από συγκεκριμένο deploy.
  env: {
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
