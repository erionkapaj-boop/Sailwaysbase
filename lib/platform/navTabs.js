// Πλοήγηση «τα δικά μου πράγματα» ανά τρέχοντα ρόλο (βήμα 4 του μοντέλου ρόλων, docs/ROLES.md).
// Κινητό: κάτω μπάρα. Υπολογιστής: οι ίδιες καρτέλες στην πάνω μπάρα. Οι τελείες (launcher) έχουν τις ΚΟΙΝΕΣ εφαρμογές (Jobs, Delivery,
// Community…) και δεν ανακατεύονται εδώ. Η καρτέλα «Κρατήσεις» δεν μπαίνει ακόμη (δεν υπάρχουν πληρωμές).
//
// Μια καρτέλα με `href: null` δεν έχει ακόμη σελίδα: κρύβεται (δεν εμφανίζεται νεκρός σύνδεσμος).

export const NAV_TAB_DEFS = {
  home: { href: "/platform", icon: "home", fill: "homeFill", label: "tabHome", exact: true },
  login: { href: "/platform/login", icon: "login", label: "login" },
  requests: { href: "/platform/requests", icon: "inbox", fill: "inboxFill", label: "tabRequests", badge: "requests" },
  calendar: { href: "/platform/availability", icon: "cal", label: "tabCalendar" },
  boats: { href: null, icon: "boat", label: "tabBoats" }, // Εταιρεία: δεν υπάρχει ακόμη σελίδα σκαφών
  experiences: { href: "/platform/experiences", icon: "compass", label: "tabExperiences" },
  admin: { href: "/platform/admin", icon: "shield", label: "tabAdmin" },
  profile: { href: "/platform/profile", icon: "user", fill: "userFill", label: "tabProfile" },
};

export const NAV_BY_ROLE = {
  guest: ["home", "login"],
  client: ["home", "requests", "profile"],
  professional: ["home", "requests", "calendar", "profile"],
  company: ["home", "boats", "profile"],
  creator: ["home", "experiences", "profile"],
  team: ["home", "admin", "profile"],
  admin: ["home", "admin", "profile"],
};

// Οι καρτέλες ενός ρόλου, μόνο όσες έχουν σελίδα.
export function navTabsFor(role) {
  return (NAV_BY_ROLE[role] || NAV_BY_ROLE.client).map((k) => ({ key: k, ...NAV_TAB_DEFS[k] })).filter((t) => t.href);
}

// Οι καρτέλες που κρύβονται επειδή δεν έχουν σελίδα (για αναφορά και τεστ).
export function hiddenNavTabs() {
  return Object.entries(NAV_BY_ROLE).flatMap(([role, keys]) => keys.filter((k) => !NAV_TAB_DEFS[k].href).map((k) => ({ role, tab: k })));
}

export function isTabActive(pathname, tab) {
  const p = pathname || "/";
  if (tab.exact) return p === tab.href || p === "/";
  return p === tab.href || p.startsWith(`${tab.href}/`);
}
