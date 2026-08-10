import PlatformShell from "./PlatformShell";
import { page } from "../../lib/platform/theme";

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
  themeColor: "#18181B",
};

export default function PlatformLayout({ children }) {
  return (
    <div style={page}>
      <PlatformShell>{children}</PlatformShell>
    </div>
  );
}
