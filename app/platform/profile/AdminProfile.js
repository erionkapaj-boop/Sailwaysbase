"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { SECTIONS, badgeCount, ADMIN_COUNTS_EVENT } from "../admin/AdminShell";
import { adminOverview } from "../../../lib/platform/db";
import { displayName } from "../../../lib/platform/names";
import { ADMIN_GROUPS, ADMIN_SECTION_ICON } from "../../../lib/platform/roleEnv";
import { roleColor } from "../../../lib/platform/userRoles";
import { colors, container, fontSans, h1, radius } from "../../../lib/platform/theme";

// Το προφίλ του Administrator (και της Ομάδας): ΟΛΗ η διαχείριση, οργανωμένη σε ομάδες (lib/platform/roleEnv.js, ADMIN_GROUPS). Κάθε
// ενότητα της κονσόλας υπάρχει σε ΜΙΑ ομάδα μόνο· δεν υπάρχει δεύτερο μενού, αριστερά ή αλλού. Η Επισκόπηση είναι η Αρχική του ρόλου
// και δεν επαναλαμβάνεται εδώ. Οι αριθμοί στις γραμμές είναι ό,τι περιμένει ενέργεια.
export default function AdminProfile() {
  const t = useTranslations("AdminProfile");
  const tr = useTranslations("UserRoles");
  const locale = useLocale();
  const { session, userRow, profile, isOwner } = useAuth();
  const role = useActiveRole();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const load = () => adminOverview().then(setCounts).catch(() => {});
    load();
    window.addEventListener(ADMIN_COUNTS_EVENT, load);
    return () => window.removeEventListener(ADMIN_COUNTS_EVENT, load);
  }, []);

  const byHref = Object.fromEntries(SECTIONS.map((s) => [s.href, s]));
  const groups = ADMIN_GROUPS.map((g) => ({
    ...g,
    items: g.sections.map((h) => byHref[h]).filter((s) => s && (isOwner || !s.ownerOnly)),
  })).filter((g) => g.items.length > 0);

  const c = roleColor(role === "team" ? "team" : "admin");
  const name = displayName(profile, locale) || displayName(userRow, locale) || t("adminName");
  const email = session?.user?.email || userRow?.email || "";

  return (
    <div style={{ ...container, maxWidth: 940 }}>
      <style dangerouslySetInnerHTML={{ __html: `.sf-ap-row:hover{background:${colors.seaGlass}}.sf-ap-row:focus-visible{outline:2px solid ${colors.ink};outline-offset:-2px}@keyframes sf-ap-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.sf-ap-card{animation:sf-ap-in .28s cubic-bezier(.22,.61,.36,1) both}` }} />
      <h1 style={{ ...h1, marginBottom: 20 }}>{t("title")}</h1>

      <div data-admin-identity style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginBottom: 20, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
        <span style={{ display: "inline-flex", padding: 2, borderRadius: "50%", border: `1.5px solid ${c.solid}`, flexShrink: 0 }}>
          <Avatar src={profile?.photo_url || userRow?.photo_url} name={name} size={52} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{name}</div>
          <div style={{ fontSize: 13.5, color: c.fg, fontWeight: 500, marginTop: 2 }}>{tr(role === "team" ? "team" : "admin")}</div>
          {email && <div style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2, overflowWrap: "anywhere" }}>{email}</div>}
        </div>
      </div>

      <div data-admin-groups style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 16, alignItems: "start" }}>
        {groups.map((g, i) => (
          <section key={g.key} data-admin-group={g.key} className="sf-ap-card" style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: "hidden", animationDelay: `${i * 40}ms` }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, padding: "14px 18px 10px", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.inkSoft, fontFamily: fontSans }}>
              <Icon name={g.icon} size={18} />
              {t(`group_${g.key}`)}
            </h2>
            {g.items.map((s) => {
              const n = badgeCount(s.badge, counts);
              return (
                <Link key={s.href} href={s.href} data-admin-section={s.href.split("/").pop()} className="sf-ap-row" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "0 18px", borderTop: `1px solid ${colors.border}`, textDecoration: "none", color: colors.ink, fontSize: 15.5, fontFamily: fontSans }}>
                  <Icon name={ADMIN_SECTION_ICON[s.href]} size={20} />
                  <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
                  {n > 0 && <span data-admin-badge style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: "#F7E5E2", color: "#8A2F25", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{n}</span>}
                  <Icon name="chev" size={16} style={{ color: colors.inkSoft }} />
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
