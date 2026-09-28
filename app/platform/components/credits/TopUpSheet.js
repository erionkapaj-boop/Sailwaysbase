"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PackagePicker, { PurchaseSummary } from "./PackagePicker";
import { useAuth } from "../../AuthContext";
import { getCreditPurchase } from "../../../../lib/platform/db";
import { formatCredits } from "../../../../lib/platform/credits";
import { colors, radius, fontSans, button, shadow, muted } from "../../../../lib/platform/theme";

const POLL_MS = 5000;

// Αγορά credits επιτόπου, χωρίς να φύγεις από εκεί που είσαι.
//
// Μετά το αίτημα αγοράς το παράθυρο μένει ανοιχτό και περιμένει την πίστωση
// (σήμερα με την επιβεβαίωση του διαχειριστή, αργότερα αυτόματα από την
// πληρωμή). Μόλις τα credits φτάσουν, ό,τι είχες ξεκινήσει συνεχίζει με ένα
// πάτημα (onContinue) — η πρόταση δεν χάνεται.
export default function TopUpSheet({ open, onClose, need = 0, balance = 0, onContinue, continueLabel = "Συνέχεια" }) {
  const { refresh } = useAuth();
  const [waiting, setWaiting] = useState(null); // το αίτημα αγοράς που περιμένει
  const [status, setStatus] = useState(null); // 'pending' | 'completed' | 'cancelled'

  useEffect(() => {
    if (!open) {
      setWaiting(null);
      setStatus(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const funded = balance >= need && need > 0;

  // Όσο περιμένει: υπόλοιπο και κατάσταση του αιτήματος, κάθε λίγα δευτερόλεπτα.
  useEffect(() => {
    if (!open || !waiting || funded || status === "cancelled") return;
    let alive = true;
    const tick = async () => {
      await refresh();
      const row = await getCreditPurchase(waiting.id).catch(() => null);
      if (alive && row) setStatus(row.status);
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, waiting, funded, status]);

  if (!open || typeof document === "undefined") return null;

  const short = need > balance;
  let body;
  if (waiting && (funded || status === "completed")) {
    body = (
      <>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Τα credits πιστώθηκαν</div>
        <div style={{ ...muted, fontSize: 13.5, marginTop: 4 }}>Διαθέσιμα {formatCredits(balance)}</div>
        {onContinue && funded ? (
          <button
            type="button"
            style={{ ...button("primary"), width: "100%", marginTop: 18, padding: "14px 18px", fontSize: 15 }}
            onClick={() => {
              onClose();
              onContinue();
            }}
          >
            {continueLabel}
          </button>
        ) : (
          <button type="button" style={{ ...button("primary"), width: "100%", marginTop: 18 }} onClick={onClose}>
            Εντάξει
          </button>
        )}
      </>
    );
  } else if (waiting && status === "cancelled") {
    body = (
      <>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Το αίτημα αγοράς δεν ολοκληρώθηκε</div>
        <div style={{ ...muted, fontSize: 13.5, margin: "4px 0 16px" }}>{waiting.reference}</div>
        <PackagePicker
          need={Math.max(need - balance, 0)}
          onSent={(row) => {
            setWaiting(row);
            setStatus("pending");
          }}
        />
      </>
    );
  } else if (waiting) {
    body = (
      <>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Το αίτημά σου καταχωρήθηκε</div>
        <div style={{ marginTop: 12 }}>
          <PurchaseSummary row={waiting} />
        </div>
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px", background: colors.seaGlass, borderRadius: radius.md }}
        >
          <span className="sf-topup-pulse" aria-hidden="true" />
          <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Αναμονή επιβεβαίωσης της πληρωμής.{onContinue ? " Μόλις πιστωθούν τα credits, συνεχίζεις από εδώ." : ""}
          </span>
        </div>
        <button type="button" style={{ ...button("secondary"), width: "100%", marginTop: 16 }} onClick={onClose}>
          Κλείσιμο
        </button>
      </>
    );
  } else {
    body = (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{short ? "Δεν έχεις αρκετά credits" : "Αγορά credits"}</div>
            <div style={{ ...muted, fontSize: 13.5, marginTop: 4 }}>
              {short ? `Χρειάζεσαι ${formatCredits(need)} · διαθέσιμα ${formatCredits(balance)}` : `Διαθέσιμα ${formatCredits(balance)}`}
            </div>
          </div>
          <button
            type="button"
            aria-label="Κλείσιμο"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: colors.inkSoft, minWidth: 40, minHeight: 40 }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 16 }}>
          <PackagePicker
            need={Math.max(need - balance, 0)}
            onSent={(row) => {
              setWaiting(row);
              setStatus("pending");
            }}
            onPending={(row) => {
              setWaiting(row);
              setStatus("pending");
            }}
          />
        </div>
      </>
    );
  }

  return createPortal(
    <div
      className="sf-topup-sheet"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,40,60,0.38)", zIndex: 80, display: "flex", justifyContent: "center", padding: 12 }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            ".sf-topup-sheet{align-items:flex-end}@media(min-width:640px){.sf-topup-sheet{align-items:center}}" +
            ".sf-topup-pulse{flex:none;width:8px;height:8px;border-radius:50%;background:#C3A164;animation:sfPulse 1.4s ease-in-out infinite}" +
            "@keyframes sfPulse{0%,100%{opacity:.35}50%{opacity:1}}",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Αγορά credits"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          overflowY: "auto",
          boxSizing: "border-box",
          background: colors.card,
          borderRadius: radius.lg + 4,
          boxShadow: shadow.raised,
          padding: "20px 18px 18px",
          fontFamily: fontSans,
          color: colors.ink,
        }}
      >
        {body}
      </div>
    </div>,
    document.body
  );
}
