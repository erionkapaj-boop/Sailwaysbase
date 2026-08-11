"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
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

const BIO_TAG_LABELS = {
  family_friendly: "Οικογενειακός",
  fishing: "Ψάρεμα",
  diving: "Καταδύσεις",
  party: "Party sailing",
  long_range: "Μεγάλες αποστάσεις",
  islands_expert: "Ειδικός σε νησιά",
};

function SkipperCard({ s, selected, onToggle }) {
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
          <div style={{ ...money, fontSize: 19, fontWeight: 600, whiteSpace: "nowrap" }}>
            {s.price_per_day}€
            <span style={{ ...muted, fontFamily: "inherit", fontSize: 13 }}> /ημέρα</span>
          </div>
        </div>

        <div style={{ margin: "10px 0", fontSize: 14, color: colors.inkSoft }}>
          <span style={{ ...money, color: colors.ink }}>{s.rating_avg ? s.rating_avg.toFixed(1) : "—"}</span>
          {" ★ "}
          <span style={money}>({s.rating_count})</span>
          {" · "}
          {s.reliability_percentage != null ? (
            <>
              <span style={{ ...money, color: colors.ink }}>{s.reliability_percentage}%</span> αξιοπιστία
            </>
          ) : (
            "νέος στην πλατφόρμα"
          )}
        </div>

        {Array.isArray(s.bio) && s.bio.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {s.bio.map((tag) => (
              <span key={tag} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 500 }}>
                {BIO_TAG_LABELS[tag] || tag}
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

export default function SearchPage() {
  const router = useRouter();
  const { session, role } = useAuth();

  const [lookups, setLookups] = useState({ ports: [], boatTypes: [] });
  const [filters, setFilters] = useState({ startDate: "", endDate: "", portId: "", boatTypeId: "", maxPrice: "", gender: "" });
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

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSearch(e) {
    e.preventDefault();
    setError("");
    setBroadcastDone(false);
    setSelected(new Set());
    setBusy(true);
    try {
      const data = await searchSkippers(filters);
      setResults(data);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBroadcast() {
    if (!session) {
      router.push("/platform/login");
      return;
    }
    if (role !== "client") {
      setError("Μόνο λογαριασμός πελάτη μπορεί να στείλει καμπανάκι.");
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
        maxPriceFilter: filters.maxPrice || null,
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
      <h1 style={h1}>Αναζήτηση Skipper</h1>
      <p style={muted}>Δωρεάν, χωρίς δέσμευση. Πληρώνεις μόνο όταν στέλνεις καμπανάκι.</p>

      <form onSubmit={handleSearch} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 }}>
        <div>
          <label style={label}>Από</label>
          <input
            type="date"
            style={input}
            required
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label style={label}>Έως</label>
          <input
            type="date"
            style={input}
            required
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
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
        <div>
          <label style={label}>Μέγιστη τιμή/ημέρα (προαιρετικό)</label>
          <input
            type="number"
            style={input}
            value={filters.maxPrice}
            onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
          />
        </div>
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
            <SkipperCard key={s.id} s={s} selected={selected.has(s.id)} onToggle={toggle} />
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
