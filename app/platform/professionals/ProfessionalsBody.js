"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, colors } from "../../../lib/platform/theme";
import { CREW_ROLES } from "../../../lib/platform/roles";

export default function ProfessionalsBody() {
  const router = useRouter();
  return (
    <div style={{ ...container, maxWidth: 560 }}>
      <div style={{ padding: "24px 0 0" }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>Για επαγγελματίες</h1>
        <p style={{ ...muted, lineHeight: 1.6 }}>
          Εγγραφή για {CREW_ROLES.map((r) => r.label).join(", ")}. Δηλώνεις τη διαθεσιμότητά σου και
          τη δική σου τιμή, και δέχεσαι αιτήματα από πελάτες.
        </p>

        <div style={{ ...card, marginTop: 24 }}>
          <Link href="/platform/register?as=professional">
            <button style={{ ...button("primary"), width: "100%" }}>Ξεκίνα την εγγραφή</button>
          </Link>
          <p style={{ ...muted, fontSize: 13, margin: "14px 0 0" }}>
            Χρειάζεσαι μόνο ονοματεπώνυμο, κινητό και email. Το κινητό επιβεβαιώνεται με SMS.
          </p>
        </div>

        <p style={{ ...muted, fontSize: 13, marginTop: 20 }}>
          Έχεις ήδη λογαριασμό;{" "}
          <Link href="/platform/login" style={{ color: colors.ink }}>
            Είσοδος
          </Link>
        </p>
      </div>
    </div>
  );
}
