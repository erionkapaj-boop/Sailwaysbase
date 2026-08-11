import { Inter, Noto_Sans_Mono } from "next/font/google";
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

export const metadata = {
  title: "SkipperConnect | Σύνδεση Skipper & Πελατών",
  description: "Βρες εγκεκριμένο skipper για τις διακοπές σου, ή γίνε skipper στην πλατφόρμα.",
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

export default function PlatformLayout({ children }) {
  return (
    // These .variable classes define the CSS custom properties theme.js reads.
    <div className={`${sans.variable} ${mono.variable}`} style={page}>
      <PlatformShell>{children}</PlatformShell>
    </div>
  );
}
