"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import { useLocalData } from "../../useLocalData";
import { useFeedback } from "../FeedbackProvider";
import Icon, { iconMarkup } from "../Icon";
import LoadError from "../LoadError";
import MapView from "../map/MapView";
import { usePlacePositions } from "../map/usePlacePositions";
import PointCard from "./PointCard";
import PointForm from "./PointForm";
import { whatIsHere, boundsOf } from "../../../../lib/platform/geo";
import { COMMUNITY_CATEGORIES, COMMUNITY_CATEGORY, freshness, observedAtFromDay } from "../../../../lib/platform/community";
import {
  communityListPoints, communityCategorySettings, communityAddPoint, communityUpdatePoint, communityConfirmPoint,
  communityRemovePoint, communityReportPoint, communityDeletePhoto,
} from "../../../../lib/platform/db";
import { scrollToElement } from "../../../../lib/platform/motion";
import { colors, radius, shadow, muted, button } from "../../../../lib/platform/theme";

// Ο κοινός χάρτης της Community: σημεία μελών με εικονίδιο ανά κατηγορία, φίλτρα, κάρτα σημείου, προσθήκη και
// διόρθωση. Χτίζεται πάνω στον υπάρχοντα χάρτη της εφαρμογής (MapView). Η θέση του σημείου επιλέγεται πάντα
// στον χάρτη· δεν ζητείται ποτέ η τοποθεσία του μέλους.
export default function CommunityMap({ access }) {
  const t = useTranslations("Community");
  const { session } = useAuth();
  const L = useLocalData();
  const fb = useFeedback();
  const positioned = usePlacePositions();
  const myId = session?.user?.id || null;
  const canWrite = Boolean(access?.can_write);

  const [points, setPoints] = useState(null);
  const [settings, setSettings] = useState({});
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // browse → place (πατάει στον χάρτη) → form (στοιχεία και έλεγχος) → browse
  const [mode, setMode] = useState("browse");
  const [editing, setEditing] = useState(null);
  const [pos, setPos] = useState(null);
  const [focus, setFocus] = useState(null);
  const draft = useRef(null);
  const focused = useRef(false);
  const frame = useRef(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [list, cfg] = await Promise.all([communityListPoints(), communityCategorySettings()]);
      setPoints(list || []);
      setSettings(cfg || {});
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Πρώτη φόρτωση: ο χάρτης πηγαίνει εκεί που υπάρχουν σημεία.
  useEffect(() => {
    if (!points || focused.current) return;
    focused.current = true;
    const b = boundsOf(points.map((p) => ({ lng: p.lng, lat: p.lat })));
    if (b) setFocus({ bounds: b, maxZoom: 9, padding: 60, instant: true });
  }, [points]);

  const shown = useMemo(() => (points || []).filter((p) => !filters.length || filters.includes(p.category)), [points, filters]);
  const selected = useMemo(() => (points || []).find((p) => p.id === selectedId) || null, [points, selectedId]);

  const markers = useMemo(
    () =>
      shown.map((p) => {
        const c = COMMUNITY_CATEGORY[p.category] || COMMUNITY_CATEGORY.other;
        return { id: p.id, lng: p.lng, lat: p.lat, label: p.title, ariaLabel: p.title, shape: "badge", icon: iconMarkup(c.icon), color: c.color, category: p.category, age: freshness(p, settings), active: p.id === selectedId };
      }),
    [shown, settings, selectedId]
  );

  function placeText(at) {
    if (!at) return "";
    const here = whatIsHere(at, { positioned });
    if (here.kind === "place") return t("nearPlace", { name: L.text(here.place.name) });
    if (here.kind === "region") return L.text(here.regionName);
    return "";
  }

  const toggleFilter = (key) => setFilters((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));

  function startAdd() {
    draft.current = null;
    setEditing(null);
    setSelectedId(null);
    setPos(null);
    setMode("place");
    if (frame.current) scrollToElement(frame.current);
  }
  function startEdit(point) {
    draft.current = { category: point.category, title: point.title, description: point.description, photoPath: point.photo_path };
    setEditing(point);
    setSelectedId(null);
    setPos({ lat: point.lat, lng: point.lng });
    setMode("place");
    if (frame.current) scrollToElement(frame.current);
  }
  function cancelAll() {
    if (draft.current?.photoNew) communityDeletePhoto(draft.current.photoNew);
    draft.current = null;
    setEditing(null);
    setPos(null);
    setMode("browse");
  }

  async function save(values) {
    const f = { ...values, lat: pos.lat, lng: pos.lng };
    let saved;
    if (editing) {
      saved = await communityUpdatePoint(editing.id, f);
      if (values.removePhoto && editing.photo_path) communityDeletePhoto(editing.photo_path);
      else if (values.photoPath && editing.photo_path) communityDeletePhoto(editing.photo_path);
    } else {
      saved = await communityAddPoint({ ...f, observedAt: observedAtFromDay(values.day) });
    }
    draft.current = null;
    setEditing(null);
    setMode("browse");
    await load();
    setFilters([]);
    setPos(null);
    setFocus({ lng: saved.lng, lat: saved.lat, zoom: 11 });
    setSelectedId(saved.id);
    fb.done(t(editing ? "updated" : "added"));
  }

  async function confirmPoint(point) {
    const row = await communityConfirmPoint(point.id);
    setPoints((list) => list.map((p) => (p.id === point.id ? { ...p, last_confirmed_at: row.last_confirmed_at, expires_at: row.expires_at, is_expired: false } : p)));
    fb.done(t("confirmedToast"));
  }
  async function removePoint(point) {
    await communityRemovePoint(point.id);
    if (point.photo_path && point.author_id === myId) communityDeletePhoto(point.photo_path);
    setSelectedId(null);
    await load();
    fb.done(t("deleted"));
  }
  async function reportPoint(point, reason, note) {
    const id = await communityReportPoint(point.id, reason, note);
    setSelectedId(null);
    fb.done(t(id ? "reportDone" : "reportDup"));
  }

  const chip = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 7, minHeight: 40, padding: "0 14px", borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontSize: 14, whiteSpace: "nowrap", flexShrink: 0,
    border: `1px solid ${on ? colors.ink : colors.border}`, background: on ? colors.ink : colors.card, color: on ? "#fff" : colors.ink,
    transition: "background .15s ease, border-color .15s ease, color .15s ease",
  });

  if (failed) return <LoadError what={t("loadWhat")} onRetry={load} />;

  return (
    <div data-community-map>
      <div role="group" aria-label={t("filters")} style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 12px", scrollbarWidth: "none" }}>
        <button type="button" data-filter="all" aria-pressed={!filters.length} onClick={() => setFilters([])} style={chip(!filters.length)}>{t("filterAll")}</button>
        {COMMUNITY_CATEGORIES.map((c) => {
          const on = filters.includes(c.key);
          return (
            <button key={c.key} type="button" data-filter={c.key} aria-pressed={on} onClick={() => toggleFilter(c.key)} style={chip(on)}>
              <Icon name={c.icon} size={17} stroke={1.8} style={{ color: on ? "#fff" : c.color }} />
              {t(`catShort_${c.key}`)}
            </button>
          );
        })}
      </div>

      <div ref={frame} style={{ position: "relative" }}>
        <MapView
          height="clamp(420px, calc(100dvh - 300px), 760px)"
          markers={markers}
          onMarker={(id) => mode === "browse" && setSelectedId(id)}
          onPick={mode === "place" ? ({ lng, lat }) => setPos({ lng, lat }) : undefined}
          draggable={mode === "place" && pos ? pos : undefined}
          onDrag={(p) => setPos(p)}
          focus={focus}
          controls="top-right"
        />

        {mode === "browse" && points && (
          <span data-map-count style={{ position: "absolute", left: 12, top: 12, background: "rgba(255,255,255,.94)", borderRadius: radius.pill, padding: "6px 12px", fontSize: 13, color: colors.ink, boxShadow: "0 1px 3px rgba(22,40,60,.15)" }}>
            {t("count", { count: shown.length })}
          </span>
        )}

        {mode === "browse" && canWrite && (
          <button
            type="button"
            data-community-add
            onClick={startAdd}
            style={{ position: "fixed", left: "50%", bottom: "calc(var(--sf-bnav, 0px) + env(safe-area-inset-bottom, 0px) + 18px)", zIndex: 40, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 9, minHeight: 52, padding: "0 24px", borderRadius: radius.pill, border: 0, cursor: "pointer", background: colors.ink, color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 500, boxShadow: shadow.raised }}
          >
            <Icon name="plus" size={20} stroke={2} />
            {t("add")}
          </button>
        )}

        {mode === "place" && (
          <div data-place-bar style={{ position: "fixed", left: 12, right: 12, margin: "0 auto", maxWidth: 520, zIndex: 40, bottom: "calc(var(--sf-bnav, 0px) + env(safe-area-inset-bottom, 0px) + 12px)", background: colors.card, borderRadius: radius.lg, boxShadow: shadow.raised, padding: "14px 16px", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Icon name="pin" size={20} style={{ marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div data-place-hint style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>
                  {pos ? placeText(pos) || t("placeChosen") : t(editing ? "placeHintEdit" : "placeHint")}
                </div>
                {pos && <div style={{ ...muted, fontSize: 13 }}>{t("placeDrag")}</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" data-place-cancel onClick={cancelAll} style={{ ...button("secondary"), flex: 1, minHeight: 46 }}>{t("cancel")}</button>
              <button type="button" data-place-next disabled={!pos} onClick={() => setMode("form")} style={{ ...button("primary"), flex: 1, minHeight: 46, opacity: pos ? 1 : 0.5 }}>{t("next")}</button>
            </div>
          </div>
        )}
      </div>

      {mode === "browse" && access && !canWrite && access.restricted_until && (
        <p style={{ ...muted, fontSize: 13.5, margin: "10px 0 0" }}>{t("restricted")}</p>
      )}

      {mode === "browse" && selected && (
        <PointCard
          point={selected}
          settings={settings}
          myId={myId}
          canWrite={canWrite}
          moderator={Boolean(access?.moderator)}
          onClose={() => setSelectedId(null)}
          onConfirm={confirmPoint}
          onEdit={startEdit}
          onDelete={removePoint}
          onReport={reportPoint}
        />
      )}

      {mode === "form" && pos && (
        <PointForm
          mode={editing ? "edit" : "add"}
          initial={draft.current}
          pos={pos}
          placeText={placeText(pos)}
          onSubmit={save}
          onChangePos={() => setMode("place")}
          onClose={cancelAll}
          onDraft={(d) => { draft.current = d; }}
        />
      )}
    </div>
  );
}
