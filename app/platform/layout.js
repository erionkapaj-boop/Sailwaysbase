import PlatformShell from "./PlatformShell";
import { page } from "../../lib/platform/theme";

export const metadata = {
  title: "SkipperConnect | Σύνδεση Skipper & Πελατών",
  description: "Βρες εγκεκριμένο skipper για τις διακοπές σου, ή γίνε skipper στην πλατφόρμα.",
};

export default function PlatformLayout({ children }) {
  return (
    <div style={page}>
      <PlatformShell>{children}</PlatformShell>
    </div>
  );
}
