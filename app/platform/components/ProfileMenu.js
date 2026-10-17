"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { useAuth } from "../AuthContext";
import { getMyRoles, getMyReservedCredits } from "../../../lib/platform/db";
import { roleColor } from "../../../lib/platform/userRoles";
import { formatCredits } from "../../../lib/platform/credits";
import { colors, fontSans, radius, shadow } from "../../../lib/platform/theme";

// Εικονίδιο κάθε ρόλου (ένα σετ, components/Icon.js).
const ROLE_ICON = { client: "user", professional: "helm", company: "boat", creator: "compass", team: "users", admin: "shield" };

// Ρόλος όσο δεν έχει φορτώσει η βάση ή όσο δεν υπάρχει ακόμη ο πίνακας ρόλων: προκύπτει από όσα ξέρει ήδη η σύνδεση.
function fallbackRole({ isAdmin, role }) {
  if (isAdmin) return "admin";
  return role === "skipper" ? "professional" : "client";
}

// Το «Σύνδεση» πάνω δεξιά γίνεται, για συνδεδεμένο χρήστη, η φωτογραφία του με μικρό βελάκι. Το λεπτό δαχτυλίδι γύρω της έχει το
// χρώμα του τρέχοντος ρόλου (lib/platform/userRoles.js), ώστε να φαίνεται πάντα σε ποιον ρόλο βρίσκεται. Πάτημα → μενού.
//   limited: λογαριασμός χωρίς ρόλο ακόμη (στη μέση της εγγραφής): μόνο στοιχεία και αποσύνδεση.
export default function ProfileMenu({ name, photoUrl, limited = false }) {
  const t = useTranslations("ProfileMenu");
  const tr = useTranslations("UserRoles");
  const { session, userRow, role, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [reserved, setReserved] = useState(0);
  const root = useRef(null);

  const current = active || fallbackRole({ isAdmin, role });
  const color = roleColor(current);
  const email = session?.user?.email || userRow?.email || "";
  const balance = Math.max(0, Number(userRow?.wallet_balance ?? 0) - reserved);

  // Φρέσκα στοιχεία κάθε φορά που ανοίγει. Αν ο πίνακας ρόλων δεν υπάρχει ακόμη στη βάση, μένει ο ρόλος που προκύπτει από τα υπάρχοντα.
  useEffect(() => {
    if (!session || limited) return;
    let alive = true;
    getMyRoles().then((m) => alive && setActive(m.active)).catch(() => {});
    if (open) getMyReservedCredits().then((n) => alive && setReserved(Number(n) || 0)).catch(() => {});
    return () => { alive = false; };
  }, [session?.user?.id, open, limited]);

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
                {/* Στο επόμενο βήμα ανοίγει την επιλογή ρόλου. */}
                <button type="button" data-pm-change-role className="sf-pm-row" style={{ ...row, justifyContent: "space-between", marginTop: 2, color: colors.inkSoft, fontSize: 14 }}>
                  <span>{t("changeRole")}</span>
                  <Icon name="chev" size={16} />
                </button>
              </div>

              <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 6, padding: "6px 4px 4px" }}>
                <Link href="/platform/profile" role="menuitem" className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                  <Icon name="user" size={20} /><span style={{ flex: 1 }}>{t("profile")}</span>
                </Link>
                {!isAdmin && (
                  <>
                    <Link href="/platform/requests" role="menuitem" className="sf-pm-row sf-hide-narrow" style={row} onClick={() => setOpen(false)}>
                      <Icon name="inbox" size={20} /><span style={{ flex: 1 }}>{t("requests")}</span>
                    </Link>
                    <Link href="/platform/bookings" role="menuitem" className="sf-pm-row sf-hide-narrow" style={row} onClick={() => setOpen(false)}>
                      <Icon name="calCheck" size={20} /><span style={{ flex: 1 }}>{t("bookings")}</span>
                    </Link>
                  </>
                )}
                {role === "skipper" && !isAdmin && (
                  <Link href="/platform/availability" role="menuitem" className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                    <Icon name="cal" size={20} /><span style={{ flex: 1 }}>{t("availability")}</span>
                  </Link>
                )}
                <Link href="/platform/settings" role="menuitem" className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                  <Icon name="menu" size={20} /><span style={{ flex: 1 }}>{t("settings")}</span>
                </Link>
                <Link href="/platform/wallet" role="menuitem" data-pm-packages className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                  <Icon name="wallet" size={20} /><span style={{ flex: 1 }}>{t("packages")}</span>
                  <span data-pm-balance style={{ fontSize: 13, color: colors.inkSoft }}>{formatCredits(balance)}</span>
                </Link>
                <Link href="/platform/help" role="menuitem" className="sf-pm-row" style={row} onClick={() => setOpen(false)}>
                  <Icon name="question" size={20} /><span style={{ flex: 1 }}>{t("help")}</span>
                </Link>
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
