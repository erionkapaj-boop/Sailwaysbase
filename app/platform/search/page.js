"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import DateRangeCalendar from "../components/DateRangeCalendar";
import BackButton from "../components/BackButton";
import { SUPPORTED_ROLES, labelForRole, computeCrewHighlights } from "../../../lib/platform/roles";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";
import { savePendingBroadcast, takePendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { formatDate } from "../../../lib/platform/notifications";
import {
  listLookups,
  searchSkippers,
  getPlatformSetting,
  createBookingRequest,
  payAndBroadcast,
} from "../../../lib/platform/db";
import {
  container,
  card,
  h1,
  h2,
  muted,
  button,
  input,
  select,
  label,
  badge,
  colors,
  money,
  shadow,
  radius,
  sectionLabel,
} from "../../../lib/platform/theme";

// Quick picks for the region's main ports, sitting above the free-text
// field — a tap fills the same field a keystroke would, it just saves the
// typing for the common cases.
const chip = (active) => ({
  padding: "8px 14px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

const BROADCAST_ERRORS = {
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για το τέλος αιτήματος.",
  invalid_skipper_selection: "Κάποιος από τους επιλεγμένους δεν είναι πλέον διαθέσιμος.",
  no_skippers_selected: "Επίλεξε τουλάχιστον έναν επαγγελματία.",
  already_paid_or_closed: "Αυτό το αίτημα έχει ήδη σταλεί.",
};

// Inclusive day count: a 1st→3rd booking is three days of work, not two.
function dayCount(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 86400000) + 1;
}

// Flag + nationality, age, languages — whichever of the three are actually
// set, in that order, joined the same way everywhere it's shown (card and
// detail sheet alike) instead of each place growing its own separator logic.
function identityLine(s) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${s.nationality_country}`);
  if (s.age) parts.push(`${s.age} ετών`);
  if (s.languages?.length > 0) parts.push(s.languages.join(", "));
  return parts.join(" · ");
}

// Bottom-sheet chrome, matching the pattern already established for the
// availability calendar's day-detail popup (AvailabilityCalendar.js) — same
// look for the same kind of "more about this one thing" overlay.
const sheetOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(22,40,60,0.35)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 40,
  padding: 16,
};
const sheetStyle = {
  background: colors.card,
  borderRadius: radius.lg,
  border: `1px solid ${colors.border}`,
  padding: 20,
  width: "100%",
  maxWidth: 480,
  boxShadow: shadow.raised,
  maxHeight: "85vh",
  overflowY: "auto",
};

function RatingLine({ s }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14, color: colors.inkSoft }}>
      <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
    </div>
  );
}

// The one number that matters most before anything else — its own quiet
// panel instead of a thin row of stars easy to skim past. Only rendered
// once there's an actual average to show; a "0.0" for someone with zero
// reviews would read as a real, poor score instead of simply new.
function RatingStat({ s }) {
  if (!(s.rating_count > 0) || s.rating_avg == null) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: colors.seaGlass,
        borderRadius: radius.md,
      }}
    >
      <span style={{ ...money, fontSize: 26, fontWeight: 700, color: colors.ink, lineHeight: 1 }}>
        {Number(s.rating_avg).toFixed(1)}
      </span>
      {/* Stars already prints its own "4.5 / 5 · 6 αξιολογήσεις" line —
          repeating the count in a second line under the big number here
          would just say the same thing twice. */}
      <Stars rating={s.rating_avg} count={s.rating_count} size={14} showEmptyLabel={false} />
    </div>
  );
}

// The full picture behind the one-line summary on the card: bigger photo,
// every one of the 6 review axes with its own score AND what it actually
// measures (the card only ever had room for the headline number), plus
// everything else already on the card. Selecting from in here doesn't close
// it — comparing candidates means opening several of these in a row without
// losing the ones already picked.
function ProfessionalDetailSheet({ s, selected, onToggle, onClose, days }) {
  const total = days ? s.price_per_day * days : null;
  const highlights = computeCrewHighlights(s);
  const categories = reviewCategoriesForRole(s.role);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={sheetOverlayStyle} onClick={onClose}>
      {/* Tapping anywhere on the open card closes it again — the same
          gesture that opened it, not just the back button or the dark
          backdrop around it. The photo and "Επιλογή" opt out below since
          they each already mean something else.
          stopPropagation here matters, not just style: without it this
          click also bubbles to the overlay's own onClose above, so a
          single tap called onClose() twice — closeDetail() is
          window.history.back(), so that silently popped two history
          entries instead of one and could land several steps further
          back than the tap ever asked for. */}
      <div
        style={sheetStyle}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <BackButton
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (s.photo_url) setPhotoExpanded(true);
            }}
            aria-label="Μεγέθυνση φωτογραφίας"
            style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              background: s.photo_url ? `url(${s.photo_url}) center/cover` : "#EFEFF1",
              border: `1px solid ${colors.border}`,
              flexShrink: 0,
              padding: 0,
              cursor: s.photo_url ? "pointer" : "default",
            }}
          />
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ ...money, fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>
              {s.price_per_day}€
              <span style={{ ...muted, fontFamily: "inherit", fontSize: 13, fontWeight: 400 }}> /ημέρα</span>
            </div>
            {total != null && (
              <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
                <span style={money}>{total}€</span> για <span style={money}>{days}</span>{" "}
                {days === 1 ? "ημέρα" : "ημέρες"}
              </div>
            )}
            {identityLine(s) && <div style={{ ...muted, fontSize: 13, marginTop: 8, lineHeight: 1.4 }}>{identityLine(s)}</div>}
          </div>
        </div>

        <div style={{ margin: "16px 0" }}>
          <RatingStat s={s} />
        </div>

        {highlights.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {highlights.map((h) => (
              <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
                {h}
              </span>
            ))}
          </div>
        )}

        <h3 style={{ ...sectionLabel, margin: "0 0 6px" }}>Αναλυτική αξιολόγηση</h3>
        <div style={{ marginBottom: 24 }}>
          {categories.map((c, i) => {
            const rating = s[`rating_avg_${c.key}`];
            const value = s.rating_count > 0 && rating != null ? Number(rating) : null;
            const pct = value != null ? Math.max(0, Math.min(100, (value / 5) * 100)) : 0;
            return (
              <div
                key={c.key}
                style={{ padding: "12px 0", borderTop: i > 0 ? `1px solid ${colors.border}` : "none" }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</span>
                  {value != null ? (
                    <span style={{ ...money, fontSize: 15, fontWeight: 600, color: colors.ink, flexShrink: 0 }}>
                      {value.toFixed(1)}
                      <span style={{ ...muted, fontFamily: "inherit", fontWeight: 400, fontSize: 12 }}> / 5</span>
                    </span>
                  ) : (
                    <span style={{ ...muted, fontSize: 12.5, flexShrink: 0 }}>Καμία ακόμα</span>
                  )}
                </div>
                {/* A bar per category reads at a glance without six rows of
                    nearly-identical star icons competing for attention —
                    the same reason review breakdowns elsewhere favour bars
                    over repeating a 5-star row per line. */}
                <div style={{ height: 5, borderRadius: radius.pill, background: colors.border, marginTop: 7, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: colors.accent,
                      borderRadius: radius.pill,
                    }}
                  />
                </div>
                <p style={{ ...muted, fontSize: 12, margin: "7px 0 0", lineHeight: 1.4 }}>{c.hint}</p>
              </div>
            );
          })}
        </div>

        <button
          style={{ ...button(selected ? "primary" : "secondary"), width: "100%" }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(s.id);
          }}
        >
          {selected ? "✓ Επιλέχθηκε" : "Επιλογή"}
        </button>
      </div>

      {photoExpanded && s.photo_url && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setPhotoExpanded(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(22,40,60,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.photo_url}
            alt=""
            style={{ maxWidth: "min(100%, 420px)", maxHeight: "80vh", borderRadius: radius.lg, objectFit: "contain" }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPhotoExpanded(false);
            }}
            aria-label="Κλείσιμο"
            style={{
              position: "fixed",
              top: 18,
              right: 18,
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.9)",
              color: colors.ink,
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function ProfessionalCard({ s, selected, onToggle, days }) {
  const total = days ? s.price_per_day * days : null;
  const highlights = computeCrewHighlights(s);
  const [showDetail, setShowDetail] = useState(false);

  // Same reasoning as the wizard (see HomeEntry/CrewSearchFlow): without a
  // real history entry, the phone's own back gesture has no idea this sheet
  // is "in front of" the results list and would leave the search page
  // entirely on the first press instead of just closing the sheet — exactly
  // the moment someone who tapped the wrong card wants a plain, expected
  // back to work.
  useEffect(() => {
    function onPopState(e) {
      if (!e.state?.sfDetailOpen) setShowDetail(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openDetail() {
    window.history.pushState({ sfDetailOpen: true }, "");
    setShowDetail(true);
  }

  // Every close path (backdrop tap, "← Πίσω", tapping the open card, Escape)
  // funnels through here so the device's back button and the on-screen ones
  // always agree — going back once always means exactly one step back.
  function closeDetail() {
    window.history.back();
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openDetail();
        }}
        style={{ ...card, display: "flex", gap: 16, alignItems: "flex-start", cursor: "pointer", boxShadow: shadow.card }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: s.photo_url ? `url(${s.photo_url}) center/cover` : "#EFEFF1",
            border: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Same order as the detail sheet (price, then the stay total,
              then who they are) — the two views read as one continuous
              profile instead of two different layouts for the same data. */}
          <div style={{ ...money, fontSize: 19, fontWeight: 700, lineHeight: 1.15 }}>
            {s.price_per_day}€
            <span style={{ ...muted, fontFamily: "inherit", fontSize: 13, fontWeight: 400 }}> /ημέρα</span>
          </div>
          {total != null && (
            <div style={{ ...muted, fontSize: 13, marginTop: 2 }}>
              <span style={money}>{total}€</span> για <span style={money}>{days}</span>{" "}
              {days === 1 ? "ημέρα" : "ημέρες"}
            </div>
          )}
          {identityLine(s) && <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>{identityLine(s)}</div>}

          <div style={{ margin: "10px 0" }}>
            <RatingLine s={s} />
          </div>

          {/* Highlights are derived, never self-written — see computeCrewHighlights. */}
          {highlights.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {highlights.map((h) => (
                <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
                  {h}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              style={button(selected ? "primary" : "secondary")}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(s.id);
              }}
            >
              {selected ? "✓ Επιλέχθηκε" : "Επιλογή"}
            </button>
            {/* The only thing on the card that says "there's more behind this"
                — without it, tapping anywhere else looked identical to tapping
                nothing at all. */}
            <span style={{ ...muted, fontSize: 13, color: colors.accent }}>Δες πλήρες προφίλ →</span>
          </div>
        </div>
      </div>

      {showDetail && (
        <ProfessionalDetailSheet s={s} selected={selected} onToggle={onToggle} onClose={closeDetail} days={days} />
      )}
    </>
  );
}

// One section per requested, supported crew role — each runs its own search,
// but picking is shared: everyone selected across every open role feeds one
// combined checkout at the bottom of the page (see Checkout below), so a
// client putting together a full crew — a skipper, a hostess, two cooks —
// reviews and sends it all as one action instead of once per role.
function RoleSection({
  role,
  sharedFilters,
  lookups,
  session,
  initial,
  validateShared,
  showFullFilters,
  selected,
  onToggle,
  onSetSelection,
  onBoatTypeChange,
}) {
  const [boatTypeId, setBoatTypeId] = useState("");
  const [boatTypeError, setBoatTypeError] = useState(false);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The checkout at the bottom of the page needs to know which boat type
  // this section currently has selected (skipper only) at the moment it
  // actually sends — reported on every change rather than read once, since
  // "Αλλαγή" can reopen this field after the initial search already ran.
  useEffect(() => {
    onBoatTypeChange(boatTypeId);
  }, [boatTypeId, onBoatTypeChange]);

  // Consumed once, the first time a search actually loads results — a plain
  // prop can't survive that long since runSearch() below unconditionally
  // clears the selection at the start of every call, restore or not.
  const pendingSelectedRef = useRef(null);
  const [restoredNotice, setRestoredNotice] = useState(false);

  // `initial` often arrives a render or two after this component already
  // mounted (the parent only resolves sessionStorage in its own effect,
  // post-hydration) — a lazy useState/useRef initializer would miss it
  // entirely for the default role, so the restore has to react to the prop
  // rather than seed from it once.
  useEffect(() => {
    if (!initial) return;
    pendingSelectedRef.current = initial.selected?.length ? initial.selected : null;
    if (initial.boatTypeId) setBoatTypeId(initial.boatTypeId);
    if (initial.selected?.length) setRestoredNotice(true);
  }, [initial]);

  const needsBoatType = role === "skipper";
  const days = dayCount(sharedFilters.startDate, sharedFilters.endDate);

  // Accepts an explicit boat type rather than always reading the `boatTypeId`
  // state: the auto-search effect below calls this in the very same tick as
  // setBoatTypeId(sharedFilters.boatTypeId), and that update isn't visible
  // yet — reading the state here would send boatTypeId "" (still the initial
  // value) on that first, automatic search. An empty boat type isn't merely
  // "no filter": search_available_skippers requires bt.boat_type_id to equal
  // it, and nothing ever equals null, so every skipper was silently excluded
  // the moment a search arrived already answered from the wizard.
  const runSearch = useCallback(async (boatTypeIdOverride) => {
    setError("");
    onSetSelection([]);
    setBusy(true);
    try {
      const data = await searchSkippers({
        startDate: sharedFilters.startDate,
        endDate: sharedFilters.endDate,
        regionId: sharedFilters.regionId,
        boatTypeId: needsBoatType ? (boatTypeIdOverride !== undefined ? boatTypeIdOverride : boatTypeId) : null,
        crewRole: role,
        languageId: sharedFilters.languageId || null,
      });
      setResults(data);
      if (pendingSelectedRef.current) {
        onSetSelection(pendingSelectedRef.current);
        pendingSelectedRef.current = null;
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [
    sharedFilters.startDate,
    sharedFilters.endDate,
    sharedFilters.regionId,
    sharedFilters.languageId,
    needsBoatType,
    boatTypeId,
    role,
    onSetSelection,
  ]);

  const hasCompleteIncoming = Boolean(
    sharedFilters.startDate && sharedFilters.endDate && sharedFilters.regionId && (!needsBoatType || sharedFilters.boatTypeId)
  );
  useEffect(() => {
    if (hasCompleteIncoming) {
      if (needsBoatType) setBoatTypeId(sharedFilters.boatTypeId);
      runSearch(needsBoatType ? sharedFilters.boatTypeId : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompleteIncoming]);

  async function handleSearch(e) {
    e.preventDefault();
    // All the shared fields (dates, region, departure point, party size,
    // private cabin) plus this section's own boat type (skipper only) must
    // be filled before a search runs — otherwise whoever gets this far ends
    // up on the broadcast step still missing something. Whatever's empty is
    // flagged in place instead of just failing later.
    const sharedOk = validateShared();
    const boatMissing = needsBoatType && !boatTypeId;
    setBoatTypeError(boatMissing);
    if (!sharedOk || boatMissing) return;
    await runSearch();
  }

  const roleLabel = labelForRole(role);

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={h2}>{roleLabel}</h2>
      {restoredNotice && (
        <p style={{ ...muted, fontSize: 13, margin: "-6px 0 12px", color: colors.accent }}>
          Οι επιλογές σου διατηρήθηκαν — θα τις βρεις παρακάτω, στο σύνολο της παραγγελίας.
        </p>
      )}
      {/* Same rule as the shared block above: a boat type that arrived
          already chosen (the wizard's own "Τι σκάφος;" step) has no reason
          to be re-asked here too — the whole per-role form only reappears
          once "Αλλαγή" reopens editing. */}
      {showFullFilters && (
        <form
          onSubmit={handleSearch}
          style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}
        >
          {needsBoatType && (
            <div>
              <label style={label}>Τύπος σκάφους</label>
              <select
                style={boatTypeError ? { ...select, border: `1px solid ${colors.danger}` } : select}
                value={boatTypeId}
                onChange={(e) => {
                  setBoatTypeId(e.target.value);
                  setBoatTypeError(false);
                }}
              >
                <option value="">Επιλογή...</option>
                {lookups.boatTypes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {boatTypeError && (
                <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "4px 0 0" }}>Υποχρεωτικό πεδίο.</p>
              )}
            </div>
          )}
          <div style={{ alignSelf: "end" }}>
            <button style={{ ...button("primary"), width: "100%" }} disabled={busy} type="submit">
              {busy ? "Αναζήτηση..." : "Αναζήτηση"}
            </button>
          </div>
        </form>
      )}

      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {results && (
        <div style={{ marginTop: 14 }}>
          <p style={muted}>
            {results.length} διαθέσιμ{results.length === 1 ? "ος" : "οι"} {roleLabel.toLowerCase()}
          </p>

          {/* Χωρίς αυτό, τίποτα στη σελίδα δεν λέει στον πελάτη ότι το
              "Επιλογή" είναι πολλαπλής επιλογής, ούτε ότι μπορεί να κάνει το
              ίδιο και σε άλλους ρόλους παρακάτω πριν στείλει οτιδήποτε — η
              καθοδήγηση πρέπει να έρχεται πριν αρχίσει να επιλέγει. */}
          {results.length > 0 && (
            <div style={{ ...card, background: colors.bgSoft || "#F7F5F0", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                Μπορείς να επιλέξεις όσους {roleLabel.toLowerCase()} θέλεις πατώντας «Επιλογή» σε καθέναν — και να
                κάνεις το ίδιο σε κάθε άλλο ρόλο πιο κάτω, αν έψαχνες παραπάνω από έναν. Στο τέλος της σελίδας θα δεις
                τι κοστίζει συνολικά και θα επιβεβαιώσεις πριν σταλεί οτιδήποτε.
              </p>
            </div>
          )}

          {results.map((s) => (
            <ProfessionalCard key={s.id} s={s} selected={selected.has(s.id)} onToggle={onToggle} days={days} />
          ))}

          {results.length > 0 && (
            <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 14 }}>
                Επιλεγμέν{selected.size === 1 ? "ος/η" : "οι"} {roleLabel.toLowerCase()}
              </span>
              <span style={{ ...money, fontSize: 17, fontWeight: 600 }}>{selected.size}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One combined checkout for the whole page, however many roles are open —
// a client browsing skipper and hostess results together picks people in
// both, sees one running total here, and sends everything with a single
// action instead of a separate confirm-and-pay per role. Renders nothing
// until at least one role has a pick (or the send has actually gone
// through), so an empty page never carries a checkout bar with nothing in
// it.
function Checkout({ supportedRoles, selectionsByRole, boatTypesByRole, filters, fee, session, router }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentRoles, setSentRoles] = useState(new Set());
  const [done, setDone] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const activeRoles = supportedRoles.filter((r) => (selectionsByRole[r]?.size || 0) > 0);
  const totalSelected = activeRoles.reduce((n, r) => n + selectionsByRole[r].size, 0);
  const totalFee = fee != null ? activeRoles.length * fee : null;

  if (activeRoles.length === 0 && !done) return null;

  async function handleCheckout() {
    if (!session) {
      // Nothing below this line has run yet (no request created, nothing
      // charged) — there's nothing to lose by sending whoever isn't signed
      // in to log in first and letting them finish from where they left
      // off. Every role on the page is saved, not just the ones with a
      // pick yet, so a role still being browsed re-renders after login too.
      const selections = {};
      for (const role of supportedRoles) {
        const set = selectionsByRole[role];
        if (!set || set.size === 0) continue;
        selections[role] = { boatTypeId: boatTypesByRole[role] || "", selected: Array.from(set) };
      }
      savePendingBroadcast({
        roles: supportedRoles,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          regionId: filters.regionId,
          departurePoint: filters.departurePoint || "",
          // Shared page-level value the skipper section's own auto-search
          // reads (see RoleSection's hasCompleteIncoming) — only skipper
          // ever cares, but it has to survive the round trip regardless of
          // whether skipper itself has a pick yet.
          boatTypeId: boatTypesByRole.skipper || "",
          languageId: filters.languageId || "",
          partySize: filters.partySize,
          privateCabin: filters.privateCabin,
        },
        selections,
      });
      router.push("/platform/login?next=/platform/search");
      return;
    }
    if (!filters.partySize || filters.privateCabin === undefined) {
      setError("Συμπλήρωσε αριθμό ατόμων και ιδιωτική καμπίνα πριν στείλεις το αίτημα.");
      return;
    }
    setError("");
    setBusy(true);
    // Already-sent roles are skipped so a retry after a partial failure
    // (say hostess went through, cook then failed) only resends what
    // actually failed — never a second charge for a role that already
    // went out.
    const nowSent = new Set(sentRoles);
    try {
      for (const role of activeRoles) {
        if (nowSent.has(role)) continue;
        const request = await createBookingRequest({
          startDate: filters.startDate,
          endDate: filters.endDate,
          regionId: filters.regionId,
          departurePoint: filters.departurePoint,
          boatTypeId: role === "skipper" ? boatTypesByRole[role] || null : null,
          maxPriceFilter: null,
          crewRole: role,
          partySize: Number(filters.partySize),
          privateCabin: filters.privateCabin,
        });
        await payAndBroadcast(request.id, Array.from(selectionsByRole[role]));
        nowSent.add(role);
        setSentRoles(new Set(nowSent));
      }
      setDone(true);
    } catch (err) {
      setError(BROADCAST_ERRORS[err.message] || err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ ...card, boxShadow: shadow.raised }}>
        {done ? (
          <div>
            <p style={{ color: colors.accent, fontWeight: 600, margin: "0 0 14px" }}>
              ✓ Το αίτημα στάλθηκε σε <span style={money}>{totalSelected}</span>{" "}
              {totalSelected === 1 ? "επαγγελματία" : "επαγγελματίες"}
              {activeRoles.length > 1
                ? ` (${activeRoles.map((r) => `${selectionsByRole[r].size} ${labelForRole(r).toLowerCase()}`).join(", ")})`
                : ""}
            </p>
            <button style={button("primary")} onClick={() => router.push("/platform/requests")}>
              Παρακολούθηση αιτήματος
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ ...h2, fontSize: 16, margin: "0 0 12px" }}>Η παραγγελία σου</h3>

            {activeRoles.map((role) => (
              <div
                key={role}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}
              >
                <span>{labelForRole(role)}</span>
                <span style={money}>{selectionsByRole[role].size}</span>
              </div>
            ))}

            <div style={{ padding: "12px 14px", background: colors.seaGlass, borderRadius: radius.md, margin: "10px 0 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 14 }}>Τέλος πλατφόρμας</span>
                <span style={{ ...money, fontSize: 18, fontWeight: 700 }}>{totalFee != null ? `${totalFee}€` : "—"}</span>
              </div>
              <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
                {fee != null ? `${fee}€` : "—"} για κάθε ρόλο που επιλέγεις, ανεξάρτητα από πόσους υποψήφιους διάλεξες
                μέσα σε αυτόν. Κάθε αίτημα στέλνεται σε όλους τους επιλεγμένους μαζί, ανά ρόλο· ο πρώτος που θα το
                αποδεχτεί αναλαμβάνει εκείνο το κομμάτι.
              </p>
            </div>

            {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}

            <button style={{ ...button("primary"), width: "100%" }} disabled={busy} onClick={handleCheckout}>
              {busy ? "..." : session ? "Αποστολή αιτημάτων" : "Σύνδεση για αποστολή"}
            </button>
            <p style={{ ...muted, fontSize: 12, margin: "10px 0 0", textAlign: "center", lineHeight: 1.5 }}>
              Πατώντας «Αποστολή αιτημάτων» αποδέχεσαι την παραπάνω χρέωση και τους{" "}
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: colors.inkSoft,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Όρους Χρήσης
              </button>
              .
            </p>
          </>
        )}
      </div>

      {termsOpen && (
        <div style={sheetOverlayStyle} onClick={() => setTermsOpen(false)}>
          <div style={{ ...sheetStyle, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...h2, fontSize: 16, margin: "0 0 10px" }}>Όροι χρήσης</h3>
            <p style={{ ...muted, lineHeight: 1.6, marginBottom: 20 }}>Το κείμενο των όρων χρήσης ετοιμάζεται.</p>
            <button style={{ ...button("secondary"), width: "100%" }} onClick={() => setTermsOpen(false)}>
              Κλείσιμο
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useAuth();

  // Filters arriving from the search wizard.
  const incoming = {
    startDate: params.get("start") || "",
    endDate: params.get("end") || "",
    regionId: params.get("region") || "",
    departurePoint: params.get("point") || "",
    boatTypeId: params.get("boat") || "",
    languageId: params.get("lang") || "",
    partySize: params.get("party") || "",
    privateCabin: params.get("cabin") === "true" ? true : params.get("cabin") === "false" ? false : undefined,
  };
  // sessionStorage doesn't exist during the server render, so this can only
  // be read after mount — reading it any earlier (e.g. a useState lazy
  // initializer) makes the client's first paint disagree with the server's
  // and trips a hydration mismatch. Starts null on every render up to and
  // including hydration; the effect below is what actually resolves it.
  const [pending, setPending] = useState(null);
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [], languages: [], regions: [] });
  const [filters, setFilters] = useState(incoming);
  const [fee, setFee] = useState(null);
  // Who's picked, per role — lifted up from each RoleSection rather than
  // owned there, so a single checkout at the bottom of the page can see
  // (and send) everyone selected across every open role at once, instead of
  // each section only knowing about its own picks.
  const [selectionsByRole, setSelectionsByRole] = useState({});
  const [boatTypesByRole, setBoatTypesByRole] = useState({});

  function getRoleSelection(role) {
    return selectionsByRole[role] || new Set();
  }
  function setRoleSelection(role, ids) {
    setSelectionsByRole((prev) => ({ ...prev, [role]: new Set(ids) }));
  }
  function toggleRoleSelection(role, id) {
    setSelectionsByRole((prev) => {
      const next = new Set(prev[role] || []);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, [role]: next };
    });
  }
  function setRoleBoatType(role, boatTypeId) {
    setBoatTypesByRole((prev) => (prev[role] === boatTypeId ? prev : { ...prev, [role]: boatTypeId }));
  }
  // Which shared fields are missing the moment "Αναζήτηση" is pressed — not
  // updated live as the user types elsewhere, only cleared field-by-field as
  // each one gets filled in (see clearFieldError), so fixing one doesn't
  // silently blank out the flags on the others.
  const [fieldErrors, setFieldErrors] = useState({});

  function clearFieldError(key) {
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  // Every shared field is required before a search can run — language stays
  // exempt, it's explicitly optional. Whatever's missing is flagged so the
  // form points at exactly what still needs filling in, rather than the
  // search just quietly doing nothing or failing later at broadcast time.
  function validateShared() {
    const errors = {};
    if (!filters.startDate || !filters.endDate) errors.dates = true;
    if (!filters.regionId) errors.regionId = true;
    if (!filters.departurePoint || !filters.departurePoint.trim()) errors.departurePoint = true;
    if (!filters.partySize) errors.partySize = true;
    if (filters.privateCabin === undefined) errors.privateCabin = true;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Arriving from the wizard already answered everything this block covers —
  // re-showing the whole form here made someone re-read choices they'd
  // literally just made a step earlier. Collapsed to a one-line summary
  // whenever the incoming state is already complete; "Αλλαγή" reopens it in
  // place for anyone who does want to change something.
  function isComplete(f) {
    return Boolean(
      f.startDate && f.endDate && f.regionId && f.departurePoint && f.partySize && f.privateCabin !== undefined
    );
  }
  const [showFullFilters, setShowFullFilters] = useState(!isComplete(incoming));

  useEffect(() => {
    const p = takePendingBroadcast();
    if (p) {
      setPending(p);
      setFilters(p.filters);
      // The pending-restore path lands back on a bare /platform/search (no
      // query string), so the collapse decision above — made from `incoming`
      // — couldn't see these values yet. Same rule, just applied once the
      // restored filters are actually known.
      if (isComplete(p.filters || {})) {
        setShowFullFilters(false);
      }
    }
    // Runs once, right after mount — deliberately not re-checked on every
    // params change, since the marker is single-use by design (see
    // takePendingBroadcast).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestedRoles = (
    params.get("roles") ||
    (pending?.roles || []).join(",") ||
    "skipper"
  ).split(",").filter(Boolean);
  const supportedRoles = requestedRoles.filter((r) => SUPPORTED_ROLES.includes(r));
  const unsupportedRoles = requestedRoles.filter((r) => !SUPPORTED_ROLES.includes(r));

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
    getPlatformSetting("client_request_fee").then(setFee).catch(() => {});
  }, []);

  // The chosen region's curated ports, offered as quick picks above the
  // free-text field — same pattern as the wizard's own port step.
  const portsInRegion = lookups.ports.filter((p) => p.region_id === filters.regionId);
  const regionName = lookups.regions.find((r) => r.id === filters.regionId)?.name;
  const boatTypeName = lookups.boatTypes.find((b) => b.id === filters.boatTypeId)?.name;

  return (
    <div style={container}>
      <BackButton onClick={() => setShowFullFilters(true)} />
      <h1 style={{ ...h1, marginTop: 14 }}>Αποτελέσματα</h1>
      <p style={muted}>Δωρεάν, χωρίς δέσμευση. Πληρώνεις μόνο όταν στέλνεις αίτημα.</p>

      {unsupportedRoles.length > 0 && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
          <p style={{ ...muted, margin: 0 }}>
            {unsupportedRoles.map(labelForRole).join(", ")} — δεν είναι ακόμα διαθέσιμοι στην πλατφόρμα.
            {supportedRoles.length > 0
              ? " Τα αποτελέσματα παρακάτω αφορούν μόνο " + supportedRoles.map(labelForRole).join(", ") + "."
              : ""}
          </p>
        </div>
      )}

      {/* Collapsed to a one-line recap whenever these arrived already
          answered (the wizard) — re-showing the whole form here made anyone
          coming from it re-read choices they'd just made a step earlier.
          "Αλλαγή" reopens it in place for anyone who does want to change
          something. */}
      {showFullFilters ? (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}>
          <div
            style={{
              gridColumn: "1 / -1",
              ...(fieldErrors.dates ? { border: `1px solid ${colors.danger}`, borderRadius: radius.md, padding: 10 } : {}),
            }}
          >
            <label style={label}>Ημερομηνίες</label>
            <DateRangeCalendar
              startDate={filters.startDate}
              endDate={filters.endDate}
              onChange={({ startDate, endDate }) => {
                setFilters((f) => ({ ...f, startDate, endDate }));
                clearFieldError("dates");
              }}
            />
            {fieldErrors.dates && (
              <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "6px 0 0" }}>Επίλεξε ημερομηνίες.</p>
            )}
          </div>
          <div>
            <label style={label}>Περιοχή</label>
            <select
              style={fieldErrors.regionId ? { ...select, border: `1px solid ${colors.danger}` } : select}
              value={filters.regionId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, regionId: e.target.value }));
                clearFieldError("regionId");
              }}
            >
              <option value="">Επιλογή...</option>
              {lookups.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {fieldErrors.regionId && (
              <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "4px 0 0" }}>Υποχρεωτικό πεδίο.</p>
            )}
          </div>
          <div style={portsInRegion.length > 0 ? { gridColumn: "1 / -1" } : undefined}>
            <label style={label}>Λιμάνι αναχώρησης</label>
            {portsInRegion.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 8px" }}>
                {portsInRegion.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={chip(filters.departurePoint === p.name)}
                    onClick={() => {
                      setFilters((f) => ({ ...f, departurePoint: p.name }));
                      clearFieldError("departurePoint");
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              style={fieldErrors.departurePoint ? { ...input, border: `1px solid ${colors.danger}` } : input}
              placeholder="π.χ. Καλλιθέα"
              value={filters.departurePoint || ""}
              onChange={(e) => {
                setFilters((f) => ({ ...f, departurePoint: e.target.value }));
                clearFieldError("departurePoint");
              }}
            />
            {fieldErrors.departurePoint && (
              <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "4px 0 0" }}>Υποχρεωτικό πεδίο.</p>
            )}
          </div>
          <div>
            <label style={label}>Γλώσσα (προαιρετικό)</label>
            <select
              style={select}
              value={filters.languageId || ""}
              onChange={(e) => setFilters((f) => ({ ...f, languageId: e.target.value }))}
            >
              <option value="">Αδιάφορο</option>
              {lookups.languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
              Θα δεις μόνο επαγγελματίες που μιλάνε αυτή τη γλώσσα.
            </p>
          </div>
          <div>
            <label style={label}>Αριθμός ατόμων</label>
            <input
              type="number"
              min={1}
              style={fieldErrors.partySize ? { ...input, border: `1px solid ${colors.danger}` } : input}
              value={filters.partySize || ""}
              onChange={(e) => {
                setFilters((f) => ({ ...f, partySize: e.target.value }));
                clearFieldError("partySize");
              }}
            />
            {fieldErrors.partySize ? (
              <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "4px 0 0" }}>Υποχρεωτικό πεδίο.</p>
            ) : (
              <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                Πόσα άτομα θα είναι συνολικά στο ταξίδι — το βλέπει ο επαγγελματίας πριν αποφασίσει.
              </p>
            )}
          </div>
          <div>
            <label style={label}>Ιδιωτική καμπίνα για τον επαγγελματία</label>
            <select
              style={fieldErrors.privateCabin ? { ...select, border: `1px solid ${colors.danger}` } : select}
              value={filters.privateCabin === undefined ? "" : String(filters.privateCabin)}
              onChange={(e) => {
                setFilters((f) => ({ ...f, privateCabin: e.target.value === "true" }));
                clearFieldError("privateCabin");
              }}
            >
              <option value="">Επιλογή...</option>
              <option value="true">Ναι</option>
              <option value="false">Όχι</option>
            </select>
            {fieldErrors.privateCabin && (
              <p style={{ ...muted, color: colors.danger, fontSize: 12, margin: "4px 0 0" }}>Υποχρεωτικό πεδίο.</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14 }}>
            <b style={{ ...money, color: colors.ink }}>
              {formatDate(filters.startDate)} → {formatDate(filters.endDate)}
            </b>
            <span style={muted}>
              {" · "}
              {regionName}
              {filters.departurePoint ? ` · ${filters.departurePoint}` : ""}
              {" · "}
              {filters.partySize} άτομα
              {" · "}
              Ιδιωτική καμπίνα: {filters.privateCabin ? "Ναι" : "Όχι"}
              {boatTypeName ? ` · ${boatTypeName}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowFullFilters(true)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.accent, fontSize: 13.5, fontFamily: "inherit" }}
          >
            Αλλαγή
          </button>
        </div>
      )}

      {supportedRoles.map((role) => (
        <RoleSection
          key={role}
          role={role}
          sharedFilters={filters}
          lookups={lookups}
          session={session}
          initial={
            pending?.selections?.[role]
              ? { selected: pending.selections[role].selected, boatTypeId: pending.selections[role].boatTypeId }
              : null
          }
          validateShared={validateShared}
          showFullFilters={showFullFilters}
          selected={getRoleSelection(role)}
          onToggle={(id) => toggleRoleSelection(role, id)}
          onSetSelection={(ids) => setRoleSelection(role, ids)}
          onBoatTypeChange={(boatTypeId) => setRoleBoatType(role, boatTypeId)}
        />
      ))}

      <Checkout
        supportedRoles={supportedRoles}
        selectionsByRole={selectionsByRole}
        boatTypesByRole={boatTypesByRole}
        filters={filters}
        fee={fee}
        session={session}
        router={router}
      />
    </div>
  );
}

// useSearchParams needs a Suspense boundary to keep this route statically
// prerenderable.
export default function SearchPage() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
