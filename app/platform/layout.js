import { Inter, Noto_Sans_Mono, EB_Garamond } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import PlatformShell from "./PlatformShell";
import MessageBridge from "./MessageBridge";
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

export async function generateMetadata() {
  const t = await getTranslations("LayoutMeta");
  return {
    title: "SkipperFinder",
    description: t("description"),
    // Without this, /platform pages silently inherit the base app's
    // manifest.json (start_url: "/"), so "Install app" from a /platform page
    // would launch straight into the other app instead.
    manifest: "/platform-manifest.json",
    // Δικά του εικονίδια (κυκλικό τιμόνι), ξεχωριστά από του Base Manager
    // (/icon-192.png κ.λπ.). Αναπαράγονται με scripts/make-platform-icons.mjs.
    icons: {
      icon: [
        { url: "/skipperfinder-icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/skipperfinder-icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/skipperfinder-apple-touch-icon.png",
    },
  };
}

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
      {/* Native controls (select, button, input) and anything portalled to
          <body> do not inherit the page font by default and fell back to the
          system face, so Greek omega changed shape mid-screen.
          One rule gives them all the same family. */}
      <style>{`
        body { font-family: ${sans.style.fontFamily}; }
        button, input, select, textarea, optgroup { font-family: inherit; font-feature-settings: normal; }
      `}</style>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <MessageBridge>
          <PlatformShell>{children}</PlatformShell>
        </MessageBridge>
      </NextIntlClientProvider>
    </div>
  );
}
