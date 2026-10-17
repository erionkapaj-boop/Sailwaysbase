"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "../../components/Icon";
import { IconDisc } from "../ui";
import { useAuth } from "../../AuthContext";
import AdminShell, { SECTIONS, badgeCount, useAdminCounts } from "../AdminShell";
import { ADMIN_GROUPS, ADMIN_SECTION_ICON } from "../../../../lib/platform/roleEnv";
import { colors, fontSans, radius } from "../../../../lib/platform/theme";

// «Περισσότερα» στο δωμάτιο του Administrator: όσες ενότητες της διαχείρισης δεν είναι καρτέλες, σε ομάδες (lib/platform/roleEnv.js,
// ADMIN_GROUPS). Κάθε ενότητα εμφανίζεται ΜΙΑ φορά· οι αριθμοί είναι ό,τι περιμένει ενέργεια. Η Ομάδα δεν βλέπει όσα είναι μόνο για
// τον ιδιοκτήτη.
export default function AdminMorePage() {
  const t = useTranslations("AdminMore");
  const { isOwner } = useAuth();
  const counts = useAdminCounts();

  const byHref = Object.fromEntries(SECTIONS.map((s) => [s.href, s]));
  const groups = ADMIN_GROUPS.map((g) => ({
    ...g,
    items: g.sections.map((h) => byHref[h]).filter((s) => s && (isOwner || !s.ownerOnly)),
  })).filter((g) => g.items.length > 0);

  return (
    <AdminShell title={t("title")}>
      <style dangerouslySetInnerHTML={{ __html: `.sf-am-row:hover{background:${colors.seaGlass}}.sf-am-row:focus-visible{outline:2px solid ${colors.ink};outline-offset:-2px}@keyframes sf-am-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.sf-am-card{animation:sf-am-in .28s cubic-bezier(.22,.61,.36,1) both}` }} />
      <div data-admin-groups style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, alignItems: "start" }}>
        {groups.map((g, i) => (
          <section key={g.key} data-admin-group={g.key} className="sf-am-card" style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden", animationDelay: `${i * 40}ms` }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, padding: "14px 18px 10px", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.inkSoft, fontFamily: fontSans }}>
              <Icon name={g.icon} size={18} />
              {t(`group_${g.key}`)}
            </h2>
            {g.items.map((s) => {
              const n = badgeCount(s.badge, counts);
              return (
                <Link key={s.href} href={s.href} data-admin-section={s.href.split("/").pop()} className="sf-am-row" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "0 18px", borderTop: `1px solid ${colors.border}`, textDecoration: "none", color: colors.ink, fontSize: 15.5, fontFamily: fontSans }}>
                  <IconDisc icon={ADMIN_SECTION_ICON[s.href]} tone={n > 0 ? "warn" : "brand"} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
                  {n > 0 && <span data-admin-badge style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: "#F7E5E2", color: "#8A2F25", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{n}</span>}
                  <Icon name="chev" size={16} style={{ color: colors.inkSoft }} />
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
