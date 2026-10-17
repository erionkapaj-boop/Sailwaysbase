"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useLocalData } from "../../useLocalData";
import AdminShell from "../AdminShell";
import MapView from "../../components/map/MapView";
import { Panel, Empty, colors, muted, button } from "../ui";
import { badge, input, label } from "../../../../lib/platform/theme";
import { PLACES } from "../../../../lib/platform/places";
import coordsFile from "../../../../lib/platform/countries/gr.coords.js";
import { placeKey, positionedPlaces, pointsToGeoJSON, whatIsHere } from "../../../../lib/platform/geo";
import { placePositionsPublic, adminSetPlacePosition, adminResetPlacePosition } from "../../../../lib/platform/db";

const GREECE_CENTER = { lng: 24.5, lat: 38.0 };

// Οθόνη διαχείρισης «Χάρτης»: ο ιδιοκτήτης βλέπει τα μέρη της εφαρμογής στον
// χάρτη και διορθώνει τη θέση τους (μετακινώντας την καρφίτσα). Η διόρθωση
// αποθηκεύεται στη βάση (place_positions) και υπερισχύει της αυτόματης.
export default function AdminMapPage() {
  const t = useTranslations("AdminMap");
  const L = useLocalData();
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null); // κλειδί μέρους
  const [draft, setDraft] = useState(null); // { lng, lat } της καρφίτσας
  const [focus, setFocus] = useState(null);
  const [here, setHere] = useState(null);
  const [pick, setPick] = useState(null);
  const [dirty, setDirty] = useState(false); // η καρφίτσα μετακινήθηκε και δεν έχει αποθηκευτεί
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverrides(await placePositionsPublic());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const positioned = useMemo(() => positionedPlaces({ overrides }), [overrides]);
  const byKey = useMemo(() => new Map(positioned.map((e) => [e.key, e])), [positioned]);

  // Όλα τα μέρη, με κατάσταση: owner (διορθωμένη) | review | missing | auto.
  const rows = useMemo(
    () =>
      PLACES.map((p) => {
        const key = placeKey(p);
        const pos = byKey.get(key);
        const state = overrides[key] ? "owner" : !pos ? "missing" : pos.review ? "review" : "auto";
        return { key, place: p, pos, state };
      }),
    [byKey, overrides]
  );

  const counts = useMemo(
    () => ({
      placed: rows.filter((r) => r.pos).length,
      review: rows.filter((r) => r.state === "review").length,
      missing: rows.filter((r) => r.state === "missing").length,
      owner: rows.filter((r) => r.state === "owner").length,
    }),
    [rows]
  );

  const shown = rows
    .filter((r) => filter === "all" || r.state === filter)
    .filter((r) => !query.trim() || `${r.place.name} ${r.place.en || ""} ${r.place.parent || ""} ${(r.place.aka || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 80);

  const layers = useMemo(
    () => [
      {
        id: "places",
        kind: "points",
        radius: 5,
        data: pointsToGeoJSON(
          positioned.map((e) => ({ lng: e.lng, lat: e.lat, properties: { key: e.key, label: L.text(e.place.name), review: e.review, selected: e.key === selected } }))
        ),
      },
    ],
    [positioned, selected, L]
  );

  function select(key) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    setSelected(key);
    setNotice("");
    setPick(null);
    setDirty(false);
    if (row.pos) {
      setDraft({ lng: row.pos.lng, lat: row.pos.lat });
      setFocus({ lng: row.pos.lng, lat: row.pos.lat, zoom: 11 });
    } else {
      // Χωρίς θέση: η καρφίτσα ξεκινά στο κέντρο της περιοχής του (ή της Ελλάδας).
      const same = positioned.filter((e) => e.place.region === row.place.region);
      const c = same.length ? { lng: same.reduce((n, e) => n + e.lng, 0) / same.length, lat: same.reduce((n, e) => n + e.lat, 0) / same.length } : GREECE_CENTER;
      setDraft(c);
      setFocus({ ...c, zoom: same.length ? 8 : 6 });
    }
  }

  function onPick({ lng, lat, here: h }) {
    setPick({ lng, lat });
    setHere(h);
  }

  const current = selected ? rows.find((r) => r.key === selected) : null;
  const moved = Boolean(current && draft && dirty);

  async function save() {
    if (!current || !draft) return;
    setSaving(true);
    setError("");
    try {
      await adminSetPlacePosition(current.key, Number(draft.lat.toFixed(6)), Number(draft.lng.toFixed(6)));
      setNotice(t("saved"));
      setDirty(false);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (!current) return;
    setSaving(true);
    setError("");
    try {
      await adminResetPlacePosition(current.key);
      setNotice(t("resetDone"));
      setDirty(false);
      await load();
      const auto = coordsFile.places?.[current.key];
      if (auto?.lat != null) setDraft({ lng: auto.lng, lat: auto.lat });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  const stateTone = { auto: "neutral", review: "warn", missing: "danger", owner: "success" };
  const stateText = { auto: t("stateAuto"), review: t("stateReview"), missing: t("stateMissing"), owner: t("stateOwner") };
  const FILTERS = [["all", t("filterAll")], ["review", t("filterReview")], ["missing", t("filterMissing")], ["owner", t("filterOwner")]];

  const hereText = !here
    ? t("hereHint")
    : here.kind === "place"
      ? t("herePlace", { place: L.text(here.place.name), distance: nf.format(here.distanceNm), region: L.text(here.regionName) })
      : here.kind === "region"
        ? t("hereRegion", { region: L.text(here.regionName), place: L.text(here.nearest.name), distance: nf.format(here.distanceNm) })
        : t("hereNone");

  return (
    <AdminShell title={t("title")}>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {notice && <p role="status" style={{ color: colors.success }}>{notice}</p>}
      {!coordsFile.generated && <p style={{ ...muted, fontSize: 13 }}>{t("noCoords")}</p>}

      <Panel padded={false}>
        <div style={{ padding: 12 }}>
          <MapView
            height="min(420px, 52vh)"
            layers={layers}
            focus={focus}
            pick={pick}
            positioned={positioned}
            draggable={draft}
            onDrag={(p) => { setDraft(p); setDirty(true); }}
            onPick={onPick}
            onFeature={(props) => select(props.key)}
          />
          <p data-map-here style={{ margin: "10px 2px 0", fontSize: 14 }}>
            <b style={{ fontWeight: 600 }}>{t("hereTitle")}:</b> <span style={muted}>{hereText}</span>
          </p>
        </div>
      </Panel>

      {current && (
        <Panel title={`${t("selected")}: ${L.text(current.place.parent ? `${current.place.parent} – ${current.place.name}` : current.place.name)}`}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={{ ...button("primary"), minHeight: 44 }} disabled={saving || !moved} onClick={save}>
              {saving ? t("saving") : t("save")}
            </button>
            {overrides[current.key] && (
              <button type="button" style={{ ...button("secondary"), minHeight: 44 }} disabled={saving} onClick={reset}>
                {t("reset")}
              </button>
            )}
            <span style={badge(stateTone[current.state])}>{stateText[current.state]}</span>
          </div>
        </Panel>
      )}

      <Panel title={t("summary", counts)}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {FILTERS.map(([k, text]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              data-map-filter={k}
              style={{ ...button(filter === k ? "primary" : "secondary"), minHeight: 44, padding: "0 16px", fontSize: 13 }}
              onClick={() => setFilter(k)}
            >
              {text}
            </button>
          ))}
        </div>
        <label style={label} htmlFor="map-search">{t("search")}</label>
        <input id="map-search" style={{ ...input, marginBottom: 12 }} value={query} onChange={(e) => setQuery(e.target.value)} />
        {busy && <Empty>…</Empty>}
        {!busy && shown.length === 0 && <Empty>{t("empty")}</Empty>}
        {shown.map((r) => (
          <button
            key={r.key}
            type="button"
            data-place-row={r.key}
            onClick={() => select(r.key)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", minHeight: 52, padding: "8px 4px",
              background: r.key === selected ? colors.seaGlass : "transparent", border: "none", borderTop: `1px solid ${colors.border}`, textAlign: "left",
              cursor: "pointer", fontFamily: "inherit", fontSize: 15, color: colors.ink,
            }}
          >
            <span data-user-text>
              {L.text(r.place.name)}
              {r.place.parent && <span style={{ ...muted, fontSize: 13 }}> · {L.text(r.place.parent)}</span>}
            </span>
            <span style={badge(stateTone[r.state])}>{stateText[r.state]}</span>
          </button>
        ))}
      </Panel>
    </AdminShell>
  );
}
