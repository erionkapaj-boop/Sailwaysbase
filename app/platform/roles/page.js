"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Icon from "../components/Icon";
import BackButton from "../components/BackButton";
import SignedOutNotice from "../components/SignedOutNotice";
import { useAuth } from "../AuthContext";
import { getMyRoles, setActiveRole } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { ROLE_ICON, ROLES_CHANGED_EVENT, roleColor, roleRows, rowAction, registerPath } from "../../../lib/platform/userRoles";
import { colors, container, fontSans, h1, muted, radius, button } from "../../../lib/platform/theme";

// «Οι ρόλοι μου» (βήμα 3 του μοντέλου ρόλων, docs/ROLES.md): ένας λογαριασμός, πολλοί ρόλοι. Ανοίγει από το «Αλλαγή ρόλου» του
// μενού προφίλ. Ενεργός ρόλος → πάτημα τον κάνει τρέχοντα (το δαχτυλίδι του avatar αλλάζει χρώμα)· σε έλεγχο → ένδειξη, δεν
// επιλέγεται· ρόλος που δεν έχει → ξεκινά η εγγραφή του (από το «Πρόσθεσε ρόλο»)· Ομάδα και Administrator μόνο σε εσωτερικούς.
export default function RolesPage() {
  const t = useTranslations("RolesScreen");
  const tr = useTranslations("UserRoles");
  const router = useRouter();
  const { session, loading } = useAuth();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    setFailed(false);
    getMyRoles().then(setModel).catch(() => setFailed(true));
  }
  useEffect(() => {
    if (session) load();
  }, [session?.user?.id]);

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  function goBack() {
    // Πίσω εκεί από όπου ήρθε· αν η σελίδα άνοιξε απευθείας, στην αρχική.
    if (window.history.length > 1) router.back();
    else router.push("/platform");
  }

  async function select(role) {
    if (busy) return;
    setBusy(role);
    setError("");
    try {
      const next = await setActiveRole(role);
      setModel(next);
      window.dispatchEvent(new CustomEvent(ROLES_CHANGED_EVENT, { detail: { active: next.active } }));
      setTimeout(goBack, 380);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  const rows = model ? roleRows(model) : [];
  const held = rows.filter((r) => r.status || r.internal);
  const addable = rows.filter((r) => !r.status && !r.internal);

  function Row({ row }) {
    const c = roleColor(row.role);
    const action = rowAction(row);
    const clickable = action !== "none";
    const dim = row.internal && row.status !== "active";
    const body = (
      <>
        <span style={{ width: 44, height: 44, borderRadius: "50%", background: c.bg, color: c.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: dim ? 0.55 : 1 }}>
          <Icon name={ROLE_ICON[row.role]} size={22} />
        </span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left", opacity: dim ? 0.6 : 1 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: colors.ink }}>{tr(row.role)}</span>
          <span style={{ display: "block", fontSize: 13.5, color: colors.inkSoft, marginTop: 2 }}>{t(`desc.${row.role}`)}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {row.status === "pending" && <span data-role-pending style={{ fontSize: 12.5, fontWeight: 500, padding: "4px 10px", borderRadius: radius.pill, background: "#F6EEDC", color: colors.warn }}>{t("pending")}</span>}
          {row.status === "rejected" && <span style={{ fontSize: 12.5, fontWeight: 500, padding: "4px 10px", borderRadius: radius.pill, background: "#F7E5E2", color: colors.danger }}>{t("rejected")}</span>}
          {row.current && <Icon name="check" size={22} stroke={2.2} style={{ color: c.fg }} aria-label={t("current")} />}
          {row.internal && row.status !== "active" && <Icon name="lock" size={18} style={{ color: colors.inkSoft }} />}
          {action === "register" && <Icon name="chev" size={18} style={{ color: colors.inkSoft }} />}
        </span>
      </>
    );
    const style = {
      display: "flex", alignItems: "center", gap: 14, width: "100%", boxSizing: "border-box", minHeight: 72, padding: "12px 16px", borderRadius: radius.lg,
      border: row.current ? `1.5px solid ${c.solid}` : `1px solid ${colors.border}`, background: row.current ? c.bg : colors.card, fontFamily: fontSans,
      cursor: clickable ? "pointer" : "default", color: colors.ink, opacity: busy && busy !== row.role ? 0.6 : 1,
    };
    const common = { "data-role-row": row.role, "data-role-status": row.status || "none", "data-role-current": row.current ? "true" : undefined, style, className: clickable ? "sf-role-row" : undefined };
    if (!clickable) return <div {...common} aria-current={row.current ? "true" : undefined}>{body}</div>;
    return (
      <button type="button" {...common} disabled={Boolean(busy)} onClick={() => (action === "select" ? select(row.role) : router.push(registerPath(row.role)))}>
        {body}
      </button>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 560 }}>
      <style dangerouslySetInnerHTML={{ __html: `.sf-role-row:hover:not(:disabled){border-color:${colors.inkSoft}}.sf-role-row:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px}@keyframes sf-roles-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}` }} />
      <div style={{ padding: "24px 0 0" }}>
        <BackButton onClick={goBack} />
        <h1 style={{ ...h1, marginTop: 20, marginBottom: 20 }}>{t("title")}</h1>

        {failed && (
          <div role="alert" style={{ ...muted, marginBottom: 16 }}>
            {t("loadError")}{" "}
            <button type="button" onClick={load} style={{ ...button("secondary"), minHeight: 44 }}>{t("retry")}</button>
          </div>
        )}
        {!model && !failed && <p style={muted}>{t("loading")}</p>}

        {model && (
          <>
            <div style={{ display: "grid", gap: 10 }} data-roles-list>
              {held.map((r) => <Row key={r.role} row={r} />)}
            </div>
            {error && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "12px 0 0" }}>{error}</p>}

            {addable.length > 0 && (
              <div style={{ marginTop: 24 }}>
                {adding ? (
                  <div data-roles-available style={{ animation: "sf-roles-in .2s cubic-bezier(.22,.61,.36,1)" }}>
                    <div style={{ fontSize: 12, color: colors.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 4px 10px" }}>{t("available")}</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {addable.map((r) => <Row key={r.role} row={r} />)}
                    </div>
                  </div>
                ) : (
                  <button type="button" data-add-role onClick={() => setAdding(true)} style={{ ...button("primary"), width: "100%", minHeight: 52, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Icon name="plus" size={18} stroke={2} />
                    {t("addRole")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
