"use client";
import { useState } from "react";
import { useAuth } from "../../AuthContext";
import TopUpSheet from "./TopUpSheet";
import { formatCredits } from "../../../../lib/platform/credits";
import { colors, radius, button } from "../../../../lib/platform/theme";

// Διακριτική υπενθύμιση όταν τα credits τελειώνουν, ώστε η επόμενη πρόταση
// να βρίσκει τον επαγγελματία έτοιμο. Από 1 credit και κάτω.
export default function LowCreditsBanner({ threshold = 1 }) {
  const { userRow, readOnly } = useAuth();
  const [open, setOpen] = useState(false);
  const balance = Number(userRow?.wallet_balance ?? 0);
  if (!userRow || readOnly || balance > threshold) return null;

  return (
    <>
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          marginBottom: 16,
          border: `1px solid ${colors.border}`,
          borderLeft: `3px solid ${colors.accent}`,
          borderRadius: radius.lg,
          background: colors.card,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1.45 }}>
          {balance <= 0 ? "Δεν έχεις credits." : `Σου ${balance === 1 ? "έμεινε" : "έμειναν"} ${formatCredits(balance)}.`}{" "}
          <span style={{ color: colors.inkSoft }}>Για την επόμενη πρόταση, απόκτησε credits από τώρα.</span>
        </span>
        <button type="button" style={button("primary")} onClick={() => setOpen(true)}>
          Αγορά credits
        </button>
      </div>
      <TopUpSheet open={open} onClose={() => setOpen(false)} balance={balance} />
    </>
  );
}
