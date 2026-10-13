"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { container, card, h1, muted, button } from "../../../lib/platform/theme";

// Replaces the old bare "Χρειάζεται σύνδεση." text (found on 6 different
// pages during a usability pass) — a real dead end for anyone who reached
// one of these pages signed out, most commonly right after "Αποσύνδεση".
// next carries them back here once they've actually signed in/registered.
export default function SignedOutNotice() {
  const t = useTranslations("SignedOutNotice");
  const pathname = usePathname();
  const next = `?next=${encodeURIComponent(pathname)}`;
  return (
    <div style={container}>
      <div style={{ ...card, marginTop: 20, textAlign: "center" }}>
        <h1 style={{ ...h1, fontSize: 20 }}>{t("title")}</h1>
        <p style={{ ...muted, margin: "10px 0 20px" }}>{t("body")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href={`/platform/login${next}`} style={{ ...button("primary"), textDecoration: "none" }}>
            {t("login")}
          </Link>
          <Link href="/platform/register" style={{ ...button("secondary"), textDecoration: "none" }}>
            {t("register")}
          </Link>
        </div>
      </div>
    </div>
  );
}
