"use client";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import * as F from "../../lib/platform/format";

// Ημερομηνίες και ώρες στη γλώσσα της σελίδας (docs/I18N.md). Ο ΜΟΝΟΣ σωστός
// τρόπος να γράφεται ημερομηνία σε οθόνη: η γλώσσα έρχεται από τα μηνύματα της
// σελίδας (και στον διακομιστή, όχι μόνο στον browser), ποτέ από σταθερά.
//
//   const f = useFormat();
//   f.dateRange("2026-09-25", "2026-09-29")   // «25–29 Σεπ 2026» / «25–29 Sep 2026»
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      date: (iso) => F.formatDate(iso, locale),
      dateRange: (start, end) => F.formatDateRange(start, end, locale),
      dateTime: (iso) => F.formatDateTime(iso, locale),
      timeAgo: (iso) => F.timeAgo(iso, locale),
      shortDay: (key) => F.shortDay(key, locale),
      longDay: (key) => F.longDay(key, locale),
      monthNames: (kind) => F.monthNames(locale, kind),
      weekdayNames: (kind) => F.weekdayNames(locale, kind),
    }),
    [locale]
  );
}
