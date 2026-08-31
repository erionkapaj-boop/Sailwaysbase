import { Inter, Noto_Sans_Mono, EB_Garamond } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import PlatformShell from "./PlatformShell";
import { page, colors } from "../../lib/platform/theme";

// NOT Geist, despite the design brief naming it: Geist ships no Greek glyphs,
// so every ω/λ/etc. fell back to a different family mid-word ("ΧΩρίς",
// "ΔΩρεάν") — unusable for a Greek-language product. Inter is the closest
// neo-grotesque with full Greek coverage. The mono token also carries Greek
// (tier labels, statuses in badges), so it needs Greek too — IBM Plex Mono
// has no Greek subset on Google Fonts, Noto Sans Mono does.
const sans = Inter({
  subsets: ["latin", "greek"],
  variable: "--font-platform-sans",
  display: "swap",
});

const mono = Noto_Sans_Mono({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600"],
  variable: "--font-platform-mono",
  display: "swap",
});

// Editorial serif for headings (brief §5). Greek coverage is mandatory.
const serif = EB_Garamond({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600"],
  variable: "--font-platform-serif",
  display: "swap",
});

export const metadata = {
  title: "SkipperFinder",
  description: "Βρες πλήρωμα για το σκάφος σου στην Ελλάδα.",
  // Without this, /platform pages silently inherit the base app's
  // manifest.json (start_url: "/"), so "Install app" from a /platform page
  // would launch straight into the other app instead.
  manifest: "/platform-manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: colors.bg,
};

export default async function PlatformLayout({ children }) {
  // Reads the sf_locale cookie (i18n/request.js) and hands the resolved
  // language down to every client component in the tree via the provider
  // below — no [locale] URL segment, so this is the only place that needs
  // to know where the language comes from.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // These .variable classes define the CSS custom properties theme.js reads.
    <div className={`${sans.variable} ${mono.variable} ${serif.variable}`} style={page}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PlatformShell>{children}</PlatformShell>
      </NextIntlClientProvider>
    </div>
  );
}
