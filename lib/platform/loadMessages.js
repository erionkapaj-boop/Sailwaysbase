import { PARTS } from "../../messages/parts.js";
import { DEFAULT_LOCALE, LANGUAGES } from "./i18n.js";

// Όλα τα μηνύματα μιας γλώσσας, ενωμένα από τα αρχεία της (messages/parts.js).
export async function loadMessages(locale) {
  const code = LANGUAGES[locale] ? locale : DEFAULT_LOCALE;
  const out = {};
  for (const part of PARTS) {
    let mod;
    try {
      mod = await import(`../../messages/${code}/${part}.json`);
    } catch {
      mod = await import(`../../messages/${DEFAULT_LOCALE}/${part}.json`);
    }
    Object.assign(out, mod.default);
  }
  return out;
}
