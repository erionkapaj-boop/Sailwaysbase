import { createElement } from "react";

// Το ενιαίο σύνολο εικονιδίων της εφαρμογής (docs/DESIGN.md, «Γλώσσα εικονιδίων»).
// Εικονίδια γραμμής, ίδιο πάχος και μέγεθος παντού· κάθε έννοια έχει ΕΝΑ εικονίδιο
// και δεν αλλάζει: αίτημα = inbox, κράτηση = calCheck, μήνυμα = chat, λιμάνι = pin,
// ημερομηνία = cal, άτομα = users, σκάφος = boat, μεταφορά = route, ρόλοι = helm
// (skipper), tray (hostess), anchor (ναύτης), chef (μάγειρας).
// Το εικονίδιο παίρνει το χρώμα του κειμένου (currentColor).
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  homeFill: '<path d="M12 3 3 10.5V20h6.5v-6h5v6H21v-9.5Z" fill="currentColor" stroke="none"/>',
  inbox: '<path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  inboxFill: '<path d="M6 4h12a2 2 0 0 1 2 2v7h-4.5L14 15.5h-4L8.5 13H4V6a2 2 0 0 1 2-2Z" fill="currentColor" stroke="none"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  calCheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  calCheckFill: '<rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="currentColor" stroke="none"/><path d="M8 3v4M16 3v4" /><path d="M9 14.5l2 2 4-4" stroke="#fff"/>',
  chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4Z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
  userFill: '<circle cx="12" cy="8.5" r="4" fill="currentColor" stroke="none"/><path d="M4.5 20.5c.8-3.8 3.8-5.8 7.5-5.8s6.7 2 7.5 5.8Z" fill="currentColor" stroke="none"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.1 3-4.8 6-4.8s5.4 1.7 6 4.8"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14.9c1.9.6 3.2 2.1 3.5 4.6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  forward: '<path d="m9 5 7 7-7 7"/>',
  chev: '<path d="m9.5 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="m7 7 10 10M17 7 7 17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5v.1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  pin: '<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z"/><circle cx="12" cy="10" r="2.4"/>',
  boat: '<path d="M3 15.5h18l-2.4 4.5H5.4Z"/><path d="M12 3v12.5M12 4l6.5 9.5H12"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6Z"/><path d="M9 4v14M15 6v14"/>',
  star: '<path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7Z" fill="currentColor" stroke="none"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.2"/><path d="M16 13.5h2.2"/>',
  coins: '<circle cx="9.5" cy="9.5" r="5.5"/><path d="M14.5 6.2A5.5 5.5 0 1 1 9 20"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/>',
  login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l4 4-4 4M14 12H4"/>',
  brief: '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5"/><circle cx="7" cy="11" r="1.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // καμπίνες
  bunk: '<path d="M4 3v18M20 3v18M4 8.5h16M4 16.5h16"/><path d="M7.5 8.5V6.5h5v2M7.5 16.5v-2h5v2"/>',
  berth: '<path d="M4 8v10M20 18v-2.5"/><rect x="4" y="13" width="16" height="3.5" rx="1"/><rect x="6.2" y="10" width="4.6" height="3" rx="1.3"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16M14.5 12.5v.1"/>',
  // τύποι σκάφους (σιλουέτες γραμμής)
  sail: '<path d="M2.4 15.6h19.2l-3.3 4.6H5.9Z"/><path d="M10.6 2.8v12.8"/><path d="M10.6 3.6 19.4 15.6h-8.8"/><path d="M8.8 6.4 4 15.6h4.8"/>',
  cat: '<path d="M2.4 14.4C3 17.8 4 20.4 6 20.4s3-2.6 3.6-6"/><path d="M14.4 14.4c.6 3.4 1.6 6 3.6 6s3-2.6 3.6-6"/><path d="M2.4 14.4h19.2"/><path d="M7.8 14.4 9 11.4h6l1.2 3"/><path d="M12 2.8v8.6"/><path d="M12 3.6 18 11.4h-6"/>',
  motor: '<path d="M2.2 13.3 21.6 15l-2.2 5H6.6Z"/><path d="M7.6 13.8 10.4 10h6.6l.7 4.9"/><path d="M12.4 10V7.4h3.6V10"/><path d="M14.2 7.4V5.2"/>',
  gulet: '<path d="M1.6 10.4c.9 4.4 2.6 8.6 6.2 8.6h9.8c2.4 0 3.8-1.8 4.4-4.4H5.2c-1.6 0-2.6-1.6-3.6-4.2Z"/><path d="M17.8 14.6v-2h2.8v2"/><path d="M8 3.6v11"/><path d="M8 4.8 4.2 14.6H8"/><path d="M13.6 3v11.6"/><path d="M13.6 4.2 16.4 14.6h-2.8"/>',
  // ρόλοι
  helm: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7"/>',
  tray: '<path d="M4 16.5h16M5.5 16.5a6.5 6.5 0 0 1 13 0"/><path d="M12 8.5v1.5M3 19.5h18"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13.5M8 10.5h8M4.5 13.5c.5 4 3.6 7 7.5 7s7-3 7.5-7"/>',
  chef: '<path d="M7 14.5v5h10v-5"/><path d="M7 14.5A4 4 0 0 1 7.5 6.6a4.5 4.5 0 0 1 9 0A4 4 0 0 1 17 14.5Z"/>',
};

// Το εικονίδιο κάθε ρόλου πληρώματος (κλειδιά του lib/platform/roles.js).
export const CABIN_ICON = { bunk: "bunk", private: "door", skipper: "berth" };

export const BOAT_ICON = { sail: "sail", cat: "cat", motor: "motor", gulet: "gulet", other: "sail" };

export const ROLE_ICON = { skipper: "helm", hostess: "tray", deckhand: "anchor", cook: "chef" };

// Μία σειρά SVG· τα paths είναι σταθερά του κώδικα (όχι δεδομένα χρήστη).
export default function Icon({ name, size = 22, stroke = 1.7, style, className }) {
  const body = P[name];
  if (!body) return null;
  return createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    style: { flexShrink: 0, ...style },
    className,
    dangerouslySetInnerHTML: { __html: body },
  });
}
