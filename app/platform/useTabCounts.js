"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import { adminOverview } from "../../lib/platform/db";
import { SECTIONS, badgeCount, ADMIN_COUNTS_EVENT } from "./admin/AdminShell";
import { ADMIN_GROUPS } from "../../lib/platform/roleEnv";

// Ο αριθμός (κουκκίδα) κάθε καρτέλας, κοινός για την κάτω μπάρα (κινητό) και την πάνω μπάρα (υπολογιστής).
//   requests  τα αιτήματα που περιμένουν τον χρήστη (όπως πριν)
//   admin     ό,τι περιμένει τη διαχείριση στις ενότητες της καρτέλας (Εκκρεμότητες, ή όσες είναι μέσα στο «Περισσότερα»)
export default function useTabCounts(role) {
  const { notifications, isOwner } = useAuth();
  const pathname = usePathname();
  const internal = role === "admin" || role === "team";
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!internal) return;
    let alive = true;
    const load = () => adminOverview().then((c) => alive && setCounts(c || {})).catch(() => {});
    load();
    window.addEventListener(ADMIN_COUNTS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(ADMIN_COUNTS_EVENT, load);
    };
  }, [internal, pathname]);

  return (tab) => {
    if (tab.badge === "requests") return notifications?.pendingRequests ?? 0;
    if (tab.badge !== "admin" || !internal) return 0;
    const hrefs = tab.key === "more" ? ADMIN_GROUPS.flatMap((g) => g.sections) : [tab.href];
    return SECTIONS.filter((s) => hrefs.includes(s.href) && (isOwner || !s.ownerOnly)).reduce((n, s) => n + badgeCount(s.badge, counts), 0);
  };
}
