// Every page of the app, per kind of visitor. Shared by the tests that walk
// them all (smoke: no errors; responsive: fits a phone).
import { sql } from "./lib.mjs";

export const PUBLIC = ["/platform/login", "/platform/register", "/platform/forgot-pin", "/platform/about",
  "/platform/terms", "/platform/privacy", "/platform/contact", "/platform/experiences", "/platform/board"];
export const EVERYONE = ["/platform", "/platform/search", "/platform/requests", "/platform/bookings", "/platform/wallet", "/platform/wallet/buy",
  "/platform/profile", "/platform/roles", "/platform/settings", "/platform/help", "/platform/delivery", "/platform/delivery/requests", "/platform/contact",
  "/platform/about"];
export const PRO_ONLY = ["/platform/availability"];
export function adminPages() {
  const client = sql("select id from users where full_name = 'Μαρία Πελάτη'");
  const pro = sql("select id from users where full_name = 'Κώστας Υποψήφιος'");
  return ["/platform/admin", "/platform/admin/approvals", "/platform/admin/messages", "/platform/admin/disputes",
    "/platform/admin/replacements", "/platform/admin/offers", "/platform/admin/community", "/platform/admin/bookings", "/platform/admin/deliveries",
    "/platform/admin/users", "/platform/admin/finance", "/platform/admin/settings", "/platform/admin/health", "/platform/admin/more",
    `/platform/admin/user/${client}`, `/platform/admin/user/${pro}`];
}
