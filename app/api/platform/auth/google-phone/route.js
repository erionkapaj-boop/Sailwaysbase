import { serviceClient } from "../../../../../lib/platform/serverDb";
import { normalizePhone, isValidPhone } from "../../../../../lib/platform/phone";
import { reportServerIssue } from "../../../../../lib/platform/serverHealth";

// Εγγραφή με Google (0121): ο λογαριασμός έχει ήδη επαληθευμένο email από τη
// Google, αλλά όχι τηλέφωνο. Το τηλέφωνο είναι η ταυτότητα της εφαρμογής
// (επικοινωνία μετά την κράτηση, αλλαγή τηλεφώνου, επαναφορά κωδικού), οπότε
// μπαίνει στον λογαριασμό από εδώ, με το κλειδί του διακομιστή, πριν
// ολοκληρωθεί η εγγραφή (complete_registration). Δεν επαληθεύεται με SMS.
//
// Ισχύουν οι ίδιοι κανόνες με την εγγραφή με τηλέφωνο: αριθμός που ανήκε ποτέ σε
// λογαριασμό δεν ξαναδίνεται, και η απάντηση είναι η ίδια για κάθε «μη
// διαθέσιμο» αριθμό (0107).
const TEST_PHONE_RE = /^\+3069800000\d{2}$/;

async function requireGoogleCaller(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const verified = (data.user.identities || []).some(
    (i) => i.provider === "google" && i.identity_data?.email_verified === true
  );
  return verified ? data.user : null;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  try {
    const caller = await requireGoogleCaller(req, db);
    if (!caller) return Response.json({ error: "not_authenticated" }, { status: 401 });

    const { phone } = await req.json().catch(() => ({}));
    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) return Response.json({ error: "invalid_phone" }, { status: 400 });
    if (TEST_PHONE_RE.test(normalized)) return Response.json({ error: "phone_unavailable" }, { status: 409 });

    // Όποιος έχει ήδη λογαριασμό αλλάζει τηλέφωνο από τον λογαριασμό του (με κωδικό).
    const { data: mine } = await db.from("users").select("id").eq("id", caller.id).maybeSingle();
    if (mine) return Response.json({ error: "already_registered" }, { status: 409 });

    const unavailable = () => Response.json({ error: "phone_unavailable" }, { status: 409 });

    // Ο ίδιος αριθμός που έβαλε ήδη (π.χ. ξαναδοκιμάζει): τίποτα να κάνει.
    const current = caller.phone ? `+${String(caller.phone).replace(/^\+/, "")}` : "";
    if (current === normalized) return Response.json({ ok: true, phone: normalized });

    const { data: status } = await db.rpc("phone_registration_status", { p_phone: normalized });
    if (status === "registered" || status === "previously_used") return unavailable();
    const { data: existing } = await db.from("users").select("id").eq("phone_number", normalized).maybeSingle();
    if (existing) return unavailable();

    const { error } = await db.auth.admin.updateUserById(caller.id, { phone: normalized, phone_confirm: true });
    if (error) {
      // Αριθμός που έχει ήδη άλλη ταυτότητα στο Supabase.
      if (/already|registered|exists|duplicate/i.test(error.message || "")) return unavailable();
      throw error;
    }
    return Response.json({ ok: true, phone: normalized });
  } catch (err) {
    await reportServerIssue("google_phone", "/api/platform/auth/google-phone", err, ["POST request"]);
    return Response.json({ error: "could_not_save" }, { status: 500 });
  }
}
