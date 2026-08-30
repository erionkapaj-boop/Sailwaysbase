"use client";
import { useRouter } from "next/navigation";
import BackButton from "./BackButton";
import { container, h1, muted, colors, fontSans } from "../../../lib/platform/theme";
import { legalLastUpdated } from "../../../lib/platform/company";

// Κοινό κέλυφος για τα κείμενα (όροι, απόρρητο, σχετικά). Ένα κείμενο που
// διαβάζεται είναι κείμενο που τηρείται: μέτριο μήκος γραμμής, αριθμημένες
// ενότητες με σταθερά ids ώστε να μπορεί κανείς να παραπέμψει σε συγκεκριμένο
// όρο (π.χ. .../terms#fees), και ημερομηνία αναθεώρησης στην κορυφή.
export default function LegalPage({ title, intro, children, showUpdated = true }) {
  const router = useRouter();
  return (
    <div style={{ ...container, maxWidth: 720 }}>
      <div style={{ padding: "24px 0 0" }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>{title}</h1>
        {showUpdated && (
          <p style={{ ...muted, fontSize: 13, margin: "0 0 18px" }}>
            Τελευταία ενημέρωση: {legalLastUpdated}
          </p>
        )}
        {intro && (
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: colors.ink, margin: "0 0 8px" }}>{intro}</p>
        )}
        <div style={{ fontFamily: fontSans }}>{children}</div>
      </div>
    </div>
  );
}

export function Section({ id, n, title, children }) {
  return (
    <section id={id} style={{ marginTop: 34, scrollMarginTop: 80 }}>
      <h2
        style={{
          fontFamily: fontSans,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          margin: "0 0 10px",
          color: colors.ink,
        }}
      >
        {n != null && (
          <span style={{ color: colors.inkSoft, fontWeight: 400, marginRight: 8 }}>{n}.</span>
        )}
        {title}
      </h2>
      <div style={{ fontSize: 14.5, lineHeight: 1.75, color: colors.ink }}>{children}</div>
    </section>
  );
}

export function P({ children }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

export function UL({ children }) {
  return <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>{children}</ul>;
}

export function LI({ children }) {
  return <li style={{ margin: "0 0 6px" }}>{children}</li>;
}

// Για ό,τι πρέπει να ξεχωρίζει επειδή περιορίζει ευθύνη ή περιγράφει χρέωση.
// Χωρίς πλαίσιο, χωρίς χρωματιστό φόντο: μόνο μια λεπτή γραμμή στο πλάι, στο
// ίδιο ύφος με το υπόλοιπο κείμενο. Ένα «κουτί ανακοίνωσης» μέσα σε νομικό
// κείμενο διαβάζεται ως διακόσμηση, όχι ως όρος.
export function Note({ children }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${colors.border}`,
        padding: "2px 0 2px 14px",
        margin: "0 0 14px",
      }}
    >
      {children}
    </div>
  );
}
