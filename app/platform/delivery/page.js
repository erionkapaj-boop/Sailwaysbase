"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import Stars from "../components/Stars";
import BackButton from "../components/BackButton";
import { SUPPORTED_ROLES, labelForRole } from "../../../lib/platform/roles";
import { formatMoney } from "../../../lib/platform/notifications";
import {
  getPlatformSetting,
  createDeliveryRequest,
  createDeliveryRoleRequest,
  searchDeliveryCandidates,
} from "../../../lib/platform/db";
import { savePendingDelivery, takePendingDelivery } from "../../../lib/platform/pendingDelivery";
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
// υπολογισμό. Το τι πληρώνει ο επαγγελματίας δεν αφορά τον πελάτη — δεν
// υπολογίζεται καν εδώ.
function estimateFee(settings, role, miles) {
  if (!settings || !miles) return null;
  const rate = settings.rates?.[role];
  if (rate == null || settings.pct == null || settings.minFee == null) return null;
  const base = miles * rate;
  const commission = base * (settings.pct / 100);
  const clientFee = Math.max(settings.minFee, commission - settings.minFee);
  return round2(clientFee);
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
//
// Η φόρμα και η επιλογή υποψηφίων δουλεύουν χωρίς σύνδεση (browsing μόνο,
// καμία χρέωση) — μόνο η πραγματική αποστολή απαιτεί λογαριασμό, γιατί εκεί
// δημιουργείται το αίτημα στη βάση και χρεώνεται το τέλος. deliveryRequestId
// είναι null μέχρι να σταλεί επιτυχώς το πρώτο μπλοκ — όποιου ρόλου κι αν
// είναι, αφού όλοι οι επιλεγμένοι ρόλοι είναι πλέον ορατοί μαζί από την
// αρχή — κάθε επόμενο block το παίρνει έτοιμο.
function RoleBlock({
  deliveryRequestId,
  role,
  miles,
  startDate,
  endDate,
  settings,
  session,
  formValues,
  onAuthRequired,
  onRequestCreated,
  onSent,
  onRemove,
  removable,
  initialPrice,
  initialSelected,
}) {
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : "");
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(new Set(initialSelected || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [restoredNotice] = useState(Boolean(initialPrice));

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
    // Τίποτα δεν έχει χρεωθεί ακόμα — δεν χάνεται τίποτα στέλνοντας στο
    // login τώρα, με τα ίδια δεδομένα έτοιμα να ξαναφανούν μόλις γυρίσει.
    if (!deliveryRequestId && !session) {
      onAuthRequired(Number(price), Array.from(selected));
      return;
    }
    setBusy(true);
    try {
      let requestId = deliveryRequestId;
      if (!requestId) {
        const dr = await createDeliveryRequest(formValues);
        onRequestCreated(dr);
        requestId = dr.id;
      }
      const row = await createDeliveryRoleRequest(requestId, role, Number(price), Array.from(selected));
      setSent(row);
      onSent?.(row);
    } catch (err) {
      setError(REQUEST_ERRORS[err.message] || ROLE_ERRORS[err.message] || err.message || String(err));
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

      {restoredNotice && (
        <p style={{ ...muted, fontSize: 13, margin: "-4px 0 12px", color: colors.accent }}>
          Οι επιλογές σου διατηρήθηκαν — πάτησε ξανά «Αποστολή» για να ολοκληρωθεί.
        </p>
      )}

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

      {estimate != null && (
        <div style={{ padding: "10px 12px", background: colors.seaGlass, borderRadius: radius.md, marginBottom: 14, fontSize: 13 }}>
          Τέλος πλατφόρμας: <span style={{ ...money, color: colors.ink }}>{estimate}€</span> — υπολογισμένο από τα
          μίλια, ανεξάρτητα από την τιμή που όρισες παραπάνω.
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

// Καθαρά τοπική φόρμα — καμία κλήση στη βάση. Το αίτημα δημιουργείται
// πραγματικά μόνο τη στιγμή που στέλνεται σε skipper (RoleBlock παρακάτω),
// γιατί μόνο τότε έχει νόημα να απαιτηθεί λογαριασμός: μέχρι εκεί ο
// επισκέπτης απλώς φτιάχνει το αίτημα και βλέπει υποψηφίους, χωρίς καμία
// χρέωση.
function DeliveryForm({ onCreated }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");
  const [dateMode, setDateMode] = useState("fixed");
  const [departureDate, setDepartureDate] = useState("");
  const [flexibleDays, setFlexibleDays] = useState("10");
  const [coversTickets, setCoversTickets] = useState(false);
  const [coversTravel, setCoversTravel] = useState(false);
  const [coversFood, setCoversFood] = useState(false);
  const [foodAllowanceAmount, setFoodAllowanceAmount] = useState("");
  const [coversFuel, setCoversFuel] = useState(false);
  const [coversPortExpenses, setCoversPortExpenses] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
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
    if (coversFood && foodAllowanceAmount && Number(foodAllowanceAmount) < 0) {
      setError("Το ποσό διατροφής δεν μπορεί να είναι αρνητικό.");
      return;
    }
    onCreated({
      origin,
      destination,
      distanceMiles: Number(distanceMiles),
      dateMode,
      departureDate,
      flexibleDays: dateMode === "flexible" ? Number(flexibleDays) || 0 : 0,
      coversTickets,
      coversTravel,
      coversFood,
      foodAllowanceAmount: coversFood ? foodAllowanceAmount : "",
      coversFuel,
      coversPortExpenses,
      notes: notes.trim() || null,
    });
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
        <p style={{ ...muted, fontSize: 12.5, margin: "2px 0 10px" }}>
          Τι από τα έξοδα του υποψηφίου αναλαμβάνεις εσύ — δεν περνάει από την πλατφόρμα, το βλέπει μόνο ο
          υποψήφιος πριν αποφασίσει.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversTickets} onChange={(e) => setCoversTickets(e.target.checked)} />
            Εισιτήρια μέχρι την αφετηρία
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversTravel} onChange={(e) => setCoversTravel(e.target.checked)} />
            Έξοδα ταξιδιού μέχρι την αφετηρία
          </label>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={coversFood} onChange={(e) => setCoversFood(e.target.checked)} />
              Έξοδα διατροφής κατά το ταξίδι
            </label>
            {coversFood && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 0 26px" }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...input, width: 110 }}
                  value={foodAllowanceAmount}
                  onChange={(e) => setFoodAllowanceAmount(e.target.value)}
                  placeholder="π.χ. 30"
                />
                <span style={{ ...muted, fontSize: 13 }}>€ — το ποσό που καλύπτεις</span>
              </div>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversFuel} onChange={(e) => setCoversFuel(e.target.checked)} />
            Καύσιμα
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversPortExpenses} onChange={(e) => setCoversPortExpenses(e.target.checked)} />
            Λοιπά έξοδα μεταφοράς — λιμάνια, ανεφοδιασμός, νερό κ.λπ.
          </label>
        </div>
      </div>

      <label style={label}>Σημειώσεις (προαιρετικό)</label>
      <textarea
        style={{ ...input, minHeight: 70, resize: "vertical", marginBottom: 6 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <p style={{ ...muted, fontSize: 12, margin: "0 0 14px" }}>
        Μην γράφεις τηλέφωνο ή email εδώ — δεν φτάνει στον υποψήφιο πριν επιβεβαιωθεί η κράτηση.
      </p>

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}
      <button style={{ ...button("primary"), width: "100%" }} type="submit">
        Συνέχεια — επιλογή πληρώματος
      </button>
    </form>
  );
}

// Ρόλοι που μπορούν να προστεθούν στον skipper — κάθε ρόλος πληρώματος
// εκτός από skipper, με όποια σειρά τα ορίζει το roles.js. Πριν το 0070
// επιτρεπόταν μόνο ναύτης· ζητήθηκε ρητά να μην αποκλείει η πλατφόρμα
// συνδυασμούς όπως "δύο ναύτες, ένας captain, μία μαγείρισσα" — ο πελάτης
// αποφασίζει ο ίδιος ποιο πλήρωμα χρειάζεται για τη μεταφορά.
const EXTRA_ROLES = SUPPORTED_ROLES.filter((r) => r !== "skipper");

// Πρώτο βήμα, πριν καν τη φόρμα διαδρομής — ίδιο σκεπτικό με το "Ποιον
// ψάχνεις;" της κανονικής αναζήτησης πληρώματος (CrewSearchFlow): λες πρώτα
// ΠΟΙΟΝ χρειάζεσαι, μετά συμπληρώνεις τα υπόλοιπα. Ο skipper είναι πάντα
// μέσα — μία μεταφορά χωρίς αυτόν δεν βγάζει νόημα — τα υπόλοιπα είναι
// checkbox-style επιλογές. Η ΠΟΣΟΤΗΤΑ (π.χ. δύο ναύτες) δεν αποφασίζεται
// εδώ· λύνεται στο επόμενο βήμα με τα κουμπιά "+ ρόλος" που μπορούν να
// πατηθούν όσες φορές χρειάζεται.
function RolePickerStep({ onContinue }) {
  const [picked, setPicked] = useState(new Set());

  function toggle(role) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  }

  return (
    <div style={card}>
      <p style={{ ...muted, margin: "0 0 16px" }}>
        Ο skipper χρειάζεται πάντα. Πρόσθεσε ό,τι άλλο πλήρωμα θέλεις για τη μεταφορά — μπορείς να προσθέσεις
        κι άλλους αργότερα.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        <span
          style={{
            padding: "9px 16px",
            borderRadius: radius.pill,
            fontSize: 14,
            border: `1px solid ${colors.ink}`,
            background: colors.ink,
            color: "#fff",
          }}
        >
          Skipper (υποχρεωτικό)
        </span>
        {EXTRA_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => toggle(role)}
            style={{
              padding: "9px 16px",
              borderRadius: radius.pill,
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
              border: `1px solid ${picked.has(role) ? colors.ink : colors.border}`,
              background: picked.has(role) ? colors.seaGlass : "transparent",
              color: colors.ink,
            }}
          >
            {picked.has(role) ? "✓ " : ""}
            {labelForRole(role)}
          </button>
        ))}
      </div>
      <button style={{ ...button("primary"), width: "100%" }} onClick={() => onContinue(Array.from(picked))}>
        Συνέχεια
      </button>
    </div>
  );
}

// formValues: ό,τι συμπλήρωσε στη φόρμα, τοπικά — δεν υπάρχει ακόμα καμία
// γραμμή στη βάση. deliveryRequest γίνεται μη-null τη στιγμή που η πρώτη
// αποστολή — όποιου ρόλου κι αν είναι, όχι πάντα ο skipper πια — πετύχει
// πραγματικά· από εκεί και πέρα κάθε επόμενο block το χρησιμοποιεί έτοιμο.
function RolesStep({ formValues, pickedRoles, deliveryRequest, onRequestCreated, restoredBlock }) {
  const router = useRouter();
  const { session } = useAuth();
  const [settings, setSettings] = useState(null);
  // Κάθε μπλοκ είναι { key, role } — ένα ανά ρόλο επιλεγμένο στο βήμα
  // επιλογής πληρώματος, plus ό,τι προστεθεί μετά με τα κουμπιά "+ ρόλος".
  // Επιτρέπει πολλά μπλοκ του ίδιου ρόλου (π.χ. δύο ναύτες).
  const [extraBlocks, setExtraBlocks] = useState(() => pickedRoles.map((role, i) => ({ key: `init${i}`, role })));
  const nextKey = useRef(0);
  const rangeStart = addDays(formValues.departureDate, -(formValues.flexibleDays || 0));
  const rangeEnd = addDays(formValues.departureDate, formValues.flexibleDays || 0);

  useEffect(() => {
    Promise.all([
      ...SUPPORTED_ROLES.map((r) => getPlatformSetting(`delivery_${r}_rate_per_mile`)),
      getPlatformSetting("delivery_platform_fee_pct"),
      getPlatformSetting("delivery_min_fee"),
    ]).then((values) => {
      const rates = Object.fromEntries(SUPPORTED_ROLES.map((r, i) => [r, values[i]]));
      const [pct, minFee] = values.slice(SUPPORTED_ROLES.length);
      setSettings({ rates, pct, minFee });
    }).catch(() => {});
  }, []);

  // Ό,τι ρόλος χτυπήσει το login wall πρώτος — δεν είναι πάντα ο skipper
  // πια, αφού όλα τα μπλοκ είναι ορατά από την αρχή. Τα υπόλοιπα μπλοκ
  // (φόρμα, επιλεγμένοι ρόλοι) διατηρούνται ούτως ή άλλως· μόνο το
  // συγκεκριμένο μπλοκ που ήταν σε εξέλιξη χρειάζεται να θυμηθεί τιμή/επιλογή.
  function handleAuthRequired(role, price, selectedIds) {
    savePendingDelivery({ formValues, pickedRoles, pendingBlock: { role, price, selected: selectedIds } });
    router.push("/platform/login?next=/platform/delivery");
  }

  function addExtraBlock(role) {
    const key = `extra${nextKey.current++}`;
    setExtraBlocks((bs) => [...bs, { key, role }]);
  }

  return (
    <div>
      <div style={{ ...card, background: colors.bgSoft || "#F7F5F0", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          {formValues.origin} → {formValues.destination} · {formValues.distanceMiles} μίλια
        </p>
      </div>

      <RoleBlock
        deliveryRequestId={deliveryRequest?.id || null}
        role="skipper"
        miles={formValues.distanceMiles}
        startDate={rangeStart}
        endDate={rangeEnd}
        settings={settings}
        session={session}
        formValues={formValues}
        onAuthRequired={(price, sel) => handleAuthRequired("skipper", price, sel)}
        onRequestCreated={onRequestCreated}
        initialPrice={restoredBlock?.role === "skipper" ? restoredBlock.price : undefined}
        initialSelected={restoredBlock?.role === "skipper" ? restoredBlock.selected : undefined}
      />

      {extraBlocks.map(({ key, role }) => (
        <RoleBlock
          key={key}
          deliveryRequestId={deliveryRequest?.id || null}
          role={role}
          miles={formValues.distanceMiles}
          startDate={rangeStart}
          endDate={rangeEnd}
          settings={settings}
          session={session}
          formValues={formValues}
          onAuthRequired={(price, sel) => handleAuthRequired(role, price, sel)}
          onRequestCreated={onRequestCreated}
          removable
          onRemove={() => setExtraBlocks((bs) => bs.filter((b) => b.key !== key))}
          initialPrice={restoredBlock?.role === role ? restoredBlock.price : undefined}
          initialSelected={restoredBlock?.role === role ? restoredBlock.selected : undefined}
        />
      ))}

      {/* Ένα κουμπί ανά ρόλο, καθένα προσθέτει ένα νέο μπλοκ κάθε φορά που
          πατιέται — έτσι "δύο ναύτες" είναι απλώς δύο πατήματα στο ίδιο
          κουμπί, όχι δύο διαφορετικά βήματα. Πάντα ορατά, όχι μόνο μετά την
          αποστολή του skipper. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {EXTRA_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            style={{ ...button("secondary"), fontSize: 13.5 }}
            onClick={() => addExtraBlock(role)}
          >
            + {labelForRole(role)}
          </button>
        ))}
      </div>

      {deliveryRequest && (
        <button style={{ ...button("primary"), width: "100%" }} onClick={() => router.push("/platform/delivery/requests")}>
          Ολοκλήρωση — προβολή αιτημάτων μου
        </button>
      )}
    </div>
  );
}

export default function DeliveryPage() {
  const { loading } = useAuth();
  const [pickedRoles, setPickedRoles] = useState(null);
  const [formValues, setFormValues] = useState(null);
  const [deliveryRequest, setDeliveryRequest] = useState(null);
  const [restoredBlock, setRestoredBlock] = useState(null);

  // Αν γύρισε από login/εγγραφή με ημιτελές αίτημα μεταφοράς περιμένοντας
  // στο sessionStorage (βλ. handleAuthRequired στο RolesStep), το ξαναφέρνει
  // εδώ — ρόλοι, φόρμα και ό,τι μπλοκ ήταν σε εξέλιξη έτοιμα, μένει μόνο ένα
  // ξανά-πάτημα στο «Αποστολή» για να ολοκληρωθεί (καμία αυτόματη χρέωση
  // χωρίς τελευταία ρητή ενέργεια).
  useEffect(() => {
    const pending = takePendingDelivery();
    if (pending?.formValues) {
      setPickedRoles(pending.pickedRoles || []);
      setFormValues(pending.formValues);
      setRestoredBlock(pending.pendingBlock || null);
    }
  }, []);

  if (loading) return <div style={container}>Φόρτωση...</div>;

  // Γυρίζοντας πίσω ξεκινάει καθαρά ένα βήμα τη φορά — αν είχε ήδη σταλεί
  // κάτι (deliveryRequest πια όχι null) και ξαναπατήσει με άλλα στοιχεία,
  // δεν πρέπει να ξαναχρησιμοποιηθεί το παλιό αίτημα με νέα δεδομένα φόρμας.
  function backToPicker() {
    setPickedRoles(null);
    setFormValues(null);
    setDeliveryRequest(null);
    setRestoredBlock(null);
  }
  function backToForm() {
    setFormValues(null);
    setDeliveryRequest(null);
    setRestoredBlock(null);
  }

  return (
    <div style={container}>
      {(pickedRoles != null || formValues) && <BackButton onClick={formValues ? backToForm : backToPicker} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ ...h1, marginTop: pickedRoles != null ? 14 : 0 }}>Μεταφορά σκάφους</h1>
        <Link href="/platform/delivery/requests" style={{ fontSize: 13.5, color: colors.accent, textDecoration: "none" }}>
          Τα αιτήματά μου →
        </Link>
      </div>
      <p style={muted}>
        Βρες κάποιον να αναλάβει τη μεταφορά του σκάφους σου από ένα σημείο σε άλλο — πλήρωμα ειδικά για το ταξίδι,
        όχι για διαμονή. Η δημιουργία αιτήματος και η επιλογή πληρώματος δεν απαιτούν λογαριασμό — μόνο η αποστολή.
      </p>
      {pickedRoles == null ? (
        <RolePickerStep onContinue={setPickedRoles} />
      ) : !formValues ? (
        <DeliveryForm onCreated={setFormValues} />
      ) : (
        <RolesStep
          formValues={formValues}
          pickedRoles={pickedRoles}
          deliveryRequest={deliveryRequest}
          onRequestCreated={setDeliveryRequest}
          restoredBlock={restoredBlock}
        />
      )}
    </div>
  );
}
