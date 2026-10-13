"use client";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { formatCredits } from "../../../lib/platform/credits";
import DateField from "../components/calendar/DateField";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { tNow } from "../../../lib/platform/tNow";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import { Toolbar, Row, RowMain, Empty, colors, muted, money, button } from "./ui";
import { CREW_ROLES, labelForRole } from "../../../lib/platform/roles";
import { adminSearchAvailability, adminCreateOffer, adminListSettings, listLookups } from "../../../lib/platform/db";

// Picking people and sending them a job is one action with two starting
// points — a cancellation that needs covering, and a charter of your own — so
// it is one component. Written twice it would have drifted: the fee rule, the
// expiry clamp and the "who is actually free" query all have to stay identical
// whichever screen you came from.

const control = {
  padding: "8px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
  minWidth: 0,
};

// Same dense control, but for a <select>: redraws the arrow by hand instead
// of the raw per-browser default, matching the fix applied to every other
// dropdown on the platform.
const selectControl = {
  ...control,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 28,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${colors.inkSoft.replace(
    "#",
    "%23"
  )}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
  cursor: "pointer",
};

const ERROR_CODES = [
  "already_covered",
  "offer_already_open",
  "skipper_cancelled_this_trip",
  "not_latest_in_trip",
  "case_closed",
  "skipper_already_booked",
  "skipper_not_eligible",
  "invalid_skipper_selection",
  "cannot_hire_self",
  "not_awaiting_cover",
  "role_mismatch",
  "missing_job_details",
  "invalid_date_range",
  "no_skippers_selected",
];

function message(err) {
  const code = (err.message || "").match(/[a-z_]+/)?.[0];
  return ERROR_CODES.includes(code) ? tNow("AdminOfferComposer", `errors.${code}`) : friendlyError(err);
}

function Field({ label, basis = "140px", children }) {
  return (
    <label
      style={{ flex: `1 1 ${basis}`, display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: colors.inkSoft }}
    >
      {label}
      {children}
    </label>
  );
}

export default function OfferComposer({ job = null, onDone }) {
  const t = useTranslations("AdminOfferComposer");
  const f = useFormat();
  const L = useLocalData();
  const replacing = Boolean(job);

  const [lookups, setLookups] = useState({ boatTypes: [], ports: [] });
  const [defaultFee, setDefaultFee] = useState(null);

  const [role, setRole] = useState(job?.crew_role || "skipper");
  const [startDate, setStartDate] = useState(job?.start_date || "");
  const [endDate, setEndDate] = useState(job?.end_date || "");
  const [portId, setPortId] = useState(job?.port_id || "");
  const [boatTypeId, setBoatTypeId] = useState("");

  const [results, setResults] = useState(null);
  const [doneMsg, setDoneMsg] = useState("");
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState("");
  const [expiresHours, setExpiresHours] = useState(24);

  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!replacing) listLookups().then(setLookups).catch(() => {});
    adminListSettings()
      .then((rows) => setDefaultFee(rows.find((r) => r.key === "skipper_claim_fee")?.value ?? null))
      .catch(() => {});
  }, [replacing]);

  const search = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!startDate || !endDate) return;
      setBusy(true);
      setError("");
      setPicked([]);
      try {
        setResults(
          await adminSearchAvailability({
            role,
            startDate,
            endDate,
            // A replacement is tied to its place — a curated port for older
            // bookings, a region for client-made ones — and never goes back to
            // anyone who already cancelled this same trip. A charter of your
            // own is not tied anywhere, so leaving it blank means "anywhere".
            portId: (replacing ? job?.port_id : portId) || null,
            regionId: replacing ? job?.region_id || null : null,
            excludeTripOf: replacing ? job?.booking_id : null,
          })
        );
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(false);
      }
    },
    [role, startDate, endDate, portId, replacing, job?.port_id, job?.region_id, job?.booking_id]
  );

  // A cancellation arrives with its dates already known; there is nothing to
  // fill in, so the list is there when the row opens.
  useEffect(() => {
    if (replacing && job?.start_date && job?.end_date) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.booking_id]);

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function send() {
    if (picked.length === 0) return;
    setSending(true);
    setError("");
    try {
      await adminCreateOffer({
        skipperIds: picked,
        role,
        startDate,
        endDate,
        portId: portId || null,
        boatTypeId: boatTypeId || null,
        replacesBookingId: job?.booking_id || null,
        claimFee: fee === "" ? null : fee,
        note,
        expiresHours: Number(expiresHours),
      });
      const n = picked.length;
      const msg = t(replacing ? "sentReplacing" : "sentOpen", { n });
      setPicked([]);
      setNote("");
      setResults(null);
      setDoneMsg(msg);
      onDone?.(msg);
    } catch (err) {
      setError(message(err));
    } finally {
      setSending(false);
    }
  }

  const feeShown = fee === "" ? defaultFee : Number(fee);
  // The search happily answers "who is free anywhere", but a job has a place
  // — and, for a skipper, a boat — that booking_requests has never allowed
  // to be unknown. So the gap is stated here rather than left to come back
  // as a database error after you have already chosen the people. A boat
  // type only means anything for a skipper; hostess (or any future
  // non-skipper role) doesn't operate one.
  const missingDetails = !replacing && (!portId || (role === "skipper" && !boatTypeId));

  return (
    <>
      <Toolbar>
        <form onSubmit={search} style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1, alignItems: "flex-end" }}>
          {/* Every control carries its own small label, so the two date
              fields say which is which and everything lines up. */}
          <Field label={t("role")} basis="100%">
            <select style={selectControl} value={role} onChange={(e) => setRole(e.target.value)} disabled={replacing}>
              {CREW_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("dates")} basis="100%">
            {replacing ? (
              <div style={{ ...control, color: colors.ink }}>{f.dateRange(startDate, endDate)}</div>
            ) : (
              <DateField
                mode="range"
                title={t("jobDates")}
                value={{ startDate, endDate }}
                onChange={({ startDate: s, endDate: e }) => {
                  setStartDate(s);
                  setEndDate(e);
                }}
              />
            )}
          </Field>
          {!replacing && (
            <>
              <Field label={t("port")}>
                <select style={selectControl} value={portId} onChange={(e) => setPortId(e.target.value)}>
                  <option value="">{t("anyPort")}</option>
                  {lookups.ports.map((p) => (
                    <option key={p.id} value={p.id}>
                      {L.text(p.name)}
                    </option>
                  ))}
                </select>
              </Field>
              {role === "skipper" && (
                <Field label={t("boatType")}>
                  <select style={selectControl} value={boatTypeId} onChange={(e) => setBoatTypeId(e.target.value)}>
                    <option value="">{t("anyBoat")}</option>
                    {lookups.boatTypes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {L.text(b.name)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <button type="submit" style={button("secondary")} disabled={busy}>
            {busy ? "…" : t("findAvailable")}
          </button>
        </form>
      </Toolbar>

      {error && <p style={{ color: colors.danger, fontSize: 13, padding: "10px 16px", margin: 0 }}>{error}</p>}
      {results === null && <Empty>{t("pickRoleAndDates")}</Empty>}
      {results?.length === 0 && <Empty>{t("noneAvailable")}</Empty>}

      {results?.map((s) => {
        const on = picked.includes(s.skipper_id);
        return (
          <Row key={s.skipper_id} tone={on ? "attention" : undefined}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(s.skipper_id)}
                style={{ width: 16, height: 16, flexShrink: 0, accentColor: colors.ink }}
              />
              <RowMain
                title={L.person(s) || t("noName")}
                meta={
                  <>
                    <span style={money}>{s.phone_number}</span> · <span style={money}>{s.price_per_day != null ? `${s.price_per_day}€` : "—"}</span>{t("perDay")} ·{" "}
                    {labelForRole(s.crew_role)}
                    {s.rating_count > 0 ? (
                      <>
                        {" · "}
                        <span style={money}>{Number(s.rating_avg).toFixed(1)}</span>★ (
                        <span style={money}>{s.rating_count}</span>)
                      </>
                    ) : (
                      ` · ${t("noReviews")}`
                    )}
                    {s.reliability_percentage != null && (
                      <>
                        {" · "}
                        <span style={money}>{s.reliability_percentage}%</span> {t("reliability")}
                      </>
                    )}
                  </>
                }
              />
            </label>
          </Row>
        );
      })}

      {results?.length > 0 && (
        <div style={{ padding: 16, borderTop: `1px solid ${colors.border}`, background: colors.bg }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ ...muted, fontSize: 12, flex: "2 1 220px" }}>
              {t("noteLabel")}
              <input
                style={{ ...control, width: "100%", marginTop: 4 }}
                placeholder={t("notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label style={{ ...muted, fontSize: 12, flex: "1 1 130px" }}>
              {t("feeLabel")}
              <input
                type="number"
                min={0}
                step={1}
                style={{ ...control, width: "100%", marginTop: 4 }}
                placeholder={defaultFee != null ? String(defaultFee) : t("feeDefault")}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <label style={{ ...muted, fontSize: 12, flex: "1 1 130px" }}>
              {replacing ? t("replyDeadline") : t("validFor")}
              <select
                style={{ ...selectControl, width: "100%", marginTop: 4 }}
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
              >
                <option value={3}>{t("hours", { n: 3 })}</option>
                <option value={12}>{t("hours", { n: 12 })}</option>
                <option value={24}>{t("hours", { n: 24 })}</option>
                <option value={48}>{t("hours", { n: 48 })}</option>
              </select>
            </label>
          </div>

          {/* Said out loud before you send it, because it is the part that
              costs someone money and the part they will ask you about. */}
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 10px" }}>
            {missingDetails
              ? t("missingDetails")
              : picked.length === 0
                ? t(replacing ? "pickReplacing" : "pickOpen")
                : replacing
                  ? t("summaryReplacing", {
                      n: picked.length,
                      hours: expiresHours,
                      fee: feeShown === 0 ? t("noCharge") : feeShown == null ? "—" : formatCredits(feeShown),
                    })
                  : feeShown === 0
                    ? t("summaryFree", { n: picked.length })
                    : t("summaryOpen", { n: picked.length, fee: feeShown == null ? "—" : formatCredits(feeShown) })}
          </p>

          <button
            style={button("primary")}
            disabled={sending || picked.length === 0 || missingDetails}
            onClick={send}
          >
            {sending ? t("sending") : `${t("send")}${picked.length ? ` (${picked.length})` : ""}`}
          </button>
        </div>
      )}
      {doneMsg && (
        <p style={{ color: colors.success, fontSize: 13.5, margin: "12px 0 0", padding: "0 16px 12px" }}>{doneMsg}</p>
      )}
    </>
  );
}
