"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { getMyReservedCredits } from "../../../lib/platform/db";
import { roleColor, ROLE_ICON } from "../../../lib/platform/userRoles";
import { envFor } from "../../../lib/platform/roleEnv";
import { formatCredits } from "../../../lib/platform/credits";
import { colors, fontSans, radius, shadow } from "../../../lib/platform/theme";

const MENU_ITEMS = {
  profile: { href: "/platform/profile", icon: "user", label: "profile" },
  bookings: { href: "/platform/bookings", icon: "calCheck", label: "bookings" },
  settings: { href: "/platform/settings", icon: "sliders", label: "settings" },
  packages: { href: "/platform/wallet", icon: "wallet", label: "packages" },
  help: { href: "/platform/help", icon: "question", label: "help" },
};

// Το «Σύνδεση» πάνω δεξιά γίνεται, για συνδεδεμένο χρήστη, η φωτογραφία του με μικρό βελάκι. Το λεπτό δαχτυλίδι γύρω της έχει το
// χρώμα του τρέχοντος ρόλου (lib/platform/userRoles.js), ώστε να φαίνεται πάντα σε ποιον ρόλο βρίσκεται. Πάτημα → μενού.
//   limited: λογαριασμός χωρίς ρόλο ακόμη (στη μέση της εγγραφής): μόνο στοιχεία και αποσύνδεση.
export default function ProfileMenu({ name, photoUrl, limited = false }) {
  const t = useTranslations("ProfileMenu");
  const tr = useTranslations("UserRoles");
  const { session, userRow, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [reserved, setReserved] = useState(0);
  const root = useRef(null);

  const current = useActiveRole();
  const menu = envFor(current).menu;
  const color = roleColor(current);
  const email = session?.user?.email || userRow?.email || "";
  const balance = Math.max(0, Number(userRow?.wallet_balance ?? 0) - reserved);

  // Το υπόλοιπο credits διαβάζεται φρέσκο κάθε φορά που ανοίγει το μενού.
  useEffect(() => {
    if (!open || limited) return;
    let alive = true;
    getMyReservedCredits().then((n) => alive && setReserved(Number(n) || 0)).catch(() => {});
    return () => { alive = false; };
  }, [open, limited]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = { display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 12px", borderRadius: radius.md, color: colors.ink, textDecoration: "none", fontSize: 15, fontFamily: fontSans, background: "none", border: "none", width: "100%", boxSizing: "border-box", cursor: "pointer", textAlign: "left" };

  return (
    <div ref={root} style={{ position: "relative" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .sf-pm-row:hover,.sf-pm-row:focus-visible{background:${colors.seaGlass}}
        .sf-pm-row:focus-visible,.sf-pm-btn:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px}
        @keyframes sf-pm-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
        .sf-pm-pop{transform-origin:top right;animation:sf-pm-in .2s cubic-bezier(.22,.61,.36,1)}
      ` }} />
      <button
        type="button"
        data-profile-menu
        data-active-role={current}
        className="sf-pm-btn"
        aria-label={t("open")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44, padding: "0 4px 0 6px", background: "transparent", border: "none", cursor: "pointer", color: colors.inkSoft, borderRadius: radius.pill }}
      >
        <span data-role-ring style={{ display: "inline-flex", padding: 2, borderRadius: "50%", border: `1.5px solid ${color.solid}`, background: colors.card }}>
          <Avatar src={photoUrl} name={name || ""} size={30} />
        </span>
        <Icon name="chevDown" size={16} stroke={2} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
      </button>

      {open && (
        <div
          role="menu"
          data-profile-pop
          className="sf-pm-pop"
          style={{ position: "absolute", top: 50, right: 0, zIndex: 60, width: "min(320px, calc(100vw - 24px))", boxSizing: "border-box", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.lg, boxShadow: shadow.raised, padding: 8, maxHeight: "calc(100vh - 72px)", overflowY: "auto" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 14px" }}>
            <span style={{ display: "inline-flex", padding: 2, borderRadius: "50%", border: `1.5px solid ${color.solid}` }}>
              <Avatar src={photoUrl} name={name || ""} size={48} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div data-pm-name style={{ fontSize: 16, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{name || ""}</div>
              {!limited && <div style={{ fontSize: 13, color: color.fg, fontWeight: 500, marginTop: 2 }}>{tr(current)}</div>}
              {email && <div data-pm-email style={{ fontSize: 13, color: colors.inkSoft, marginTop: 2, overflowWrap: "anywhere" }}>{email}</div>}
            </div>
          </div>

          {!limited && (
            <>
              <div style={{ borderTop: `1px solid ${colors.border}`, padding: "10px 4px 4px" }}>
                <div style={{ padding: "0 8px 6px", fontSize: 12, color: colors.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("currentRole")}</div>
                <div data-pm-current-role style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 12px", borderRadius: radius.md, background: color.bg, color: color.fg, fontSize: 15, fontWeight: 600 }}>
                  <Icon name={ROLE_ICON[current]} size={20} />
                  <span style={{ flex: 1, minWidth: 0 }}>{tr(current)}</span>
                  <Icon name="check" size={18} stroke={2.2} />
                </div>
                <Link href="/platform/roles" role="menuitem" data-pm-change-role className="sf-pm-row" style={{ ...row, justifyContent: "space-between", marginTop: 2, color: colors.inkSoft, fontSize: 14 }} onClick={() => setOpen(false)}>
                  <span>{t("changeRole")}</span>
                  <Icon name="chev" size={16} />
                </Link>
              </div>

              <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 6, padding: "6px 4px 4px" }}>
                {/* Οι γραμμές ορίζονται ανά ρόλο στο lib/platform/roleEnv.js· ό,τι είναι ήδη καρτέλα δεν επαναλαμβάνεται. */}
                {menu.map((k) => {
                  const m = MENU_ITEMS[k];
                  return (
                    <Link key={k} href={m.href} role="menuitem" data-pm-item={k} {...(k === "packages" ? { "data-pm-packages": "" } : {})} className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                      <Icon name={m.icon} size={20} /><span style={{ flex: 1 }}>{t(m.label)}</span>
                      {k === "packages" && <span data-pm-balance style={{ fontSize: 13, color: colors.inkSoft }}>{formatCredits(balance)}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 6, padding: "6px 4px 2px" }}>
            <button type="button" role="menuitem" data-pm-logout className="sf-pm-row" style={row} onClick={() => { setOpen(false); signOut(); }}>
              <Icon name="login" size={20} style={{ transform: "scaleX(-1)" }} /><span style={{ flex: 1 }}>{t("logout")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
