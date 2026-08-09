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
import { container, card, h1, h2, muted, button, input, label, badge, colors } from "../../../lib/platform/theme";

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
    <div style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: s.photo_url ? `url(${s.photo_url}) center/cover` : "#DDE6EA",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={badge(s.tier === "high" ? "success" : s.tier === "low" ? "warn" : "brand")}>
              {s.tier === "high" ? "Top βαθμίδα" : s.tier === "low" ? "Νέος/χαμηλή βαθμίδα" : "Μεσαία βαθμίδα"}
            </span>{" "}
            {s.gender && <span style={muted}> · {s.gender}</span>}
            <span style={muted}> · {s.years_experience} χρόνια εμπειρίας</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{s.price_per_day}€/ημέρα</div>
        </div>
        <div style={{ margin: "6px 0", fontSize: 14 }}>
          ⭐ {s.rating_avg ? s.rating_avg.toFixed(1) : "—"} ({s.rating_count} αξιολογήσεις) ·{" "}
          {s.reliability_percentage != null ? `${s.reliability_percentage}% αξιοπιστία` : "νέος στην πλατφόρμα"}
        </div>
        {Array.isArray(s.bio) && s.bio.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {s.bio.map((tag) => (
              <span key={tag} style={badge("neutral")}>
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
            <div style={{ ...card, position: "sticky", bottom: 12, borderColor: colors.brand }}>
              {broadcastDone ? (
                <div>
                  <p style={{ fontWeight: 700, color: colors.success }}>
                    ✓ Το καμπανάκι στάλθηκε σε {selected.size} skippers!
                  </p>
                  <button style={button("primary")} onClick={() => router.push("/platform/client")}>
                    Παρακολούθηση αιτήματος
                  </button>
                </div>
              ) : (
                <>
                  <p style={muted}>
                    Επιλεγμένοι: <b>{selected.size}</b> · Fee πλατφόρμας:{" "}
                    <b>{fee != null ? `${fee}€` : "..."}</b> (μία φορά, ασχέτως πλήθους)
                  </p>
                  <button
                    style={button("primary")}
                    disabled={selected.size === 0 || busy}
                    onClick={handleBroadcast}
                  >
                    {busy ? "..." : session ? `Πλήρωσε ${fee ?? ""}€ & στείλε καμπανάκι` : "Σύνδεση για αποστολή καμπανακιού"}
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
