"use client";
import { useLocale, useTranslations } from "next-intl";
import Avatar from "../components/Avatar";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { displayName } from "../../../lib/platform/names";
import { roleColor } from "../../../lib/platform/userRoles";
import { colors, container, h1, radius } from "../../../lib/platform/theme";

// «Το προφίλ μου» στο δωμάτιο του Administrator (και της Ομάδας): ποιος είσαι εδώ και τα στοιχεία σύνδεσής σου. Τίποτα από το προφίλ
// επαγγελματία (αυτό είναι άλλο δωμάτιο, «Αλλαγή ρόλου» → Επαγγελματίας) και καμία ενότητα διαχείρισης (αυτές είναι οι καρτέλες).
// children: τα στοιχεία σύνδεσης και οι ειδοποιήσεις, τα ίδια components με τα άλλα προφίλ (profile/page.js).
export default function AdminProfile({ children }) {
  const t = useTranslations("AdminProfile");
  const tr = useTranslations("UserRoles");
  const locale = useLocale();
  const { session, userRow, profile } = useAuth();
  const role = useActiveRole() === "team" ? "team" : "admin";
  const c = roleColor(role);
  const name = displayName(profile, locale) || displayName(userRow, locale) || t("adminName");
  const email = session?.user?.email || userRow?.email || "";

  return (
    <div style={container}>
      <h1 style={{ ...h1, marginBottom: 20 }}>{t("title")}</h1>
      <div data-admin-identity style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginBottom: 20, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
        <span style={{ display: "inline-flex", padding: 2, borderRadius: "50%", border: `1.5px solid ${c.solid}`, flexShrink: 0 }}>
          <Avatar src={profile?.photo_url || userRow?.photo_url} name={name} size={52} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{name}</div>
          <div style={{ fontSize: 13.5, color: c.fg, fontWeight: 500, marginTop: 2 }}>{tr(role)}</div>
          {email && <div style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2, overflowWrap: "anywhere" }}>{email}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
