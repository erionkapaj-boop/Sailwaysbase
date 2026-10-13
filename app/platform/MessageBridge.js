"use client";
import { useLocale, useMessages } from "next-intl";
import { setCurrentMessages } from "../../lib/platform/tNow";

// Gives non-component code (lib/platform/tNow.js) the language and messages of
// the page. Runs during render, before any child, so every later call reads the
// right language; it is idempotent.
export default function MessageBridge({ children }) {
  const locale = useLocale();
  const messages = useMessages();
  setCurrentMessages(locale, messages);
  return children;
}
