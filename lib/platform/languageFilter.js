// Language filter of the search: a professional stays if they speak AT LEAST ONE of the chosen
// languages. None chosen = everyone. The choice is ISO 639 codes ("en,de"); row.languages holds the
// language names stored in the database (array). Old links and drafts carry database language ids,
// mapped to codes with the legacyIdToCode map.
import { isLanguageCode, languageCodeOfDbName } from "./languages.js";

export function parseLanguageIds(value) {
  return String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
}

export function parseLanguageCodes(value, legacyIdToCode = new Map()) {
  const out = [];
  for (const x of parseLanguageIds(value)) {
    const code = isLanguageCode(x) ? x : legacyIdToCode.get(x);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export function languageCodesOf(row) {
  return new Set((row.languages || []).map(languageCodeOfDbName).filter(Boolean));
}

export function speaksAny(rows, codes) {
  const wanted = new Set(codes || []);
  if (!wanted.size) return rows;
  return rows.filter((r) => [...languageCodesOf(r)].some((c) => wanted.has(c)));
}

// Adds to each professional which of the chosen languages they speak (matched_languages).
export function annotateSpoken(rows, codes) {
  const wanted = new Set(codes || []);
  if (!wanted.size) return rows;
  return rows.map((r) => ({ ...r, matched_languages: [...languageCodesOf(r)].filter((c) => wanted.has(c)) }));
}
