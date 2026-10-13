"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, colors } from "../../../lib/platform/theme";
import { CREW_ROLES } from "../../../lib/platform/roles";

export default function ProfessionalsBody() {
  const router = useRouter();
  const t = useTranslations("Professionals");
  return (
    <div style={{ ...container, maxWidth: 560 }}>
      <div style={{ padding: "24px 0 0" }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>{t("title")}</h1>
        <p style={{ ...muted, lineHeight: 1.6 }}>
          {t("intro", { roles: CREW_ROLES.map((r) => r.label).join(", ") })}
        </p>

        <div style={{ ...card, marginTop: 24 }}>
          <Link
            href="/platform/register?as=professional"
            style={{ ...button("primary"), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box", width: "100%" }}
          >
            {t("start")}
          </Link>
          <p style={{ ...muted, fontSize: 13, margin: "14px 0 0" }}>
            {t("needs")}
          </p>
        </div>

        <p style={{ ...muted, fontSize: 13, marginTop: 20 }}>
          {t("haveAccount")}{" "}
          <Link href="/platform/login" style={{ color: colors.ink }}>
            {t("login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
