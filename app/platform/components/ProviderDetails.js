"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { colors, muted } from "../../../lib/platform/theme";
import { company, field } from "../../../lib/platform/company";

// Τα στοιχεία του παρόχου (ΠΔ 131/2003 άρ. 4, DSA άρ. 11-12) είναι
// προσβάσιμα με ένα πάτημα από τη σελίδα, όχι τυπωμένα στο σώμα του κειμένου.
export default function ProviderDetails() {
  const t = useTranslations("Legal");
  const [open, setOpen] = useState(false);
  const rows = [
    ["providerName", field(company.legalName)],
    ["providerAddress", field(company.address) && `${company.address}, ${company.city}, ${company.country}`],
    ["providerVat", field(company.vat)],
    ["providerTaxOffice", field(company.taxOffice)],
    ["providerGemi", field(company.gemi)],
  ].filter(([, v]) => v);
  return (
    <div style={{ margin: "4px 0 12px" }}>
      <button
        type="button"
        data-provider-toggle
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: colors.accent, fontSize: 14, fontFamily: "inherit" }}
      >
        {open ? t("providerHide") : t("provider")}
      </button>
      {open && (
        <dl data-provider-details style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
              <dt style={{ ...muted,  }}>{t(k)}</dt>
              <dd style={{ margin: 0 }}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
