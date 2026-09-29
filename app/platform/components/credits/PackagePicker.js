"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { getCreditOffer, getMyPendingCreditPurchase, requestCreditPurchase } from "../../../../lib/platform/db";
import { formatCredits, PACKAGES } from "../../../../lib/platform/credits";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { trackFlow } from "../../../../lib/platform/health";
import { card, muted, colors, money, button, radius, badge } from "../../../../lib/platform/theme";

const POPULAR = "professional";
const MAX_CUSTOM = 100;

// Η προεπιλογή: το δημοφιλές πακέτο, εκτός αν δεν καλύπτει όσα χρειάζεσαι
// τώρα — τότε το μικρότερο που τα καλύπτει, αλλιώς ακριβώς όσα χρειάζεσαι.
function initialChoice(packages, need) {
  const popular = packages.find((p) => p.key === POPULAR);
  if (popular && popular.credits >= need) return POPULAR;
  const enough = [...packages].sort((a, b) => a.credits - b.credits).find((p) => p.credits >= need);
  return enough ? enough.key : "custom";
}

export function PurchaseSummary({ row }) {
  return (
    <>
      <div style={{ fontSize: 15 }}>
        {[row.package_key && PACKAGES.find((x) => x.key === row.package_key)?.name, formatCredits(row.credits), `${row.price_eur}€`]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div style={{ ...muted, fontSize: 13.5, marginTop: 6 }}>
        Κωδικός αιτήματος <span style={{ ...money, color: colors.ink, fontWeight: 600 }}>{row.reference}</span>
      </div>
    </>
  );
}

// Επιλογή πακέτου και αίτημα αγοράς. Οι τιμές έρχονται από τις Ρυθμίσεις·
// το ποσό το υπολογίζει ξανά η βάση. need: πόσα credits χρειάζονται τώρα.
export default function PackagePicker({ need = 0, onSent, onPending }) {
  const { readOnly } = useAuth();
  const [offer, setOffer] = useState(null);
  const [pending, setPending] = useState(undefined);
  const [choice, setChoice] = useState(POPULAR);
  const [custom, setCustom] = useState(Math.max(1, need));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCreditOffer()
      .then((o) => {
        setOffer(o);
        setChoice(initialChoice(o.packages, need));
      })
      .catch((err) => setError(friendlyError(err)));
    getMyPendingCreditPurchase()
      .then((p) => {
        setPending(p);
        if (p) onPending?.(p);
        // Ροή «Αγορά credits» (0117): άνοιξε → έστειλε αίτημα.
        else trackFlow("topup", "open");
      })
      .catch(() => setPending(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending === undefined || !offer) {
    return error ? <p style={{ color: colors.danger, fontSize: 14 }}>{error}</p> : <p style={muted}>Φόρτωση...</p>;
  }
  if (pending) {
    return (
      <div style={{ ...card, marginBottom: 0, borderLeft: `3px solid ${colors.accent}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Αίτημα αγοράς σε εκκρεμότητα</div>
        <PurchaseSummary row={pending} />
        <p style={{ ...muted, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
          Τα credits πιστώνονται με την επιβεβαίωση της πληρωμής.
        </p>
      </div>
    );
  }

  const price = offer?.creditPrice;
  const packages = offer?.packages || [];
  const customCount = Math.min(MAX_CUSTOM, Math.max(1, Math.floor(Number(custom) || 1)));
  const selected =
    choice === "custom"
      ? { credits: customCount, price: price != null ? customCount * price : null }
      : packages.find((p) => p.key === choice);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const row = await requestCreditPurchase(choice, choice === "custom" ? customCount : null);
      trackFlow("topup", "done");
      onSent?.(row);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const option = (key, content) => {
    const active = choice === key;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => setChoice(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: "100%",
          textAlign: "left",
          padding: "16px 18px",
          marginBottom: 10,
          background: active ? colors.seaGlass : colors.card,
          border: `${active ? 2 : 1}px solid ${active ? colors.ink : colors.border}`,
          borderRadius: radius.lg,
          cursor: "pointer",
          fontFamily: "inherit",
          color: colors.ink,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            flex: "none",
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${active ? colors.ink : colors.border}`,
            boxShadow: active ? `inset 0 0 0 3px ${colors.card}` : "none",
            background: active ? colors.ink : "transparent",
          }}
        />
        {content}
      </button>
    );
  };

  return (
    <>
      <div role="radiogroup" aria-label="Πακέτο">
        {packages.map((p) => {
          const per = p.price / p.credits;
          const off = price ? Math.round((1 - per / price) * 100) : 0;
          return option(
            p.key,
            <span style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{PACKAGES.find((x) => x.key === p.key)?.name}</span>
                {p.key === POPULAR && <span style={{ ...badge("neutral"), marginLeft: 8 }}>Δημοφιλές</span>}
                <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 3 }}>
                  {formatCredits(p.credits)} · {Math.round(per * 100) / 100}€ το credit
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span style={{ ...money, fontSize: 18, fontWeight: 700, display: "block" }}>{p.price}€</span>
                {off > 0 && <span style={{ fontSize: 12.5, color: colors.success }}>−{off}%</span>}
              </span>
            </span>
          );
        })}
        {price != null &&
          option(
            "custom",
            <span style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Άλλος αριθμός</span>
                <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 3 }}>{price}€ το credit</span>
              </span>
              {choice === "custom" && (
                <input
                  type="number"
                  min={1}
                  max={MAX_CUSTOM}
                  step={1}
                  value={custom}
                  aria-label="Αριθμός credits"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCustom(e.target.value)}
                  style={{
                    width: 80,
                    padding: "8px 10px",
                    fontSize: 15,
                    fontFamily: "inherit",
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    textAlign: "center",
                  }}
                />
              )}
            </span>
          )}
      </div>

      {selected && selected.price != null && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "16px 2px",
            marginTop: 6,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ fontSize: 15 }}>Σύνολο · {formatCredits(selected.credits)}</span>
          <span style={{ ...money, fontSize: 22, fontWeight: 700 }}>{selected.price}€</span>
        </div>
      )}

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 10px" }}>{error}</p>}
      <button
        type="button"
        style={{ ...button("primary"), width: "100%", padding: "14px 18px", fontSize: 15 }}
        disabled={busy || readOnly || !selected}
        onClick={send}
      >
        {busy ? "…" : "Αποστολή αιτήματος"}
      </button>
      <p style={{ ...muted, fontSize: 12.5, margin: "12px 0 0", lineHeight: 1.5, textAlign: "center" }}>
        Τα credits πιστώνονται με την επιβεβαίωση της πληρωμής. Δεν λήγουν.
      </p>
    </>
  );
}
