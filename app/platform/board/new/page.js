"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import { useLocalData } from "../../useLocalData";
import SignedOutNotice from "../../components/SignedOutNotice";
import BoatFields from "../../components/BoatFields";
import { boatValid } from "../../../../lib/platform/boat";
import { listLookups, postOpenRequest } from "../../../../lib/platform/db";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { CREW_ROLES } from "../../../../lib/platform/roles";
import { container, card, h1, muted, button, input, select, label, colors } from "../../../../lib/platform/theme";

const field = { marginBottom: 16 };

// Ο πελάτης αφήνει αίτημα χωρίς να διαλέξει επαγγελματίες (0124).
export default function NewBoardRequest() {
  const t = useTranslations("BoardNew");
  const L = useLocalData();
  const router = useRouter();
  const { session, loading } = useAuth();
  const [lookups, setLookups] = useState({ regions: [], boatTypes: [] });
  const [f, setF] = useState({ role: "skipper", start: "", end: "", regionId: "", departure: "", arrival: "", boatTypeId: "", partySize: "", privateCabin: false, note: "", boatModel: "", boatLengthFt: "", boatYear: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needCredit, setNeedCredit] = useState(false);

  useEffect(() => {
    listLookups()
      .then((l) => setLookups({ regions: l.regions || [], boatTypes: l.boatTypes || [] }))
      .catch(() => {});
  }, []);

  if (loading) return <div style={container} />;
  if (!session) return <SignedOutNotice />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const ready = f.start && f.end && f.regionId && f.departure.trim() && f.arrival.trim() && f.boatTypeId && boatValid({ model: f.boatModel, lengthFt: f.boatLengthFt, year: f.boatYear });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNeedCredit(false);
    try {
      await postOpenRequest({
        start: f.start, end: f.end, regionId: f.regionId, departure: f.departure, arrival: f.arrival,
        boatTypeId: f.boatTypeId, role: f.role, partySize: f.partySize ? Number(f.partySize) : null,
        privateCabin: f.privateCabin, cabinKind: f.privateCabin ? "private" : "bunk", note: f.note,
        boatModel: f.boatModel, boatLengthFt: f.boatLengthFt, boatYear: f.boatYear,
      });
      router.push("/platform/requests?board=1");
    } catch (err) {
      const code = err?.message;
      if (code === "insufficient_wallet") setNeedCredit(true);
      setError(code && t.has(`err.${code}`) ? t(`err.${code}`) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={{ ...h1, marginBottom: 8 }}>{t("title")}</h1>
      <p style={{ ...muted, margin: "0 0 20px" }}>{t("intro")}</p>
      <form onSubmit={submit} style={card}>
        <div style={field}>
          <label style={label} htmlFor="bn-role">{t("role")}</label>
          <select id="bn-role" style={select} value={f.role} onChange={set("role")}>
            {CREW_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, ...field }}>
          <div>
            <label style={label} htmlFor="bn-start">{t("start")}</label>
            <input id="bn-start" type="date" style={{ ...input, minWidth: 0 }} value={f.start} min={new Date().toISOString().slice(0, 10)} onChange={set("start")} />
          </div>
          <div>
            <label style={label} htmlFor="bn-end">{t("end")}</label>
            <input id="bn-end" type="date" style={{ ...input, minWidth: 0 }} value={f.end} min={f.start || undefined} onChange={set("end")} />
          </div>
        </div>
        <div style={field}>
          <label style={label} htmlFor="bn-region">{t("region")}</label>
          <select id="bn-region" style={select} value={f.regionId} onChange={set("regionId")}>
            <option value="">{t("regionPick")}</option>
            {lookups.regions.map((r) => (
              <option key={r.id} value={r.id}>{L.text(r.name)}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, ...field }}>
          <div>
            <label style={label} htmlFor="bn-dep">{t("departure")}</label>
            <input id="bn-dep" style={input} value={f.departure} maxLength={200} onChange={set("departure")} />
          </div>
          <div>
            <label style={label} htmlFor="bn-arr">{t("arrival")}</label>
            <input id="bn-arr" style={input} value={f.arrival} maxLength={200} onChange={set("arrival")} />
          </div>
        </div>
        <div style={field}>
          <label style={label} htmlFor="bn-boat">{t("boat")}</label>
          <select id="bn-boat" style={select} value={f.boatTypeId} onChange={set("boatTypeId")}>
            <option value="">{t("boatPick")}</option>
            {lookups.boatTypes.map((b) => (
              <option key={b.id} value={b.id}>{L.text(b.name)}</option>
            ))}
          </select>
        </div>
        <div style={field}>
          <BoatFields idPrefix="bn-boatinfo" value={{ model: f.boatModel, lengthFt: f.boatLengthFt, year: f.boatYear }}
            onChange={(p) => setF((cur) => ({ ...cur, ...(p.model !== undefined && { boatModel: p.model }), ...(p.lengthFt !== undefined && { boatLengthFt: p.lengthFt }), ...(p.year !== undefined && { boatYear: p.year }) }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, alignItems: "end", ...field }}>
          <div>
            <label style={label} htmlFor="bn-party">{t("party")}</label>
            <input id="bn-party" type="number" min="1" max="50" style={input} value={f.partySize} onChange={set("partySize")} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <input type="checkbox" checked={f.privateCabin} onChange={set("privateCabin")} />
            {t("privateCabin")}
          </label>
        </div>
        <div style={field}>
          <label style={label} htmlFor="bn-note">{t("note")}</label>
          <textarea id="bn-note" data-user-text style={{ ...input, minHeight: 80, resize: "vertical" }} maxLength={500} value={f.note} onChange={set("note")} />
          <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>{t("noteHint")}</p>
        </div>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 12px" }}>{t("creditNote")}</p>
        {error && <p role="alert" style={{ color: colors.danger, margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={button("primary")} disabled={!ready || busy}>
            {busy ? t("submitting") : t("submit")}
          </button>
          {needCredit && (
            <Link href="/platform/wallet" style={{ ...button("secondary"), textDecoration: "none" }}>
              {t("buy")}
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
