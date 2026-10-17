import { navTabsFor, hiddenNavTabs, isTabActive, NAV_BY_ROLE } from "../../lib/platform/navTabs.js";

const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
};
const keys = (role) => navTabsFor(role).map((t) => t.key).join();

ok("επισκέπτης: Αρχική, Σύνδεση", keys("guest") === "home,login");
ok("πελάτης: Αρχική, Αιτήματα, Προφίλ", keys("client") === "home,requests,profile");
ok("επαγγελματίας: Αρχική, Αιτήματα, Ημερολόγιο, Προφίλ", keys("professional") === "home,requests,calendar,profile");
ok("εταιρεία: η καρτέλα «Σκάφη» κρύβεται (δεν έχει σελίδα)", keys("company") === "home,profile");
ok("δημιουργός: Αρχική, Εμπειρίες, Προφίλ", keys("creator") === "home,experiences,profile");
ok("ομάδα και Administrator: το μενού της διαχείρισης", keys("team") === "overview,approvals,users,adminBookings,more" && keys("admin") === keys("team"));
const A = navTabsFor("admin");
const on = (p) => A.filter((t) => isTabActive(p, t)).map((t) => t.key).join();
ok("Administrator: τονίζεται μία καρτέλα κάθε φορά", on("/platform/admin") === "overview" && on("/platform/admin/approvals") === "approvals" && on("/platform/admin/users") === "users" && on("/platform/admin/user/abc") === "users" && on("/platform/admin/bookings") === "adminBookings");
ok("Administrator: οι ενότητες του «Περισσότερα» τονίζουν το «Περισσότερα»", on("/platform/admin/more") === "more" && on("/platform/admin/health") === "more" && on("/platform/admin/community") === "more" && on("/platform/admin/finance") === "more");
ok("άγνωστος ρόλος → του πελάτη", keys("x") === keys("client"));
ok("«Κρατήσεις» (πελάτη / επαγγελματία) δεν είναι καρτέλα κανενός ρόλου", !Object.values(NAV_BY_ROLE).flat().includes("bookings"));
ok("κάθε ορατή καρτέλα έχει σελίδα", Object.keys(NAV_BY_ROLE).every((r) => navTabsFor(r).every((t) => t.href.startsWith("/platform"))));
ok("κρυμμένες καρτέλες: μόνο τα Σκάφη της Εταιρείας", JSON.stringify(hiddenNavTabs()) === JSON.stringify([{ role: "company", tab: "boats" }]), JSON.stringify(hiddenNavTabs()));

const home = navTabsFor("client")[0], req = navTabsFor("client")[1];
ok("ενεργή καρτέλα: Αρχική μόνο στη ρίζα", isTabActive("/platform", home) && isTabActive("/", home) && !isTabActive("/platform/requests", home));
ok("ενεργή καρτέλα: Αιτήματα και οι υποσελίδες τους", isTabActive("/platform/requests", req) && isTabActive("/platform/requests/abc", req) && !isTabActive("/platform/requestsx", req));
