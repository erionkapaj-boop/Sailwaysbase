"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { LANGUAGES } from "../../../lib/platform/localData/en.js";
import { colors, radius } from "../../../lib/platform/theme";
import { useLocalData } from "../useLocalData";
import Icon from "./Icon";

// Επιλογή γλωσσών (πολλαπλή): οι επιλεγμένες φαίνονται ως chips με τικ σε μία γραμμή, και
// δίπλα «+» που ανοίγει τη λίστα με τις υπόλοιπες. Ο επαγγελματίας πρέπει να μιλά
// ΤΟΥΛΑΧΙΣΤΟΝ μία από τις επιλεγμένες· καμία επιλεγμένη = όλοι (βλ. searchSkippers).
// value: πίνακας από id γλωσσών· onChange(νέος πίνακας).
const COMMON = ["English", "Greek", "German", "French", "Italian", "Spanish"];

const chip = (on) => ({
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "8px 14px", borderRadius: radius.pill,
  fontFamily: "inherit", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
  border: `${on ? 2 : 1}px solid ${on ? colors.ink : colors.border}`, background: on ? colors.seaGlass : colors.card, color: colors.ink,
});

export default function LanguagePicker({ languages = [], value = [], onChange }) {
  const t = useTranslations("LanguagePicker");
  const L = useLocalData();
  const [open, setOpen] = useState(false);
  const rank = (l) => {
    const i = COMMON.indexOf(LANGUAGES[l.name]);
    return i === -1 ? COMMON.length : i;
  };
  const sorted = [...languages].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
  const selected = sorted.filter((l) => value.includes(l.id));
  const rest = sorted.filter((l) => !value.includes(l.id));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div data-language-picker>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {selected.map((l) => (
          <button key={l.id} type="button" aria-pressed="true" style={chip(true)} onClick={() => toggle(l.id)}>
            <Icon name="check" size={16} stroke={2.2} />
            {L.text(l.name)}
          </button>
        ))}
        <button type="button" aria-label={t("more")} aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ ...chip(false), padding: "8px 14px" }}>
          <Icon name={open ? "minus" : "plus"} size={18} stroke={2} />
        </button>
      </div>
      {open && (
        <div data-language-list style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          {rest.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed="false"
              onClick={() => toggle(l.id)}
              style={{ padding: "10px 12px", borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, fontFamily: "inherit", fontSize: 15, minHeight: 52, cursor: "pointer", textAlign: "center" }}
            >
              {L.text(l.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
