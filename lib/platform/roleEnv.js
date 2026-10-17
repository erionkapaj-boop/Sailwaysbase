// Η ΚΕΝΤΡΙΚΗ ρύθμιση «τι βλέπει κάθε ρόλος» (βήμα «κάθε ρόλος βλέπει ΜΟΝΟ τα δικά του», docs/ROLES.md).
//
// Κανόνας ιδιοκτήτη: ό,τι εμφανίζεται στην οθόνη (τελείες, πάνω μπάρα, κάτω μπάρα, αρχική, προφίλ, μενού προφίλ) εξαρτάται από τον
// ΤΡΕΧΟΝΤΑ ρόλο· τίποτα από τον έναν ρόλο δεν εμφανίζεται σε άλλον και τίποτα δεν εμφανίζεται διπλά (ούτε σε δύο μενού, ούτε σε μενού
// και σε κάρτα). Όποια οθόνη θέλει να ξέρει «τι δείχνω σε αυτόν τον ρόλο;» διαβάζει ΜΟΝΟ από εδώ· για να αλλάξει κάτι αργότερα,
// αλλάζει εδώ και πουθενά αλλού.
//
// Πεδία ανά ρόλο:
//   tabs     καρτέλες της κάτω μπάρας (κινητό) και της πάνω μπάρας (υπολογιστής), με τη σειρά τους
//   apps     οι τελείες (launcher): οι ΚΟΙΝΕΣ εφαρμογές. false = δεν υπάρχουν τελείες
//   bell     κουδούνι ειδοποιήσεων · messages: μηνύματα (συνομιλίες κράτησης)
//   sidebar  μόνιμο αριστερό μενού / συρτάρι κονσόλας (σήμερα σε κανέναν ρόλο: η διαχείριση ζει στο προφίλ του Administrator)
//   home     τι δείχνει η Αρχική: search (αναζήτηση πληρώματος) · jobs (ανοιχτά αιτήματα) · brand (μόνο λογότυπο) · console (η Επισκόπηση)
//   homeHref πού πάει η «Αρχική» αυτού του ρόλου
//   profile  ποιο προφίλ ανοίγει η καρτέλα «Προφίλ»: client · professional · stub (δεν υπάρχει ακόμη) · admin (η οργανωμένη διαχείριση)
//   menu     γραμμές του μενού προφίλ (το «Αποσύνδεση» είναι πάντα τελευταίο)

export const NAV_TAB_DEFS = {
  home: { href: "/platform", icon: "home", fill: "homeFill", label: "tabHome", exact: true },
  login: { href: "/platform/login", icon: "login", label: "login" },
  requests: { href: "/platform/requests", icon: "inbox", fill: "inboxFill", label: "tabRequests", badge: "requests" },
  calendar: { href: "/platform/availability", icon: "cal", label: "tabCalendar" },
  boats: { href: null, icon: "boat", label: "tabBoats" }, // Εταιρεία: δεν υπάρχει ακόμη σελίδα σκαφών → η καρτέλα κρύβεται
  experiences: { href: "/platform/experiences", icon: "compass", label: "tabExperiences" },
  profile: { href: "/platform/profile", icon: "user", fill: "userFill", label: "tabProfile" },
};

const INTERNAL = {
  // Η Αρχική του Administrator είναι η Επισκόπηση της διαχείρισης· το «Προφίλ» του είναι η οργανωμένη διαχείριση (όλες οι ενότητες),
  // άρα ανοιχτό και σε κάθε υποσελίδα της (also).
  tabs: [{ key: "home", href: "/platform/admin" }, { key: "profile", also: "/platform/admin/" }],
  apps: false, bell: false, messages: false, sidebar: false, home: "console", homeHref: "/platform/admin", profile: "admin", menu: ["help"],
};

export const ROLE_ENV = {
  guest: { tabs: [{ key: "home" }, { key: "login" }], apps: true, bell: false, messages: false, sidebar: false, home: "search", homeHref: "/platform", profile: null, menu: [] },
  client: { tabs: [{ key: "home" }, { key: "requests" }, { key: "profile" }], apps: true, bell: true, messages: true, sidebar: false, home: "search", homeHref: "/platform", profile: "client", menu: ["bookings", "settings", "packages", "help"] },
  professional: { tabs: [{ key: "home" }, { key: "requests" }, { key: "calendar" }, { key: "profile" }], apps: true, bell: true, messages: true, sidebar: false, home: "jobs", homeHref: "/platform", profile: "professional", menu: ["bookings", "settings", "packages", "help"] },
  company: { tabs: [{ key: "home" }, { key: "boats" }, { key: "profile" }], apps: true, bell: false, messages: false, sidebar: false, home: "brand", homeHref: "/platform", profile: "stub", menu: ["settings", "help"] },
  creator: { tabs: [{ key: "home" }, { key: "experiences" }, { key: "profile" }], apps: true, bell: false, messages: false, sidebar: false, home: "brand", homeHref: "/platform", profile: "stub", menu: ["settings", "help"] },
  team: INTERNAL,
  admin: INTERNAL,
};

export function envFor(role) {
  return ROLE_ENV[role] || ROLE_ENV.client;
}

// Η οργάνωση της διαχείρισης μέσα στο προφίλ του Administrator: κάθε ενότητα της κονσόλας ζει σε ΜΙΑ ομάδα. Η «Επισκόπηση»
// είναι η Αρχική του (δεν επαναλαμβάνεται). Οι διευθύνσεις είναι αυτές του app/platform/admin/AdminShell.js (SECTIONS).
export const ADMIN_GROUPS = [
  { key: "people", icon: "users", sections: ["/platform/admin/approvals", "/platform/admin/users"] },
  { key: "requests", icon: "inbox", sections: ["/platform/admin/board", "/platform/admin/bookings", "/platform/admin/replacements", "/platform/admin/offers", "/platform/admin/deliveries", "/platform/admin/disputes"] },
  { key: "credits", icon: "coins", sections: ["/platform/admin/finance"] },
  { key: "community", icon: "chat", sections: ["/platform/admin/community", "/platform/admin/messages"] },
  { key: "content", icon: "sliders", sections: ["/platform/admin/map", "/platform/admin/health", "/platform/admin/settings"] },
];

// Το εικονίδιο κάθε ενότητας της διαχείρισης (ένα σετ, components/Icon.js).
export const ADMIN_SECTION_ICON = {
  "/platform/admin/approvals": "shield",
  "/platform/admin/users": "users",
  "/platform/admin/board": "list",
  "/platform/admin/bookings": "calCheck",
  "/platform/admin/replacements": "swap",
  "/platform/admin/offers": "brief",
  "/platform/admin/deliveries": "route",
  "/platform/admin/disputes": "alert",
  "/platform/admin/finance": "wallet",
  "/platform/admin/community": "users",
  "/platform/admin/messages": "chat",
  "/platform/admin/map": "map",
  "/platform/admin/health": "clock",
  "/platform/admin/settings": "sliders",
};
