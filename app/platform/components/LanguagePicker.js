"use client";
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { languageLabel, searchLanguages } from "../../../lib/platform/languages";
import { colors, radius } from "../../../lib/platform/theme";
import Icon from "./Icon";

// Multi-select for languages. Selected ones show as chips with a tick; the "+" next to them opens a
// small search field: from 2 letters it suggests languages (Greek or English names, all ISO 639-1
// languages) and one tap adds a chip. A professional must speak AT LEAST ONE of the chosen languages;
// none chosen = everyone (see searchSkippers). Removing English asks first.
// value: array of ISO language codes ("en", "de"); onChange(new array).
const chip = (on) => ({
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "8px 14px", borderRadius: radius.pill,
  fontFamily: "inherit", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
  border: `${on ? 2 : 1}px solid ${on ? colors.ink : colors.border}`, background: on ? colors.seaGlass : colors.card, color: colors.ink,
});
const smallBtn = (primary) => ({
  minHeight: 40, padding: "0 16px", borderRadius: radius.pill, fontFamily: "inherit", fontSize: 14.5, fontWeight: 500, cursor: "pointer",
  border: `1px solid ${primary ? colors.ink : colors.border}`, background: primary ? colors.ink : colors.card, color: primary ? "#fff" : colors.ink,
});

export default function LanguagePicker({ value = [], onChange }) {
  const t = useTranslations("LanguagePicker");
  const locale = useLocale() === "el" ? "el" : "en";
  const other = locale === "el" ? "en" : "el";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [confirmEnglish, setConfirmEnglish] = useState(false);
  const inputRef = useRef(null);
  const suggestions = useMemo(() => searchLanguages(q, { exclude: value }), [q, value]);
  const typed = q.trim().length >= 2;
  // "No language found" only when nothing matches; if only already-chosen languages match, show nothing.
  const anyMatch = useMemo(() => searchLanguages(q, { limit: 1 }).length > 0, [q]);

  const add = (code) => {
    onChange([...value, code]);
    setQ("");
    inputRef.current?.focus();
  };
  const remove = (code) => {
    if (code === "en") return setConfirmEnglish(true);
    onChange(value.filter((c) => c !== code));
  };

  return (
    <div data-language-picker>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {value.map((code) => (
          <button key={code} type="button" aria-pressed="true" data-language={code} style={chip(true)} onClick={() => remove(code)}>
            <Icon name="check" size={16} stroke={2.2} />
            {languageLabel(code, locale)}
          </button>
        ))}
        <button
          type="button"
          aria-label={t("more")}
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setQ("");
          }}
          style={{ ...chip(false), padding: "8px 14px" }}
        >
          <Icon name={open ? "minus" : "plus"} size={18} stroke={2} />
        </button>
      </div>

      {confirmEnglish && value.includes("en") && (
        <div role="alert" data-language-warning style={{ marginTop: 14, padding: "12px 14px", borderRadius: radius.md, background: colors.seaGlass, border: `1px solid ${colors.border}` }}>
          <p style={{ margin: "0 0 10px", fontSize: 14.5, color: colors.ink }}>{t("fewer")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" data-keep-english style={smallBtn(true)} onClick={() => setConfirmEnglish(false)}>{t("keepEnglish")}</button>
            <button
              type="button"
              data-remove-english
              style={smallBtn(false)}
              onClick={() => {
                setConfirmEnglish(false);
                onChange(value.filter((c) => c !== "en"));
              }}
            >
              {t("remove")}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14 }} data-language-search>
          <label style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", left: 14, top: 0, bottom: 0, display: "flex", alignItems: "center", color: colors.inkSoft }}>
              <Icon name="search" size={18} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={q}
              autoFocus
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("search")}
              aria-label={t("search")}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions[0]) {
                  e.preventDefault();
                  add(suggestions[0]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setQ("");
                }
              }}
              style={{ width: "100%", boxSizing: "border-box", height: 48, padding: "0 14px 0 42px", borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, font: "inherit", fontSize: 16 }}
            />
          </label>
          {typed && suggestions.length > 0 && (
            <div role="listbox" style={{ marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 14, background: colors.card, overflow: "hidden" }}>
              {suggestions.map((code, i) => (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected="false"
                  data-language-option={code}
                  onClick={() => add(code)}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 48, padding: "10px 16px", background: "transparent", border: 0, borderTop: i === 0 ? 0 : "1px solid #F1EEE8", font: "inherit", fontSize: 15.5, textAlign: "left", cursor: "pointer", color: colors.ink }}
                >
                  <span style={{ fontWeight: 500 }}>{languageLabel(code, locale)}</span>
                  <span style={{ fontSize: 13, color: colors.inkSoft }}>{languageLabel(code, other)}</span>
                </button>
              ))}
            </div>
          )}
          {typed && !anyMatch && <p style={{ margin: "10px 2px 0", fontSize: 14, color: colors.inkSoft }}>{t("noMatch")}</p>}
        </div>
      )}
    </div>
  );
}
