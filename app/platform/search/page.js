"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import DateRangeCalendar from "../components/DateRangeCalendar";
import { SUPPORTED_ROLES, labelForRole, computeCrewHighlights } from "../../../lib/platform/roles";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";
import { savePendingBroadcast, takePendingBroadcast } from "../../../lib/platform/pendingBroadcast";
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
} from "../../../lib/platform/theme";

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

function ProfessionalCard({ s, selected, onToggle, days }) {
  const total = days ? s.price_per_day * days : null;
  const highlights = computeCrewHighlights(s);
  const categories = reviewCategoriesForRole(s.role);
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div style={{ ...card, display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: s.photo_url ? `url(${s.photo_url}) center/cover` : "#EFEFF1",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span style={badge(s.tier === "high" ? "success" : s.tier === "low" ? "warn" : "neutral")}>
              {s.tier === "high" ? "Top βαθμίδα" : s.tier === "low" ? "Νέος" : "Μεσαία βαθμίδα"}
            </span>
            {(s.nationality_name || s.languages?.length > 0) && (
              <div style={{ ...muted, marginTop: 6 }}>
                {s.nationality_name}
                {s.nationality_name && s.languages?.length > 0 ? " · " : ""}
                {s.languages?.join(", ")}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            <div style={{ ...money, fontSize: 19, fontWeight: 600 }}>
              {s.price_per_day}€
              <span style={{ ...muted, fontFamily: "inherit", fontSize: 13 }}> /ημέρα</span>
            </div>
            {total != null && (
              <div style={{ ...muted, fontSize: 13, marginTop: 2 }}>
                <span style={money}>{total}€</span> για <span style={money}>{days}</span>{" "}
                {days === 1 ? "ημέρα" : "ημέρες"}
              </div>
            )}
          </div>
        </div>

        <div style={{ margin: "10px 0", fontSize: 14, color: colors.inkSoft, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {s.rating_count > 0 ? (
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
              aria-expanded={showBreakdown}
            >
              <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
            </button>
          ) : (
            <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
          )}
          <span>
            {"· "}
            {s.reliability_percentage != null ? (
              <>
                <span style={{ ...money, color: colors.ink }}>{s.reliability_percentage}%</span> αξιοπιστία
              </>
            ) : (
              "νέος στην πλατφόρμα"
            )}
          </span>
        </div>

        {/* Η ίδια αξιολόγηση σε 6 κατηγορίες — πατώντας πάνω στα αστέρια για
            να δει κανείς τι κρύβεται πίσω από τον γενικό μέσο όρο, αντί να
            τον εμπιστευτεί τυφλά ή να τον αγνοήσει επειδή δεν λέει αρκετά.
            Οι κατηγορίες εξαρτώνται από την ιδιότητα ΑΥΤΟΥ του αποτελέσματος
            (s.role), όχι από ποια ενότητα το δείχνει. */}
        {showBreakdown && s.rating_count > 0 && (
          <div
            style={{
              margin: "0 0 10px",
              padding: "10px 12px",
              background: colors.bgSoft || "#F7F5F0",
              borderRadius: 8,
            }}
          >
            {categories.map((c) => (
              <div
                key={c.key}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "3px 0" }}
              >
                <span style={{ fontSize: 12.5, color: colors.inkSoft }}>{c.label}</span>
                <Stars rating={s[`rating_avg_${c.key}`]} count={s.rating_count} size={11} showEmptyLabel={false} />
              </div>
            ))}
          </div>
        )}

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

        <button style={button(selected ? "primary" : "secondary")} onClick={() => onToggle(s.id)}>
          {selected ? "✓ Επιλέχθηκε" : "Επιλογή"}
        </button>
      </div>
    </div>
  );
}

// One section per requested, supported crew role — each runs its own search
// and its own broadcast. A skipper and a hostess are two separate jobs with
// two separate fees today (the "book both together" nudge is planned for
// later, once hostess has been live a while), so keeping them as two
// independent panels is honest about that rather than implying one checkout
// covers both.
function RoleSection({ role, sharedFilters, lookups, fee, session, router, initial }) {
  const [boatTypeId, setBoatTypeId] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [broadcastDone, setBroadcastDone] = useState(false);
  // Consumed once, the first time a search actually loads results — a plain
  // prop can't survive that long since runSearch() below unconditionally
  // clears `selected` at the start of every call, restore or not.
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
    setRestoredNotice(true);
  }, [initial]);

  const needsBoatType = role === "skipper";
  const days = dayCount(sharedFilters.startDate, sharedFilters.endDate);

  const runSearch = useCallback(async () => {
    setError("");
    setBroadcastDone(false);
    setSelected(new Set());
    setBusy(true);
    try {
      const data = await searchSkippers({
        startDate: sharedFilters.startDate,
        endDate: sharedFilters.endDate,
        portId: sharedFilters.portId,
        boatTypeId: needsBoatType ? boatTypeId : null,
        crewRole: role,
        languageId: sharedFilters.languageId || null,
      });
      setResults(data);
      if (pendingSelectedRef.current) {
        setSelected(new Set(pendingSelectedRef.current));
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
    sharedFilters.portId,
    sharedFilters.languageId,
    needsBoatType,
    boatTypeId,
    role,
  ]);

  const hasCompleteIncoming = Boolean(
    sharedFilters.startDate && sharedFilters.endDate && sharedFilters.portId && (!needsBoatType || sharedFilters.boatTypeId)
  );
  useEffect(() => {
    if (hasCompleteIncoming) {
      if (needsBoatType) setBoatTypeId(sharedFilters.boatTypeId);
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompleteIncoming]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSearch(e) {
    e.preventDefault();
    await runSearch();
  }

  async function handleBroadcast() {
    if (!sharedFilters.partySize || sharedFilters.privateCabin === undefined) {
      setError("Συμπλήρωσε αριθμό ατόμων και ιδιωτική καμπίνα πριν στείλεις το αίτημα.");
      return;
    }
    if (!session) {
      // Nothing below this point has run yet — no request exists, nobody was
      // charged. Save the pick so the trip through login (or register → OTP
      // → set-PIN) doesn't throw it away, then come straight back here.
      savePendingBroadcast({
        role,
        filters: {
          startDate: sharedFilters.startDate,
          endDate: sharedFilters.endDate,
          portId: sharedFilters.portId,
          boatTypeId: needsBoatType ? boatTypeId : "",
          languageId: sharedFilters.languageId || "",
          partySize: sharedFilters.partySize,
          privateCabin: sharedFilters.privateCabin,
        },
        selected: Array.from(selected),
      });
      router.push("/platform/login?next=/platform/search");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const request = await createBookingRequest({
        startDate: sharedFilters.startDate,
        endDate: sharedFilters.endDate,
        portId: sharedFilters.portId,
        boatTypeId: needsBoatType ? boatTypeId : null,
        maxPriceFilter: null,
        crewRole: role,
        partySize: Number(sharedFilters.partySize),
        privateCabin: sharedFilters.privateCabin,
      });
      await payAndBroadcast(request.id, Array.from(selected));
      setBroadcastDone(true);
    } catch (err) {
      setError(BROADCAST_ERRORS[err.message] || err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = labelForRole(role);

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={h2}>{roleLabel}</h2>
      {restoredNotice && (
        <p style={{ ...muted, fontSize: 13, margin: "-6px 0 12px", color: colors.accent }}>
          Οι επιλογές σου διατηρήθηκαν — πάτα ξανά «Πληρωμή &amp; αποστολή» για να ολοκληρώσεις.
        </p>
      )}
      <form
        onSubmit={handleSearch}
        style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}
      >
        {needsBoatType && (
          <div>
            <label style={label}>Τύπος σκάφους</label>
            <select style={select} required value={boatTypeId} onChange={(e) => setBoatTypeId(e.target.value)}>
              <option value="">Επιλογή...</option>
              {lookups.boatTypes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ alignSelf: "end" }}>
          <button style={{ ...button("primary"), width: "100%" }} disabled={busy} type="submit">
            {busy ? "Αναζήτηση..." : "Αναζήτηση"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {results && (
        <div style={{ marginTop: 14 }}>
          <p style={muted}>
            {results.length} διαθέσιμ{results.length === 1 ? "ος" : "οι"} {roleLabel.toLowerCase()}
          </p>
          {results.map((s) => (
            <ProfessionalCard key={s.id} s={s} selected={selected.has(s.id)} onToggle={toggle} days={days} />
          ))}

          {results.length > 0 && (
            <div style={{ ...card, position: "sticky", bottom: 12, boxShadow: shadow.raised }}>
              {broadcastDone ? (
                <div>
                  <p style={{ color: colors.accent, fontWeight: 600, margin: "0 0 14px" }}>
                    ✓ Το καμπανάκι στάλθηκε σε <span style={money}>{selected.size}</span> {roleLabel.toLowerCase()}
                  </p>
                  <button style={button("primary")} onClick={() => router.push("/platform/client")}>
                    Παρακολούθηση αιτήματος
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 14 }}>
                      <span style={muted}>Επιλεγμέν{selected.size === 1 ? "ος/η" : "οι"} {roleLabel.toLowerCase()}</span>
                      <span style={money}>{selected.size}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                        marginTop: 8,
                        paddingTop: 10,
                        borderTop: `1px solid ${colors.border}`,
                        fontSize: 15,
                      }}
                    >
                      <span>Fee πλατφόρμας</span>
                      <span style={{ ...money, fontSize: 17, fontWeight: 600 }}>{fee != null ? `${fee}€` : "—"}</span>
                    </div>
                    <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>
                      Χρεώνεται μία φορά, ανεξάρτητα από το πλήθος των επιλεγμένων.
                    </p>
                  </div>
                  <button
                    style={{ ...button("primary"), width: "100%" }}
                    disabled={selected.size === 0 || busy}
                    onClick={handleBroadcast}
                  >
                    {busy ? "..." : session ? "Πληρωμή & αποστολή καμπανακιού" : "Σύνδεση για αποστολή"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useAuth();

  // Filters arriving from the home page form.
  const incoming = {
    startDate: params.get("start") || "",
    endDate: params.get("end") || "",
    portId: params.get("port") || "",
    boatTypeId: params.get("boat") || "",
    languageId: params.get("lang") || "",
  };
  // sessionStorage doesn't exist during the server render, so this can only
  // be read after mount — reading it any earlier (e.g. a useState lazy
  // initializer) makes the client's first paint disagree with the server's
  // and trips a hydration mismatch. Starts null on every render up to and
  // including hydration; the effect below is what actually resolves it.
  const [pending, setPending] = useState(null);
  const [lookups, setLookups] = useState({ ports: [], boatTypes: [], languages: [] });
  const [filters, setFilters] = useState(incoming);
  const [fee, setFee] = useState(null);

  useEffect(() => {
    const p = takePendingBroadcast();
    if (p) {
      setPending(p);
      setFilters(p.filters);
    }
    // Runs once, right after mount — deliberately not re-checked on every
    // params change, since the marker is single-use by design (see
    // takePendingBroadcast).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestedRoles = (
    params.get("roles") ||
    pending?.role ||
    "skipper"
  ).split(",").filter(Boolean);
  const supportedRoles = requestedRoles.filter((r) => SUPPORTED_ROLES.includes(r));
  const unsupportedRoles = requestedRoles.filter((r) => !SUPPORTED_ROLES.includes(r));

  useEffect(() => {
    listLookups().then(setLookups).catch(() => {});
    getPlatformSetting("client_request_fee").then(setFee).catch(() => {});
  }, []);

  return (
    <div style={container}>
      <h1 style={h1}>Αποτελέσματα</h1>
      <p style={muted}>Δωρεάν, χωρίς δέσμευση. Πληρώνεις μόνο όταν στέλνεις καμπανάκι.</p>

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

      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={label}>Ημερομηνίες</label>
          <DateRangeCalendar
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={({ startDate, endDate }) => setFilters((f) => ({ ...f, startDate, endDate }))}
          />
        </div>
        <div>
          <label style={label}>Λιμάνι/Περιοχή</label>
          <select
            style={select}
            required
            value={filters.portId}
            onChange={(e) => setFilters((f) => ({ ...f, portId: e.target.value }))}
          >
            <option value="">Επιλογή...</option>
            {lookups.ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.regions?.name})
              </option>
            ))}
          </select>
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
        </div>
        <div>
          <label style={label}>Αριθμός ατόμων</label>
          <input
            type="number"
            min={1}
            required
            style={input}
            value={filters.partySize || ""}
            onChange={(e) => setFilters((f) => ({ ...f, partySize: e.target.value }))}
          />
        </div>
        <div>
          <label style={label}>Ιδιωτική καμπίνα για τον επαγγελματία</label>
          <select
            style={select}
            required
            value={filters.privateCabin === undefined ? "" : String(filters.privateCabin)}
            onChange={(e) => setFilters((f) => ({ ...f, privateCabin: e.target.value === "true" }))}
          >
            <option value="">Επιλογή...</option>
            <option value="true">Ναι</option>
            <option value="false">Όχι</option>
          </select>
        </div>
      </div>

      {supportedRoles.map((role) => (
        <RoleSection
          key={role}
          role={role}
          sharedFilters={filters}
          lookups={lookups}
          fee={fee}
          session={session}
          router={router}
          initial={pending && pending.role === role ? pending : null}
        />
      ))}
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
