"use client";
import TopUpSheet from "../components/credits/TopUpSheet";
import { formatCredits } from "../../../lib/platform/credits";
import DateField from "../components/calendar/DateField";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { useLocalData } from "../useLocalData";
import Stars from "../components/Stars";
import BackButton from "../components/BackButton";
import { SUPPORTED_ROLES, labelForRole } from "../../../lib/platform/roles";
import { formatMoney } from "../../../lib/platform/notifications";
import {
  getPlatformSetting,
  createDeliveryRequest,
  createDeliveryRoleRequest,
  createOpenDeliveryRoleRequest,
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
  sectionLabel, tapTarget } from "../../../lib/platform/theme";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { trackFlow, noteFailure } from "../../../lib/platform/health";
import BoatFields from "../components/BoatFields";
import { boatValid } from "../../../lib/platform/boat";

const REQUEST_ERRORS = ["account_not_verified", "no_client_profile", "invalid_distance", "invalid_date_mode"];

const ROLE_ERRORS = ["invalid_price", "no_candidates_selected", "invalid_candidate_selection", "insufficient_wallet", "not_owner"];

function identityLine(s, t, L) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${L.text(s.nationality_country)}`);
  if (s.age) parts.push(t("age", { age: s.age }));
  if (s.languages?.length > 0) parts.push(s.languages.map(L.text).join(", "));
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
  // Σε credits, όπως τα υπολογίζει η βάση (0110).
  return Math.ceil(clientFee / Math.max(settings.creditPrice || 50, 1));
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
  const t = useTranslations("Delivery");
  const L = useLocalData();
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
        {identityLine(s, t, L) && <div style={{ fontSize: 13.5 }}>{identityLine(s, t, L)}</div>}
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
        {selected ? t("selected") : t("select")}
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
  awaitingVerification,
  onRequestCreated,
  onSent,
  onRemove,
  removable,
  initialPrice,
  initialSelected,
  initialOpen,
}) {
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : "");
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(new Set(initialSelected || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  // Leave the slot open (0126): nobody is picked now; professionals claim it.
  const [openMode, setOpenMode] = useState(Boolean(initialOpen));
  const [restoredNotice] = useState(Boolean(initialPrice));
  const [topUpNeed, setTopUpNeed] = useState(0);
  const t = useTranslations("Delivery");
  const { userRow } = useAuth();
  const balance = Number(userRow?.wallet_balance ?? 0);

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
  // Also open when the search found nobody: the request is submitted as usual.
  const isOpen = openMode || (candidates !== null && candidates.length === 0);

  async function handleSend() {
    setError("");
    if (!price || Number(price) < 0) {
      setError(t("errOfferedPrice"));
      return;
    }
    if (!isOpen && selected.size === 0) {
      setError(t("errPickCandidate"));
      return;
    }
    // Τίποτα δεν έχει χρεωθεί ακόμα — δεν χάνεται τίποτα στέλνοντας στο
    // login τώρα, με τα ίδια δεδομένα έτοιμα να ξαναφανούν μόλις γυρίσει.
    if (!deliveryRequestId && !session) {
      onAuthRequired(Number(price), Array.from(selected), isOpen);
      return;
    }
    // Αν τα credits δεν φτάνουν, αγορά επιτόπου· τίποτα δεν έχει σταλεί ακόμα.
    if (session && estimate != null && estimate > balance) {
      setTopUpNeed(estimate);
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
      const row = isOpen
        ? await createOpenDeliveryRoleRequest(requestId, role, Number(price))
        : await createDeliveryRoleRequest(requestId, role, Number(price), Array.from(selected));
      trackFlow("delivery", "done");
      setSent(row);
      onSent?.(row);
    } catch (err) {
      if (err.message === "insufficient_wallet") setTopUpNeed(Math.max(1, Number(estimate) || 1));
      else {
        // Όσα δεν περνούν από το friendlyError μετρούν εδώ για το «κολλάει».
        const known = REQUEST_ERRORS.includes(err.message) || ROLE_ERRORS.includes(err.message);
        if (known) noteFailure(err.message);
        setError(known ? t(`err_${err.message}`) : friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ ...card, borderLeft: `3px solid ${colors.accent}` }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {sent.board_open ? t("sentOpen", { role: labelForRole(role) }) : t("sentTo", { role: labelForRole(role), count: selected.size })}
        </p>
        {sent.board_open && <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>{t("sentOpenNote")}</p>}
        <p style={{ ...muted, fontSize: 13, margin: "6px 0 0" }}>
          {t.rich("sentSummary", {
            price: `${formatMoney(sent.offered_price)}€`,
            credits: formatCredits(sent.client_fee),
            m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span>,
          })}
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <TopUpSheet
        open={topUpNeed > 0}
        need={topUpNeed}
        balance={balance}
        onClose={() => setTopUpNeed(0)}
        continueLabel={t("continueSend")}
        onContinue={() => handleSend()}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ ...h2, fontSize: 16, margin: "0 0 10px" }}>
          {labelForRole(role)}
        </h3>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.inkSoft, fontSize: 13 }}
          >
            {t("remove")}
          </button>
        )}
      </div>

      {restoredNotice && (
        <p style={{ ...muted, fontSize: 13, margin: "-4px 0 12px", color: colors.accent }}>
          {t("restored")}
        </p>
      )}

      <label style={label}>{t("offeredPrice")}</label>
      <input
        type="number"
        min={0}
        style={{ ...input, maxWidth: 180, marginBottom: 6 }}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder={t("exPrice")}
      />
      <p style={{ ...muted, fontSize: 12.5, margin: "0 0 14px" }}>
        {t("offeredPriceNote")}
      </p>

      {estimate != null && (
        <div style={{ padding: "10px 12px", background: colors.seaGlass, borderRadius: radius.md, marginBottom: 14, fontSize: 13 }}>
          {t.rich("creditsEstimate", { credits: formatCredits(estimate), m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span> })}
        </div>
      )}

      {candidates === null && <p style={muted}>{t("loading")}</p>}
      {candidates?.length > 0 && (
        <>
          <p style={{ ...sectionLabel, margin: "0 0 8px" }}>
            {t("candidatesHeading")} ({candidates.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {candidates.map((s) => (
              <CandidateCard key={s.id} s={s} selected={!openMode && selected.has(s.id)} onToggle={(id) => { setOpenMode(false); toggle(id); }} />
            ))}
          </div>
        </>
      )}

      {/* Nobody pleases, or nobody was found: the request stays open, professionals
          claim it and the client chooses. */}
      {isOpen ? (
        <div style={{ padding: "12px 14px", borderLeft: `3px solid ${colors.accent}`, background: colors.seaGlass, borderRadius: radius.md, marginBottom: 14 }}>
          <b style={{ fontWeight: 600, fontSize: 14.5 }}>{candidates?.length === 0 ? t("readyTitle") : t("leaveOpenTitle")}</b>
          <p style={{ ...muted, margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>
            {candidates?.length === 0 ? t("readyBody") : t("leaveOpenBody")}
          </p>
          {openMode && candidates?.length > 0 && (
            <button type="button" style={{ ...button("secondary"), marginTop: 10 }} onClick={() => setOpenMode(false)}>
              {t("backToList")}
            </button>
          )}
        </div>
      ) : (
        candidates?.length > 0 && (
          <button type="button" data-leave-open style={{ ...button("secondary"), width: "100%", marginBottom: 14 }} onClick={() => setOpenMode(true)}>
            {t("leaveOpen")}
          </button>
        )
      )}

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 10px" }}>{error}</p>}
      {awaitingVerification ? (
        <div style={{ padding: "12px 14px", border: `1px solid ${colors.warn}`, background: "#F7F0E2", borderRadius: radius.md, fontSize: 13.5, lineHeight: 1.5 }}>
          <b style={{ display: "block", fontSize: 14, marginBottom: 4 }}>{t("pendingTitle")}</b>
          {t("pendingBody")}
        </div>
      ) : (
        <button style={button("primary")} disabled={busy || candidates === null || (!isOpen && !selected.size)} onClick={handleSend}>
          {busy
            ? "..."
            : !session
              ? t("loginToSend")
              : isOpen
                ? t("completeRequest")
                : t("sendTo", { count: selected.size || 0 })}
        </button>
      )}
    </div>
  );
}

// Καθαρά τοπική φόρμα — καμία κλήση στη βάση. Το αίτημα δημιουργείται
// πραγματικά μόνο τη στιγμή που στέλνεται σε skipper (RoleBlock παρακάτω),
// γιατί μόνο τότε έχει νόημα να απαιτηθεί λογαριασμός: μέχρι εκεί ο
// επισκέπτης απλώς φτιάχνει το αίτημα και βλέπει υποψηφίους, χωρίς καμία
// χρέωση.
function DeliveryForm({ onCreated }) {
  const t = useTranslations("Delivery");
  const tb = useTranslations("Boat");
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
  const [boat, setBoat] = useState({ model: "", lengthFt: "", year: "" });
  const [error, setError] = useState("");
  // Ροή «Αίτημα μεταφοράς σκάφους» (0117): άνοιξε τη φόρμα → στάλθηκε.
  useEffect(() => {
    trackFlow("delivery", "open");
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!origin.trim() || !destination.trim()) {
      setError(t("errPorts"));
      return;
    }
    if (!distanceMiles || Number(distanceMiles) <= 0) {
      setError(t("errDistance"));
      return;
    }
    if (!departureDate) {
      setError(t("errDate"));
      return;
    }
    if (coversFood && foodAllowanceAmount && Number(foodAllowanceAmount) < 0) {
      setError(t("errFood"));
      return;
    }
    if (!boatValid(boat)) {
      setError(tb("invalid"));
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
      boatModel: boat.model.trim() || null,
      boatLengthFt: boat.lengthFt || null,
      boatYear: boat.year || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={card}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
        <div>
          <label style={label}>{t("origin")}</label>
          <input type="text" style={input} placeholder={t("exOrigin")} value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </div>
        <div>
          <label style={label}>{t("destination")}</label>
          <input type="text" style={input} placeholder={t("exDestination")} value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div>
          <label style={label}>{t("distance")}</label>
          <input
            type="number"
            min={1}
            style={input}
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value)}
            placeholder={t("exDistance")}
          />
          <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
            {t("distanceNote")}
          </p>
        </div>
      </div>

      <div style={{ margin: "18px 0" }}>
        <label style={label}>{t("date")}</label>
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
            {t("dateFixed")}
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
            {t("dateFlexible")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <label style={{ ...label, fontSize: 12 }}>{dateMode === "flexible" ? t("around") : t("departure")}</label>
            <DateField
              mode="single"
              title={t("departureDate")}
              value={departureDate}
              onChange={setDepartureDate}
            />
          </div>
          {dateMode === "flexible" && (
            <div>
              <label style={{ ...label, fontSize: 12 }}>{t("plusMinusDays")}</label>
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
        <label style={label}>{t("covered")}</label>
        <p style={{ ...muted, fontSize: 12.5, margin: "2px 0 10px" }}>
          {t("coveredNote")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversTickets} onChange={(e) => setCoversTickets(e.target.checked)} />
            {t("covers_tickets")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversTravel} onChange={(e) => setCoversTravel(e.target.checked)} />
            {t("covers_travel")}
          </label>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={coversFood} onChange={(e) => setCoversFood(e.target.checked)} />
              {t("formFood")}
            </label>
            {coversFood && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 0 26px" }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...input, width: 110 }}
                  value={foodAllowanceAmount}
                  onChange={(e) => setFoodAllowanceAmount(e.target.value)}
                  placeholder={t("exFood")}
                />
                <span style={{ ...muted, fontSize: 13 }}>{t("eurTotal")}</span>
              </div>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversFuel} onChange={(e) => setCoversFuel(e.target.checked)} />
            {t("covers_fuel")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={coversPortExpenses} onChange={(e) => setCoversPortExpenses(e.target.checked)} />
            {t("formPort")}
          </label>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <BoatFields idPrefix="dl-boat" value={boat} onChange={(p) => setBoat((cur) => ({ ...cur, ...p }))} />
      </div>

      <label style={label}>{t("notes")}</label>
      <textarea
        style={{ ...input, minHeight: 70, resize: "vertical", marginBottom: 6 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <p style={{ ...muted, fontSize: 12, margin: "0 0 14px" }}>
        {t("notesNote")}
      </p>

      {error && <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px" }}>{error}</p>}
      <button style={{ ...button("primary"), width: "100%" }} type="submit">
        {t("continue")}
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
  const t = useTranslations("Delivery");
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
        {t("pickerNote")}
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
          Skipper
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
              background: picked.has(role) ? colors.ink : "transparent",
              color: picked.has(role) ? "#fff" : colors.ink,
            }}
          >
            {labelForRole(role)}
          </button>
        ))}
      </div>
      <button style={{ ...button("primary"), width: "100%" }} onClick={() => onContinue(Array.from(picked))}>
        {t("continue")}
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
  const t = useTranslations("Delivery");
  const L = useLocalData();
  const { session, userRow, isAdmin } = useAuth();
  // Ίδιος κανόνας με την αναζήτηση πληρώματος (0075/0083): λογαριασμός σε
  // αναμονή επαλήθευσης δεν στέλνει — αλλά η φόρμα του κρατιέται, ώστε να τη
  // βρει έτοιμη όταν ενεργοποιηθεί.
  const awaitingVerification = Boolean(session && userRow && !userRow.phone_verified_at && !isAdmin);
  useEffect(() => {
    if (awaitingVerification && !deliveryRequest) savePendingDelivery({ formValues, pickedRoles });
  }, [awaitingVerification, deliveryRequest, formValues, pickedRoles]);
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
      getPlatformSetting("credit_price_eur"),
    ]).then((values) => {
      const rates = Object.fromEntries(SUPPORTED_ROLES.map((r, i) => [r, values[i]]));
      const [pct, minFee, creditPrice] = values.slice(SUPPORTED_ROLES.length);
      setSettings({ rates, pct, minFee, creditPrice });
    }).catch(() => {});
  }, []);

  // Ό,τι ρόλος χτυπήσει το login wall πρώτος — δεν είναι πάντα ο skipper
  // πια, αφού όλα τα μπλοκ είναι ορατά από την αρχή. Τα υπόλοιπα μπλοκ
  // (φόρμα, επιλεγμένοι ρόλοι) διατηρούνται ούτως ή άλλως· μόνο το
  // συγκεκριμένο μπλοκ που ήταν σε εξέλιξη χρειάζεται να θυμηθεί τιμή/επιλογή.
  function handleAuthRequired(role, price, selectedIds, open) {
    savePendingDelivery({ formValues, pickedRoles, pendingBlock: { role, price, selected: selectedIds, open: Boolean(open) } });
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
          {L.text(formValues.origin)} → {L.text(formValues.destination)} · {t("miles", { miles: formValues.distanceMiles })}
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
        awaitingVerification={awaitingVerification}
        formValues={formValues}
        onAuthRequired={(price, sel, open) => handleAuthRequired("skipper", price, sel, open)}
        onRequestCreated={onRequestCreated}
        initialPrice={restoredBlock?.role === "skipper" ? restoredBlock.price : undefined}
        initialSelected={restoredBlock?.role === "skipper" ? restoredBlock.selected : undefined}
        initialOpen={restoredBlock?.role === "skipper" ? restoredBlock.open : undefined}
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
          awaitingVerification={awaitingVerification}
          formValues={formValues}
          onAuthRequired={(price, sel, open) => handleAuthRequired(role, price, sel, open)}
          onRequestCreated={onRequestCreated}
          removable
          onRemove={() => setExtraBlocks((bs) => bs.filter((b) => b.key !== key))}
          initialPrice={restoredBlock?.role === role ? restoredBlock.price : undefined}
          initialSelected={restoredBlock?.role === role ? restoredBlock.selected : undefined}
          initialOpen={restoredBlock?.role === role ? restoredBlock.open : undefined}
        />
      ))}

      {/* One button per role; each press adds a new block, so "two deckhands"
          is just two presses of the same button. Always visible, not only
          after the skipper request is sent. */}
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
          {t("myRequests")}
        </button>
      )}
    </div>
  );
}

export default function DeliveryPage() {
  const t = useTranslations("Delivery");
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

  if (loading) return <div style={container}>{t("loading")}</div>;

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
        <h1 style={{ ...h1, marginTop: pickedRoles != null ? 14 : 0 }}>{t("title")}</h1>
        <Link href="/platform/delivery/requests" style={{ ...tapTarget, fontSize: 13.5, color: colors.accent, textDecoration: "none" }}>
          {t("myRequests")}
        </Link>
      </div>
      <p style={muted}>
        {t("intro")}
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
