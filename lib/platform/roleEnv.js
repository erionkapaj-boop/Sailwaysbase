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
//   sidebar  μόνιμο αριστερό μενού / συρτάρι κονσόλας (σε κανέναν ρόλο: το μενού του Administrator είναι οι καρτέλες του)
//   home     τι δείχνει η Αρχική: search (αναζήτηση πληρώματος) · jobs (ανοιχτά αιτήματα) · brand (μόνο λογότυπο) · console (η Επισκόπηση)
//   homeHref πού πάει η «Αρχική» αυτού του ρόλου
//   profile  τι ανοίγει το «Προφίλ» / «Το προφίλ μου»: client · professional · stub (δεν υπάρχει ακόμη) · admin (ταυτότητα και στοιχεία σύνδεσης)
//   menu     γραμμές του μενού προφίλ (το «Αποσύνδεση» είναι πάντα τελευταίο)
//
// Κάθε ρόλος είναι ξεχωριστό «δωμάτιο» (απόφαση ιδιοκτήτη 17/10/2026): ο Administrator μπαίνει στο δωμάτιο της διαχείρισης και βλέπει μόνο
// το μενού της· ο ίδιος άνθρωπος ως Επαγγελματίας βλέπει ό,τι βλέπει κάθε επαγγελματίας και τίποτα από τη διαχείριση.

export const NAV_TAB_DEFS = {
  home: { href: "/platform", icon: "home", fill: "homeFill", label: "tabHome", exact: true },
  login: { href: "/platform/login", icon: "login", label: "login" },
  requests: { href: "/platform/requests", icon: "inbox", fill: "inboxFill", label: "tabRequests", badge: "requests" },
  calendar: { href: "/platform/availability", icon: "cal", label: "tabCalendar" },
  boats: { href: null, icon: "boat", label: "tabBoats" }, // Εταιρεία: δεν υπάρχει ακόμη σελίδα σκαφών → η καρτέλα κρύβεται
  experiences: { href: "/platform/experiences", icon: "compass", label: "tabExperiences" },
  profile: { href: "/platform/profile", icon: "user", fill: "userFill", label: "tabProfile" },
  // Δωμάτιο Administrator / Ομάδας: οι καρτέλες είναι το μενού της διαχείρισης.
  overview: { href: "/platform/admin", icon: "home", fill: "homeFill", label: "tabOverview", exact: true },
  approvals: { href: "/platform/admin/approvals", icon: "shield", label: "tabApprovals", badge: "admin" },
  users: { href: "/platform/admin/users", icon: "users", label: "tabUsers", also: ["/platform/admin/user/"] },
  adminBookings: { href: "/platform/admin/bookings", icon: "calCheck", label: "tabBookings" },
  more: { href: "/platform/admin/more", icon: "dots", label: "tabMore", badge: "admin" },
};

// Οι ενότητες της διαχείρισης που είναι καρτέλες· όλες οι υπόλοιπες ζουν στο «Περισσότερα», σε ομάδες (ADMIN_GROUPS). Κάθε ενότητα σε ΕΝΑ σημείο.
export const ADMIN_TAB_SECTIONS = ["/platform/admin", "/platform/admin/approvals", "/platform/admin/users", "/platform/admin/bookings"];

const INTERNAL = {
  tabs: [{ key: "overview" }, { key: "approvals" }, { key: "users" }, { key: "adminBookings" }, { key: "more" }],
  apps: false, bell: false, messages: false, sidebar: false, home: "console", homeHref: "/platform/admin", profile: "admin", menu: ["profile", "help"],
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

// Το «Περισσότερα» του Administrator: όσες ενότητες της κονσόλας δεν είναι καρτέλες, σε ομάδες. Κάθε ενότητα σε ΜΙΑ ομάδα· όσες είναι
// καρτέλες (ADMIN_TAB_SECTIONS) δεν επαναλαμβάνονται εδώ. Οι διευθύνσεις είναι αυτές του app/platform/admin/AdminShell.js (SECTIONS).
export const ADMIN_GROUPS = [
  { key: "requests", icon: "inbox", sections: ["/platform/admin/board", "/platform/admin/replacements", "/platform/admin/offers", "/platform/admin/deliveries", "/platform/admin/disputes"] },
  { key: "credits", icon: "coins", sections: ["/platform/admin/finance"] },
  { key: "community", icon: "chat", sections: ["/platform/admin/community", "/platform/admin/messages"] },
  { key: "content", icon: "sliders", sections: ["/platform/admin/map", "/platform/admin/health", "/platform/admin/settings"] },
];

// Η καρτέλα «Περισσότερα» μένει τονισμένη σε κάθε ενότητα που ανοίγει από εκεί.
NAV_TAB_DEFS.more.also = ADMIN_GROUPS.flatMap((g) => g.sections);

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
