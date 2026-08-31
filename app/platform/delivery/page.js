"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import BackButton from "../components/BackButton";
import { labelForRole } from "../../../lib/platform/roles";
import { formatMoney } from "../../../lib/platform/notifications";
import {
  getPlatformSetting,
  createDeliveryRequest,
  createDeliveryRoleRequest,
  searchDeliveryCandidates,
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
  colors,
  money,
  radius,
  sectionLabel,
} from "../../../lib/platform/theme";

const REQUEST_ERRORS = {
  no_client_profile: "Χρειάζεται λογαριασμός πελάτη.",
  invalid_distance: "Τα μίλια πρέπει να είναι θετικός αριθμός.",
  invalid_date_mode: "Μη έγκυρος τύπος ημερομηνίας.",
};

const ROLE_ERRORS = {
  invalid_price: "Μη έγκυρη τιμή.",
  no_candidates_selected: "Επίλεξε τουλάχιστον έναν υποψήφιο.",
  invalid_candidate_selection: "Κάποιος από τους επιλεγμένους δεν είναι πλέον διαθέσιμος για μεταφορές.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για αυτή τη χρέωση.",
  not_owner: "Δεν έχεις πρόσβαση σε αυτό το αίτημα.",
};

function identityLine(s) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${s.nationality_country}`);
  if (s.age) parts.push(`${s.age} ετών`);
  if (s.languages?.length > 0) parts.push(s.languages.join(", "));
  return parts.join(" · ");
}

// Η φόρμουλα της πλατφόρμας — ίδια με το create_delivery_role_request στη
// βάση — υπολογισμένη κι εδώ, μόνο για προεπισκόπηση πριν τη χρέωση. Η
// πραγματική χρέωση γίνεται πάντα server-side, ποτέ με βάση αυτόν τον
// υπολογισμό.
function estimateFee(settings, role, miles) {
  if (!settings || !miles) return null;
  const rate = role === "skipper" ? settings.skipperRate : settings.deckhandRate;
  if (rate == null || settings.pct == null || settings.minFee == null) return null;
  const base = miles * rate;
  const commission = base * (settings.pct / 100);
  const clientFee = Math.max(settings.minFee, commission - settings.minFee);
  return { clientFee: round2(clientFee), professionalFee: settings.minFee };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Το εκτιμώμενο εύρος ημερομηνιών ενός αιτήματος — departure_date ± flexible_days
// — με το οποίο ταιριάζει η αναζήτηση υποψηφίων (search_delivery_candidates).
// Καθαρή αριθμητική string ημερομηνιών (χωρίς Date/timezone) — ίδιο σκεπτικό
// με το formatDate στο notifications.js.
function addDays(isoDate, days) {
  if (!isoDate) return isoDate;
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function CandidateCard({ s, selected, onToggle }) {
  return (
    <div
      style={{
        ...card,
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: "12px 14px",
        border: `1px solid ${selected ? colors.ink : colors.border}`,
        cursor: "pointer",
      }}
      onClick={() => onToggle(s.id)}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: s.photo_url ? `url(${s.photo_url}) center/cover` : "#EFEFF1",
          border: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {identityLine(s) && <div style={{ fontSize: 13.5 }}>{identityLine(s)}</div>}
        <div style={{ marginTop: 3 }}>
          <Stars rating={s.rating_avg} count={s.rating_count} size={12} />
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(s.id);
        }}
        style={{ ...button(selected ? "primary" : "secondary"), padding: "6px 14px", fontSize: 13, flexShrink: 0 }}
      >
        {selected ? "✓" : "Επιλογή"}
      </button>
    </div>
  );
}

// Ένα block ανά ρόλο (skipper υποχρεωτικά, κάθε ναύτης ξεχωριστά) — δική του
// τιμή, δικοί του υποψήφιοι, δικό του αίτημα/χρέωση. Μόλις σταλεί, "κλειδώνει"
// (δεν ξαναστέλνεται από εδώ — η αναθεώρηση τιμής γίνεται στη σελίδα
// "Τα αιτήματά μου").
function RoleBlock({ deliveryRequestId, role, miles, startDate, endDate, settings, onSent, onRemove, removable }) {
  const [price, setPrice] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  useEffect(() => {
    searchDeliveryCandidates(role, startDate, endDate).then(setCandidates).catch(() => setCandidates([]));
  }, [role, startDate, endDate]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const estimate = estimateFee(settings, role, miles);

  async function handleSend() {
    setError("");
    if (!price || Number(price) < 0) {
      setError("Συμπλήρωσε προσφερόμενη τιμή.");
      return;
    }
    if (selected.size === 0) {
      setError("Επίλεξε τουλάχιστον έναν υποψήφιο.");
      return;
    }
    setBusy(true);
    try {
      const row = await createDeliveryRoleRequest(deliveryRequestId, role, Number(price), Array.from(selected));
      setSent(row);
      onSent?.(row);
    } catch (err) {
      setError(ROLE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          ✓ Στάλθηκε αίτημα για {labelForRole(role).toLowerCase()} — {selected.size} υποψήφι
          {selected.size === 1 ? "ος/α" : "οι/ες"}
        </p>
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>
          Προσφερόμενη τιμή: <span style={{ ...money, color: colors.ink }}>{formatMoney(sent.offered_price)}€</span> · Χρεώθηκες{" "}
          <span style={{ ...money, color: colors.ink }}>{formatMoney(sent.client_fee)}€</span> τέλος πλατφόρμας.
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ ...h2, fontSize: 16, margin: "0 0 10px" }}>
          {labelForRole(role)} {role === "skipper" && <span style={{ ...muted, fontSize: 12.5 }}>(υποχρεωτικό)</span>}
        </h3>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.inkSoft, fontSize: 13 }}
          >
            Αφαίρεση
          </button>
        )}
      </div>

      <label style={label}>Προσφερόμενη τιμή (€)</label>
      <input
        type="number"
        min={0}
        style={{ ...input, maxWidth: 180, marginBottom: 6 }}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="π.χ. 1500"
      />
      <p style={{ ...muted, fontSize: 12.5, margin: "0 0 14px" }}>
        Η τιμή που θα δει και θα αποδεχτεί ή θα απορρίψει ο υποψήφιος — πληρώνεται απευθείας σε αυτόν, εκτός
        πλατφόρμας.
      </p>

      {estimate && (
        <div style={{ padding: "10px 12px", background: colors.seaGlass, borderRadius: radius.md, marginBottom: 14, fontSize: 13 }}>
          Τέλος πλατφόρμας: εσύ πληρώνεις <span style={{ ...money, color: colors.ink }}>{estimate.clientFee}€</span>, ο{" "}
          {role === "skipper" ? "skipper" : "ναύτης"} πληρώνει <span style={{ ...money, color: colors.ink }}>{estimate.professionalFee}€</span>{" "}
          όταν αναλάβει — υπολογισμένο από τα μίλια, ανεξάρτητα από την τιμή που όρισες παραπάνω.
        </div>
      )}

      <p style={{ ...sectionLabel, margin: "0 0 8px" }}>
        Διαθέσιμοι για μεταφορές {candidates == null ? "" : `(${candidates.length})`}
      </p>
      {candidates == null && <p style={muted}>Φόρτωση...</p>}
      {candidates?.length === 0 && (
        <p style={muted}>Κανείς δεν έχει δηλώσει διαθεσιμότητα για μεταφορές σε αυτόν τον ρόλο αυτή τη στιγμή.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {candidates?.map((s) => (
          <CandidateCard key={s.id} s={s} selected={selected.has(s.id)} onToggle={toggle} />
        ))}
      </div>

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 10px" }}>{error}</p>}
      <button style={button("primary")} disabled={busy || !candidates?.length} onClick={handleSend}>
        {busy ? "..." : `Αποστολή σε ${selected.size || 0} επιλεγμέν${selected.size === 1 ? "ο" : "ους"}`}
      </button>
    </div>
  );
}

function DeliveryForm({ onCreated }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");
  const [dateMode, setDateMode] = useState("fixed");
  const [departureDate, setDepartureDate] = useState("");
  const [flexibleDays, setFlexibleDays] = useState("10");
  const [coversTravel, setCoversTravel] = useState(false);
  const [coversFuel, setCoversFuel] = useState(false);
  const [coversFood, setCoversFood] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!origin.trim() || !destination.trim()) {
      setError("Συμπλήρωσε αφετηρία και προορισμό.");
      return;
    }
    if (!distanceMiles || Number(distanceMiles) <= 0) {
      setError("Συμπλήρωσε απόσταση σε μίλια.");
      return;
    }
    if (!departureDate) {
      setError("Επίλεξε ημερομηνία.");
      return;
    }
    setBusy(true);
    try {
      const row = await createDeliveryRequest({
        origin,
        destination,
        distanceMiles: Number(distanceMiles),
        dateMode,
        departureDate,
        flexibleDays: dateMode === "flexible" ? Number(flexibleDays) || 0 : 0,
        coversTravel,
        coversFuel,
        coversFood,
        notes: notes.trim() || null,
      });
      onCreated(row);
    } catch (err) {
      setError(REQUEST_ERRORS[err.message] || err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={card}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
        <div>
          <label style={label}>Αφετηρία</label>
          <input type="text" style={input} placeholder="π.χ. Άλιμος" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </div>
        <div>
          <label style={label}>Προορισμός</label>
          <input type="text" style={input} placeholder="π.χ. Ρόδος" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div>
          <label style={label}>Απόσταση (ναυτικά μίλια)</label>
          <input
            type="number"
            min={1}
            style={input}
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value)}
            placeholder="π.χ. 250"
          />
        </div>
      </div>

      <div style={{ margin: "18px 0" }}>
        <label style={label}>Ημερομηνία</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setDateMode("fixed")}
            style={{
              ...button(dateMode === "fixed" ? "primary" : "secondary"),
              padding: "7px 14px",
              fontSize: 13,
            }}
          >
            Συγκεκριμένη
          </button>
          <button
            type="button"
            onClick={() => setDateMode("flexible")}
            style={{
              ...button(dateMode === "flexible" ? "primary" : "secondary"),
              padding: "7px 14px",
              fontSize: 13,
            }}
          >
            Ευέλικτη (±)
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ ...label, fontSize: 12 }}>{dateMode === "flexible" ? "Γύρω από" : "Ημερομηνία"}</label>
            <input type="date" style={input} value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
          </div>
          {dateMode === "flexible" && (
            <div>
              <label style={{ ...label, fontSize: 12 }}>± ημέρες</label>
              <input
                type="number"
                min={1}
                style={{ ...input, width: 90 }}
                value={flexibleDays}
                onChange={(e) => setFlexibleDays(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: "18px 0" }}>
        <label style={label}>Τι καλύπτεται</label>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={coversTravel} onChange={(e) => setCoversTravel(e.target.checked)} />
            Μεταφορικά έως την αφετηρία
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={coversFuel} onChange={(e) => setCoversFuel(e.target.checked)} />
            Καύσιμα
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={coversFood} onChange={(e) => setCoversFood(e.target.checked)} />
            Φαγητό
          </label>
        </div>
      </div>

      <label style={label}>Σημειώσεις (προαιρετικό)</label>
      <textarea
        style={{ ...input, minHeight: 70, resize: "vertical", marginBottom: 14 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}
      <button style={{ ...button("primary"), width: "100%" }} disabled={busy} type="submit">
        {busy ? "..." : "Συνέχεια — επιλογή skipper"}
      </button>
    </form>
  );
}

function RolesStep({ deliveryRequest }) {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [skipperSent, setSkipperSent] = useState(false);
  const [deckhandBlocks, setDeckhandBlocks] = useState([0]);
  const rangeStart = addDays(deliveryRequest.departure_date, -(deliveryRequest.flexible_days || 0));
  const rangeEnd = addDays(deliveryRequest.departure_date, deliveryRequest.flexible_days || 0);

  useEffect(() => {
    Promise.all([
      getPlatformSetting("delivery_skipper_rate_per_mile"),
      getPlatformSetting("delivery_deckhand_rate_per_mile"),
      getPlatformSetting("delivery_platform_fee_pct"),
      getPlatformSetting("delivery_min_fee"),
    ]).then(([skipperRate, deckhandRate, pct, minFee]) => {
      setSettings({ skipperRate, deckhandRate, pct, minFee });
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ ...card, background: colors.bgSoft || "#F7F5F0", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          {deliveryRequest.origin_point} → {deliveryRequest.destination_point} · {deliveryRequest.distance_miles} μίλια
        </p>
      </div>

      <RoleBlock
        deliveryRequestId={deliveryRequest.id}
        role="skipper"
        miles={deliveryRequest.distance_miles}
        startDate={rangeStart}
        endDate={rangeEnd}
        settings={settings}
        onSent={() => setSkipperSent(true)}
      />

      {skipperSent && (
        <>
          <h3 style={{ ...sectionLabel, margin: "22px 0 12px" }}>Ναύτες (προαιρετικό)</h3>
          {deckhandBlocks.map((key) => (
            <RoleBlock
              key={key}
              deliveryRequestId={deliveryRequest.id}
              role="deckhand"
              miles={deliveryRequest.distance_miles}
              startDate={rangeStart}
              endDate={rangeEnd}
              settings={settings}
              removable={deckhandBlocks.length > 1}
              onRemove={() => setDeckhandBlocks((bs) => bs.filter((b) => b !== key))}
            />
          ))}
          <button
            type="button"
            style={{ ...button("secondary"), marginBottom: 20 }}
            onClick={() => setDeckhandBlocks((bs) => [...bs, Math.max(...bs) + 1])}
          >
            + Προσθήκη ναύτη
          </button>

          <button style={{ ...button("primary"), width: "100%" }} onClick={() => router.push("/platform/delivery/requests")}>
            Ολοκλήρωση — προβολή αιτημάτων μου
          </button>
        </>
      )}
    </div>
  );
}

export default function DeliveryPage() {
  const { session, loading } = useAuth();
  const [deliveryRequest, setDeliveryRequest] = useState(null);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) {
    return (
      <div style={container}>
        <h1 style={h1}>Μεταφορά σκάφους</h1>
        <p style={muted}>Χρειάζεται σύνδεση για να δημιουργήσεις αίτημα μεταφοράς.</p>
      </div>
    );
  }

  return (
    <div style={container}>
      {deliveryRequest && <BackButton onClick={() => setDeliveryRequest(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...h1, marginTop: deliveryRequest ? 14 : 0 }}>Μεταφορά σκάφους</h1>
        <Link href="/platform/delivery/requests" style={{ fontSize: 13.5, color: colors.accent, textDecoration: "none" }}>
          Τα αιτήματά μου →
        </Link>
      </div>
      <p style={muted}>
        Βρες κάποιον να αναλάβει τη μεταφορά του σκάφους σου από ένα σημείο σε άλλο — πλήρωμα ειδικά για το ταξίδι,
        όχι για διαμονή.
      </p>
      {!deliveryRequest ? (
        <DeliveryForm onCreated={setDeliveryRequest} />
      ) : (
        <RolesStep deliveryRequest={deliveryRequest} />
      )}
    </div>
  );
}
