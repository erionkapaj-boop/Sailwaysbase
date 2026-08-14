"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import DateRangeCalendar from "../components/DateRangeCalendar";
import { SUPPORTED_ROLES, labelForRole, computeCrewHighlights } from "../../../lib/platform/roles";
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
  label,
  badge,
  colors,
  money,
  shadow,
} from "../../../lib/platform/theme";

// Inclusive day count: a 1st→3rd booking is three days of work, not two.
function dayCount(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 86400000) + 1;
}

function SkipperCard({ s, selected, onToggle, days }) {
  const total = days ? s.price_per_day * days : null;
  const highlights = computeCrewHighlights(s);
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
            <div style={{ ...muted, marginTop: 6 }}>
              {s.gender ? `${s.gender} · ` : ""}
              <span style={money}>{s.years_experience}</span> χρόνια εμπειρίας
            </div>
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
          <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
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
  };
  const requestedRoles = (params.get("roles") || "skipper").split(",").filter(Boolean);
  const unsupportedRoles = requestedRoles.filter((r) => !SUPPORTED_ROLES.includes(r));

  const [lookups, setLookups] = useState({ ports: [], boatTypes: [] });
  const [filters, setFilters] = useState({ ...incoming, gender: "" });
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [fee, setFee] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [broadcastDone, setBroadcastDone] = useState(false);

  useEffect(() => {
    listLookups()
      .then(setLookups)
      .catch((err) => setError("Λίστες (λιμάνια/σκάφη) δεν φορτώθηκαν: " + (err.message || String(err))));
    getPlatformSetting("client_request_fee").then(setFee).catch(() => {});
  }, []);

  const runSearch = useCallback(async (f) => {
    setError("");
    setBroadcastDone(false);
    setSelected(new Set());
    setBusy(true);
    try {
      setResults(await searchSkippers(f));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Arriving with a complete filter set from the home page means the user
  // already pressed "Αναζήτηση" — don't make them press it a second time.
  const hasCompleteIncoming = Boolean(
    incoming.startDate && incoming.endDate && incoming.portId && incoming.boatTypeId
  );
  useEffect(() => {
    if (hasCompleteIncoming) {
      runSearch({ ...incoming, gender: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompleteIncoming, incoming.startDate, incoming.endDate, incoming.portId, incoming.boatTypeId]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSearch(e) {
    e.preventDefault();
    await runSearch(filters);
  }

  async function handleBroadcast() {
    if (!session) {
      router.push("/platform/login");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const request = await createBookingRequest({
        startDate: filters.startDate,
        endDate: filters.endDate,
        portId: filters.portId,
        boatTypeId: filters.boatTypeId,
        maxPriceFilter: null,
        genderFilter: filters.gender || null,
      });
      await payAndBroadcast(request.id, Array.from(selected));
      setBroadcastDone(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>Αποτελέσματα</h1>
      <p style={muted}>Δωρεάν, χωρίς δέσμευση. Πληρώνεις μόνο όταν στέλνεις καμπανάκι.</p>

      {unsupportedRoles.length > 0 && (
        <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
          <p style={{ ...muted, margin: 0 }}>
            {unsupportedRoles.map(labelForRole).join(", ")} — δεν είναι ακόμα διαθέσιμοι στην πλατφόρμα.
            Τα αποτελέσματα παρακάτω αφορούν μόνο skippers.
          </p>
        </div>
      )}

      <form onSubmit={handleSearch} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}>
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
            style={input}
            required
            value={filters.portId}
            onChange={(e) => setFilters((f) => ({ ...f, portId: e.target.value }))}
          >
            <option value="">Επιλογή...</option>
            {lookups.ports.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.region})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label}>Τύπος σκάφους</label>
          <select
            style={input}
            required
            value={filters.boatTypeId}
            onChange={(e) => setFilters((f) => ({ ...f, boatTypeId: e.target.value }))}
          >
            <option value="">Επιλογή...</option>
            {lookups.boatTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {/* No max-price filter: each result already shows its own price per
            day, so the client compares directly instead of guessing a ceiling
            up front and silently hiding people just above it. */}
        <div>
          <label style={label}>Φύλο skipper (προαιρετικό)</label>
          <select style={input} value={filters.gender} onChange={(e) => setFilters((f) => ({ ...f, gender: e.target.value }))}>
            <option value="">Αδιάφορο</option>
            <option value="Άνδρας">Άνδρας</option>
            <option value="Γυναίκα">Γυναίκα</option>
          </select>
        </div>
        <div style={{ alignSelf: "end" }}>
          <button style={{ ...button("primary"), width: "100%" }} disabled={busy} type="submit">
            {busy ? "Αναζήτηση..." : "Αναζήτηση"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {results && (
        <div style={{ marginTop: 18 }}>
          <h2 style={h2}>{results.length} διαθέσιμοι skippers</h2>
          {results.map((s) => (
            <SkipperCard
              key={s.id}
              s={s}
              selected={selected.has(s.id)}
              onToggle={toggle}
              days={dayCount(filters.startDate, filters.endDate)}
            />
          ))}

          {results.length > 0 && (
            // A money moment: reads like a receipt line, not a sales pitch.
            <div style={{ ...card, position: "sticky", bottom: 12, boxShadow: shadow.raised }}>
              {broadcastDone ? (
                <div>
                  <p style={{ color: colors.accent, fontWeight: 600, margin: "0 0 14px" }}>
                    ✓ Το καμπανάκι στάλθηκε σε <span style={money}>{selected.size}</span> skippers
                  </p>
                  <button style={button("primary")} onClick={() => router.push("/platform/client")}>
                    Παρακολούθηση αιτήματος
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                        fontSize: 14,
                      }}
                    >
                      <span style={muted}>Επιλεγμένοι skippers</span>
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
                      <span style={{ ...money, fontSize: 17, fontWeight: 600 }}>
                        {fee != null ? `${fee}€` : "—"}
                      </span>
                    </div>
                    <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>
                      Χρεώνεται μία φορά, ανεξάρτητα από το πλήθος των skippers.
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

// useSearchParams needs a Suspense boundary to keep this route statically
// prerenderable.
export default function SearchPage() {
  return (
    <Suspense fallback={<div style={container}>Φόρτωση…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
