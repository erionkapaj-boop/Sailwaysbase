import Link from "next/link";
import HomeSearchForm from "./HomeSearchForm";
import { container, h1, muted, colors } from "../../lib/platform/theme";

const secondaryLink = {
  fontSize: 14,
  color: colors.inkSoft,
  textDecoration: "none",
};

export default function LandingPage() {
  return (
    <div style={{ ...container, maxWidth: 680 }}>
      <div style={{ padding: "64px 0 12px" }}>
        <h1 style={{ ...h1, fontSize: 34, fontWeight: 600, marginBottom: 28 }}>Βρες το πλήρωμά σου.</h1>

        <HomeSearchForm />

        <p style={{ ...muted, fontSize: 13, textAlign: "center", margin: "16px 0 0" }}>
          Το σκάφος το βρήκες. Τώρα το πλήρωμα.
        </p>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 48 }}>
        <Link href="/platform/delivery" style={secondaryLink}>
          Μεταφορά σκάφους →
        </Link>
        <Link href="/platform/professionals" style={secondaryLink}>
          Για επαγγελματίες →
        </Link>
      </div>
    </div>
  );
}
