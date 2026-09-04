"use client";
import { supabase } from "./supabaseClient";

export function normalizePhone(raw) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+30" + digits.slice(1);
  if (digits.startsWith("30")) return "+" + digits;
  return "+30" + digits;
}

function requireDb() {
  if (!supabase) throw new Error("Το Supabase δεν έχει ρυθμιστεί (λείπουν env vars).");
  return supabase;
}

// ---------------------------------------------------------------------------
// Ghost Mode — δοκιμή εγγραφής ως νέος χρήστης χωρίς πραγματικό SMS.
//
// Δεσμευμένη σειρά τηλεφώνων, ποτέ πραγματικός πελάτης: +306980000001 έως
// +306980000099 — η ίδια σειρά που ήδη χρησιμοποιεί το admin/seed-demo (εκεί
// σταθερό PIN 123456 στο 004-010) και τα δοκιμαστικά νούμερα που ήδη
// χρησιμοποιείς. Ένας αριθμός σε αυτή τη σειρά παρακάμπτει εντελώς το
// πραγματικό SMS OTP — βλ. testPhoneSignIn παρακάτω και τον έλεγχο "Δοκιμαστικό
// τηλέφωνο" στο register/page.js. Ο έλεγχος γίνεται ΚΑΙ εδώ ΚΑΙ ξανά, ανεξάρτητα,
// στο /api/platform/auth/test-signin — ένας client-side έλεγχος από μόνος του
// δεν είναι όριο ασφαλείας.
const TEST_PHONE_RE = /^\+3069800000\d{2}$/;
export function isReservedTestPhone(phone) {
  return TEST_PHONE_RE.test(normalizePhone(phone));
}

// Πρέπει να ταιριάζει με τη σταθερά στο
// app/api/platform/auth/test-signin/route.js. Όχι μυστικό — ισχύει μόνο για
// τη δεσμευμένη σειρά παραπάνω, ποτέ για πραγματικό αριθμό.
const TEST_PHONE_PASSWORD = "skipperfinder-ghost-test-phone";

// Αντικαθιστά sendOtp+verifyOtp για ένα δεσμευμένο τηλέφωνο δοκιμής: αντί για
// πραγματικό SMS, ένα service-role API route (δημιουργεί ή ξαναβρίσκει την
// ίδια ταυτότητα και της βάζει τον σταθερό κωδικό δοκιμής) και μετά μια
// πραγματική signInWithPassword — ίδιο μοτίβο ακριβώς με το ήδη υπάρχον
// loginAsTestAccount/impersonate, απλά για ΝΕΑ εγγραφή αντί για υπάρχοντα
// λογαριασμό. Ό,τι ακολουθεί (createUserDraft/complete_registration,
// set-pin, προσγείωση στο dashboard) περνάει από τον πραγματικό κώδικα.
export async function testPhoneSignIn(phone) {
  const normalized = normalizePhone(phone);
  if (!isReservedTestPhone(normalized)) throw new Error("not_a_test_phone");
  const db = requireDb();
  const res = await fetch("/api/platform/auth/test-signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalized }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "test_signin_failed");
  const { data, error } = await db.auth.signInWithPassword({ phone: normalized, password: TEST_PHONE_PASSWORD });
  if (error) throw error;
  return data.session;
}

// ---------------------------------------------------------------------------
// Manual (admin-verified) registration — for real phone numbers, while SMS
// OTP isn't configured yet (platform_settings.otp_enabled = 0). Same shape
// as testPhoneSignIn above (service-role route mints/finds the identity and
// hands back a one-time password to sign in with immediately), but this one
// is for genuine new users: the password is random per call, never a shared
// constant, and register/page.js follows it straight into /platform/set-pin
// so that random password is overwritten by the one the person actually
// chooses within seconds. The account it creates starts unverified
// (complete_registration's p_phone_verified: false, see below) — an admin
// has to confirm it's a real person before it can do anything (see
// PlatformShell.js's VerificationGate).
export async function pendingSignIn(phone) {
  const normalized = normalizePhone(phone);
  if (isReservedTestPhone(normalized)) throw new Error("use_test_signin_instead");
  const db = requireDb();
  const res = await fetch("/api/platform/auth/pending-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalized }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "pending_signup_failed");
  const { data, error } = await db.auth.signInWithPassword({ phone: normalized, password: body.password });
  if (error) throw error;
  return data.session;
}

// Whether the register page should attempt real SMS OTP. Off by default
// (0075) until a provider is actually wired up; flip via Ρυθμίσεις once it
// is — both paths (OTP and admin verification) keep working after that, see
// the migration's own comment for why they don't conflict.
export async function getOtpEnabled() {
  const value = await getPlatformSetting("otp_enabled").catch(() => 0);
  return Number(value) === 1;
}

// ---------------------------------------------------------------------------
// "View as" (admins only)
//
// When set, reads answer for the subject rather than the signed-in admin, so
// the real pages render with the real data instead of the admin's own showing
// through somebody else's dashboard. Kept here rather than threaded through
// every call site: a single missed argument would have silently mixed two
// people's data on one screen.
//
// Writes are refused outright while it is set. The database would refuse most
// of them anyway (ownership policies compare against auth.uid(), which is
// still the admin), but an admin does hold privileges over some of these
// tables, and "looked at the wrong tab and edited a stranger's profile" is
// exactly the accident this feature would otherwise invite.
// ---------------------------------------------------------------------------
let viewAsUserId = null;

export function setViewAsUser(id) {
  viewAsUserId = id || null;
}
export function getViewAsUser() {
  return viewAsUserId;
}
function assertNotViewing() {
  if (viewAsUserId) throw new Error("Προβολή ως χρήστης: οι αλλαγές είναι απενεργοποιημένες.");
}

// The id whose data should be read: the subject when viewing, otherwise the
// signed-in user.
async function actingUserId(db) {
  if (viewAsUserId) return viewAsUserId;
  const { data: auth } = await db.auth.getUser();
  return auth?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function sendOtp(phone) {
  const db = requireDb();
  const { error } = await db.auth.signInWithOtp({ phone: normalizePhone(phone) });
  if (error) throw error;
}

export async function verifyOtp(phone, token) {
  const db = requireDb();
  const { data, error } = await db.auth.verifyOtp({
    phone: normalizePhone(phone),
    token,
    type: "sms",
  });
  if (error) throw error;
  return data.session;
}

// Day-to-day sign-in: phone + the user's own PIN, which is the password on
// auth.users. Supabase does the hashing and comparison.
export async function signInWithPin(phone, pin) {
  const db = requireDb();
  const normalized = normalizePhone(phone);

  const allowed = await checkLoginAllowed(normalized);
  if (!allowed) throw new Error("locked_out");

  const { data, error } = await db.auth.signInWithPassword({ phone: normalized, password: pin });
  await recordLoginAttempt(normalized, !error);
  if (error) throw error;

  // Deletion (0074) and suspension (0078) only mark users.status — neither
  // touches the PIN, so the old password keeps working at the Auth layer.
  // Block both here explicitly. Deletion's only way back is re-registering
  // with the same phone (revives the row); suspension is lifted by an admin
  // (admin_reactivate_account) — nothing the person themselves can do.
  const { data: row } = await db.from("users").select("status").eq("id", data.session.user.id).maybeSingle();
  if (row?.status === "deleted") {
    await db.auth.signOut();
    throw new Error("account_deleted");
  }
  if (row?.status === "suspended") {
    await db.auth.signOut();
    throw new Error("account_suspended");
  }

  return data.session;
}

// Consecutive failures since the last success. See the migration's note: this
// is a UX guard the UI honours, not an enforced security boundary — Supabase's
// own rate limiting is what protects the endpoint itself.
export async function checkLoginAllowed(phone) {
  const db = requireDb();
  const { data, error } = await db.rpc("check_login_rate_limit", { p_phone: normalizePhone(phone) });
  if (error) return true; // never lock someone out because the check itself broke
  return data !== false;
}

async function recordLoginAttempt(phone, success) {
  const db = requireDb();
  await db.from("login_attempts").insert({ phone, success });
}

// The PIN is chosen by the user; the OTP they just passed is what proves
// identity. Minimum length only — no imposed shape.
export async function setPin(pin) {
  const db = requireDb();
  if (!pin || pin.length < 6) throw new Error("pin_too_short");
  const { error } = await db.auth.updateUser({ password: pin });
  if (error) throw error;

  const { data: auth } = await db.auth.getUser();
  const phone = auth?.user?.phone ? `+${auth.user.phone.replace(/^\+/, "")}` : null;
  if (phone) await db.rpc("clear_login_attempts", { p_phone: phone });
}

export async function signOut() {
  const db = requireDb();
  await db.auth.signOut();
}

// Anonymizes the account and frees the phone number for a future
// registration (see the API route for why this can't be a plain client-side
// RPC call: it also has to clear auth.users.phone via the Admin API, which
// needs the service-role key). Caller must be signed out afterward — the
// session stays technically valid until it expires, but the underlying
// users row is gone the moment this returns.
export async function deleteMyAccount() {
  const db = requireDb();
  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("not_authenticated");

  const res = await fetch("/api/platform/account/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "delete_failed");
}

// Admin-initiated deletion of someone else's account — same underlying
// route and RPC, just with a target id. The route itself re-checks that the
// caller is actually an admin; this isn't the security boundary, only a
// convenience wrapper.
export async function adminDeleteAccount(userId, notes) {
  const db = requireDb();
  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("not_authenticated");

  const res = await fetch("/api/platform/account/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, notes: notes || null }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "delete_failed");
}

export async function getSession() {
  const db = requireDb();
  const { data } = await db.auth.getSession();
  return data.session;
}

// Records that this account was around. Skipped entirely while viewing as
// someone else — otherwise an admin's browsing would keep marking a dormant
// account as active, which is exactly the signal it exists to measure.
export async function touchLastSeen() {
  if (viewAsUserId) return;
  const db = requireDb();
  // try/catch, not .catch(): the object rpc() returns is a thenable with a
  // then() and no catch(), so `.catch(...)` threw a TypeError before the
  // request was ever sent — which meant last_seen_at was never written and
  // every account read as "δεν έχει μπει ποτέ".
  try {
    await db.rpc("touch_last_seen");
  } catch {
    // An activity ping is never worth failing a page load over.
  }
}

// ---------------------------------------------------------------------------
// Users / profile bootstrap
// ---------------------------------------------------------------------------
export async function getMyUserRow() {
  const db = requireDb();
  const uid = await actingUserId(db);
  if (!uid) return null;
  const { data, error } = await db.from("users").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  return data;
}

// Called straight after OTP verification, from the shared registration form.
// Professionals land as 'draft' — their profile is still empty at this point —
// while clients are usable immediately.
//
// crewRole carries the requested profession (skipper/hostess/cook/deckhand).
// skipper and hostess share the same skipper_profiles table (distinguished
// by its own `role` column); cook/deckhand aren't backed by one yet, so they
// get a users row and nothing more, until each gets its own step the way
// hostess just did.
export async function createUserDraft({ fullName, phone, email, crewRole, phoneVerified = true }) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("not_authenticated");

  // The registration form marks this required, but that only holds while
  // the form itself enforces it — this is the actual boundary, so an empty
  // name can never reach the row no matter what called us. Without this, a
  // skipped/bypassed name field produces a real account with a photo and no
  // name later, indistinguishable from a genuine ghost profile.
  const trimmedName = fullName?.trim();
  if (!trimmedName) throw new Error("Το ονοματεπώνυμο είναι υποχρεωτικό.");

  // Server-side (0074): if this same phone/auth identity was previously
  // soft-deleted, this revives that exact row — same id, same rating/
  // reliability/booking history — instead of leaving raw table inserts to
  // silently no-op on the id conflict. Has to be a SECURITY DEFINER RPC:
  // reviving needs to touch users.status and skipper_profiles.deleted_at/
  // approval_status, both locked against a plain client-side write by the
  // guard triggers on those tables.
  const { error } = await db.rpc("complete_registration", {
    p_full_name: trimmedName,
    p_email: email?.trim() || null,
    p_phone: normalizePhone(phone),
    p_crew_role: crewRole || null,
    p_phone_verified: phoneVerified,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Forgot PIN
// ---------------------------------------------------------------------------

// SMS route: a fresh OTP proves the phone again, then the user picks a new
// PIN. Same two calls as registration, so nothing new is needed server-side.
export async function requestPinResetSms(phone) {
  return sendOtp(phone);
}

export async function confirmPinResetSms(phone, otp, newPin) {
  await verifyOtp(phone, otp);
  await setPin(newPin);
}

// Email route: the email was never verified through Supabase, so this can't
// use Supabase's own recovery. Both halves run server-side — a client that
// could mint its own reset code could also read it.
export async function requestPinResetEmail(phone) {
  const res = await fetch("/api/platform/pin-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalizePhone(phone) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "request_failed");
  return body;
}

export async function confirmPinResetEmail(phone, code, newPin) {
  const res = await fetch("/api/platform/pin-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalizePhone(phone), code, newPin }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "confirm_failed");
  return body;
}

// Repairs a users row that's missing its role-specific profile row (e.g. a
// signup interrupted after the users insert but before the profile insert).
// Unlike createAccount(), this never touches the users table.
export async function createMissingProfile(role) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("not_authenticated");

  if (role === "client") {
    const { error } = await db.from("client_profiles").insert({ user_id: auth.user.id });
    // 23505 = unique_violation: the row already exists (e.g. a previous
    // click succeeded but the UI didn't refresh in time) — that's the
    // desired end state, not a failure, so don't throw.
    if (error && error.code !== "23505") throw error;
  } else if (role === "skipper") {
    const { error } = await db.from("skipper_profiles").insert({
      user_id: auth.user.id,
      full_name: "",
      price_per_day: 210,
    });
    if (error && error.code !== "23505") throw error;
  }
}

// nationality_id ζει πλέον μόνο στο users (0081) — ίδιο σκεπτικό με το
// getMySkipperProfile παρακάτω.
export async function getMyClientProfile() {
  const db = requireDb();
  const uid = await actingUserId(db);
  if (!uid) return null;
  const { data, error } = await db
    .from("client_profiles")
    .select("*, users!user_id(nationality_id)")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { users: u, ...rest } = data;
  return { ...rest, nationality_id: u?.nationality_id ?? null };
}

// photo_url/nationality_id ζουν πλέον μόνο στο users (0081) — ίδιο άτομο,
// μία τιμή, όποιο προφίλ κι αν έχει. Ο εμφωλευμένος join τα ξαναφέρνει εδώ
// σαν να ήταν ακόμα στήλες του skipper_profiles, ώστε ProfileForm να μη
// χρειάζεται να ξέρει τίποτα γι' αυτή τη μετακίνηση.
export async function getMySkipperProfile() {
  const db = requireDb();
  const uid = await actingUserId(db);
  if (!uid) return null;
  const { data, error } = await db
    .from("skipper_profiles")
    .select("*, users!user_id(photo_url, nationality_id)")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { users: u, ...rest } = data;
  return { ...rest, photo_url: u?.photo_url ?? null, nationality_id: u?.nationality_id ?? null };
}

// photo_url/nationality_id πάνε στο users αντί για το skipper_profiles —
// δεν υπάρχουν πια ως στήλες εκεί (0081). Ό,τι άλλο μένει πάει κανονικά στο
// skipper_profiles όπως πριν.
export async function updateSkipperProfile(fields) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { photo_url, nationality_id, ...profileFields } = fields;

  if (Object.keys(profileFields).length > 0) {
    const { error } = await db.from("skipper_profiles").update(profileFields).eq("user_id", auth.user.id);
    if (error) throw error;
  }

  const userUpdate = {};
  if (photo_url !== undefined) userUpdate.photo_url = photo_url;
  if (nationality_id !== undefined) userUpdate.nationality_id = nationality_id;
  if (Object.keys(userUpdate).length > 0) {
    const { error } = await db.from("users").update(userUpdate).eq("id", auth.user.id);
    if (error) throw error;
  }
}

// Ports are deliberately absent: since migration 0013 they live on each
// availability window, so skipper_coverage_areas no longer feeds search or
// anything a user can see. Reading and rewriting it on every profile save
// only kept dead rows in sync with nothing.
//
// Οι γλώσσες πάνε πλέον σε user_languages (0081), keyed by user_id — ίδιος
// πίνακας είτε επαγγελματίας είτε πελάτης, οπότε δεν χρειάζεται πια το
// χειροκίνητο συγχρονισμό με setClientLanguages που υπήρχε εδώ πριν.
export async function setSkipperLookups(skipperId, { languageIds = [], boatTypeIds = [] }) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  await db.from("user_languages").delete().eq("user_id", auth.user.id);
  await db.from("skipper_boat_types").delete().eq("skipper_id", skipperId);
  if (languageIds.length)
    await db.from("user_languages").insert(languageIds.map((language_id) => ({ user_id: auth.user.id, language_id })));
  if (boatTypeIds.length)
    await db.from("skipper_boat_types").insert(boatTypeIds.map((boat_type_id) => ({ skipper_id: skipperId, boat_type_id })));
}

// skipperId εδώ είναι το skipper_profiles.id (όχι user_id) — το ίδιο id που
// ήδη περνάει το ProfileForm· ο μετασχηματισμός σε user_id γίνεται εδώ μέσα,
// ώστε να μη χρειαστεί να αλλάξει κανένα call site.
export async function getSkipperLookups(skipperId) {
  const db = requireDb();
  const { data: sp } = await db.from("skipper_profiles").select("user_id").eq("id", skipperId).maybeSingle();
  const [langs, boats] = await Promise.all([
    sp?.user_id
      ? db.from("user_languages").select("language_id").eq("user_id", sp.user_id)
      : Promise.resolve({ data: [] }),
    db.from("skipper_boat_types").select("boat_type_id").eq("skipper_id", skipperId),
  ]);
  if (langs.error) throw langs.error;
  if (boats.error) throw boats.error;
  return {
    languageIds: (langs.data || []).map((r) => r.language_id),
    boatTypeIds: (boats.data || []).map((r) => r.boat_type_id),
  };
}

// ---------------------------------------------------------------------------
// Second (third...) roles — a professional working as more than one
// specialty (e.g. skipper AND cook) on the same account. Plain table access
// under RLS, same pattern as the profile itself: the owner can insert/update/
// delete their own rows, a trigger on the database side keeps them from
// setting approval_status or the rating fields directly.
// ---------------------------------------------------------------------------
export async function getMySecondaryRoles(skipperId) {
  const db = requireDb();
  const { data, error } = await db.from("skipper_secondary_roles").select("*").eq("skipper_id", skipperId).is("deleted_at", null);
  if (error) throw error;
  return data || [];
}

export async function addSecondaryRole(skipperId, { role, pricePerDay, licenseNumber, licenseType, yearsExperience }) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db
    .from("skipper_secondary_roles")
    .insert({
      skipper_id: skipperId,
      role,
      price_per_day: pricePerDay,
      license_number: licenseNumber || null,
      license_type: licenseType || null,
      years_experience: yearsExperience || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSecondaryRole(id, { pricePerDay, licenseNumber, licenseType, yearsExperience }) {
  assertNotViewing();
  const db = requireDb();
  const fields = {};
  if (pricePerDay !== undefined) fields.price_per_day = pricePerDay;
  if (licenseNumber !== undefined) fields.license_number = licenseNumber || null;
  if (licenseType !== undefined) fields.license_type = licenseType || null;
  if (yearsExperience !== undefined) fields.years_experience = yearsExperience;
  const { error } = await db.from("skipper_secondary_roles").update(fields).eq("id", id);
  if (error) throw error;
}

export async function removeSecondaryRole(id) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("skipper_secondary_roles").delete().eq("id", id);
  if (error) throw error;
}

export async function adminListPendingSecondaryRoles() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_pending_secondary_roles");
  if (error) throw error;
  return data || [];
}

export async function adminApproveSecondaryRole(id) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_approve_secondary_role", { p_id: id });
  if (error) throw error;
  return data;
}

export async function adminRejectSecondaryRole(id, notes) {
  const db = requireDb();
  const { error } = await db.rpc("admin_reject_secondary_role", { p_id: id, p_notes: notes || null });
  if (error) throw error;
}

// nationality_id ζει στο users, όχι στο client_profiles πια (0081) — ίδιο
// σκεπτικό με το updateSkipperProfile παραπάνω.
export async function updateClientProfile(fields) {
  assertNotViewing();
  const db = requireDb();
  const uid = await actingUserId(db);
  const { nationality_id, ...profileFields } = fields;

  if (Object.keys(profileFields).length > 0) {
    const { error } = await db.from("client_profiles").update(profileFields).eq("user_id", uid);
    if (error) throw error;
  }
  if (nationality_id !== undefined) {
    const { error } = await db.from("users").update({ nationality_id }).eq("id", uid);
    if (error) throw error;
  }
}

// clientId εδώ είναι ήδη users.id (βλ. ClientIdentityProfile) — user_languages
// είναι keyed το ίδιο, οπότε καμία μετατροπή δεν χρειάζεται.
export async function setClientLanguages(clientId, languageIds = []) {
  assertNotViewing();
  const db = requireDb();
  await db.from("user_languages").delete().eq("user_id", clientId);
  if (languageIds.length)
    await db.from("user_languages").insert(languageIds.map((language_id) => ({ user_id: clientId, language_id })));
}

export async function getClientLanguages(clientId) {
  const db = requireDb();
  const { data, error } = await db.from("user_languages").select("language_id").eq("user_id", clientId);
  if (error) throw error;
  return (data || []).map((r) => r.language_id);
}

// ---------------------------------------------------------------------------
// Availability windows
//
// A window says "available these dates, in these regions" — a professional
// picks broad sailing regions (Αττική, Κυκλάδες...), never specific ports.
// Matching a client's chosen departure port then goes through that port's
// region, so a professional never needs to have declared a port by name for
// it to match. Regions belong to the window rather than the profile, because
// where someone works changes with the season — Κυκλάδες in summer, Αττική
// in winter — and a single global region list can't express that.
// ---------------------------------------------------------------------------
export async function listAvailabilityWindows(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("availability_windows")
    .select("*, availability_window_regions(region_id, regions(name))")
    .eq("skipper_id", skipperId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

export async function addAvailabilityWindow(skipperId, { startDate, endDate, regionIds }) {
  assertNotViewing();
  const db = requireDb();

  // Declaring the same dates twice (e.g. tapping "mark whole month" again to
  // add another region) should widen the existing window rather than stack
  // an identical duplicate row next to it. Overlapping windows with
  // *different* dates stay separate — that's a legitimate way to express
  // seasons.
  const { data: existing, error: exErr } = await db
    .from("availability_windows")
    .select("id")
    .eq("skipper_id", skipperId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    if (regionIds?.length) {
      const { error } = await db
        .from("availability_window_regions")
        .upsert(
          regionIds.map((region_id) => ({ window_id: existing.id, region_id })),
          { onConflict: "window_id,region_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    }
    return existing;
  }

  const { data, error } = await db
    .from("availability_windows")
    .insert({ skipper_id: skipperId, start_date: startDate, end_date: endDate })
    .select("id")
    .single();
  if (error) throw error;

  if (regionIds?.length) {
    const { error: rErr } = await db
      .from("availability_window_regions")
      .insert(regionIds.map((region_id) => ({ window_id: data.id, region_id })));
    if (rErr) throw rErr;
  }
  return data;
}

export async function removeAvailabilityWindow(id) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("availability_windows").delete().eq("id", id);
  if (error) throw error;
}

// Blocks subtract from windows (holiday inside an otherwise open season).
// Removing the block reopens exactly the days it covered, which splitting the
// window by hand could never give back.
export async function listAvailabilityBlocks(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("availability_blocks")
    .select("*")
    .eq("skipper_id", skipperId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

export async function addAvailabilityBlock(skipperId, { startDate, endDate, reason }) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("availability_blocks").insert({
    skipper_id: skipperId,
    start_date: startDate,
    end_date: endDate,
    reason: reason?.trim() || null,
  });
  if (error) throw error;
}

export async function removeAvailabilityBlock(id) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("availability_blocks").delete().eq("id", id);
  if (error) throw error;
}

export async function hasFutureAvailability(skipperId) {
  const db = requireDb();
  const { data, error } = await db.rpc("has_future_availability", { p_skipper_id: skipperId });
  if (error) return false;
  return data === true;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export async function listLookups() {
  const db = requireDb();
  const [languages, boatTypes, ports, nationalities, regions] = await Promise.all([
    db.from("languages").select("*").order("name"),
    db.from("boat_types").select("*").order("name"),
    // Only ports still in scope, ordered primary-then-secondary so display
    // order comes from the data (brief §3), not from a hardcoded UI list.
    db
      .from("ports")
      .select("*, regions(name)")
      .eq("active", true)
      .order("tier")
      .order("region_id")
      .order("name"),
    db.from("nationalities").select("*").order("name"),
    db.from("regions").select("*").order("name"),
  ]);
  if (languages.error) throw languages.error;
  if (boatTypes.error) throw boatTypes.error;
  if (ports.error) throw ports.error;
  if (nationalities.error) throw nationalities.error;
  if (regions.error) throw regions.error;
  return {
    languages: languages.data || [],
    boatTypes: boatTypes.data || [],
    ports: ports.data || [],
    regions: regions.data || [],
    nationalities: nationalities.data || [],
  };
}

export async function getPlatformSetting(key) {
  const db = requireDb();
  const { data, error } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export async function searchSkippers({ startDate, endDate, regionId, boatTypeId, maxPrice, gender, crewRole, languageId }) {
  const db = requireDb();
  const { data, error } = await db.rpc("search_available_skippers", {
    p_start: startDate,
    p_end: endDate,
    p_region_id: regionId,
    // Only skipper results are ever tied to a boat type — an empty string
    // from an unfilled/hidden select must reach the RPC as null, not "".
    p_boat_type_id: boatTypeId || null,
    p_max_price: maxPrice || null,
    p_gender: gender || null,
    p_crew_role: crewRole || "skipper",
    p_language_id: languageId || null,
  });
  if (error) throw error;
  return data || [];
}

// A booking/request's point of departure — and, since most ναύλα start and
// end at the same place but plenty don't, its point of arrival too when that
// differs. Client-made requests carry free-typed place names (region picked
// from the list, exact spots typed by hand — see migrations 0049/0079) so
// uncatalogued spots aren't excluded; admin-assigned jobs still carry a
// curated port instead, with no separate arrival concept. Never both.
export function departureLabel(row) {
  if (row?.departure_point) {
    const from = row.regions?.name ? `${row.departure_point} (${row.regions.name})` : row.departure_point;
    if (row.arrival_point && row.arrival_point !== row.departure_point) {
      return `${from} → ${row.arrival_point}`;
    }
    return from;
  }
  return row?.ports?.name || "—";
}

// ---------------------------------------------------------------------------
// Booking requests / broadcast / claim / cancel
// ---------------------------------------------------------------------------
export async function createBookingRequest({
  startDate,
  endDate,
  regionId,
  departurePoint,
  arrivalPoint,
  boatTypeId,
  maxPriceFilter,
  crewRole,
  partySize,
  privateCabin,
}) {
  assertNotViewing();
  const db = requireDb();
  // assertNotViewing() above guarantees this is the signed-in user.
  const uid = await actingUserId(db);
  const { data, error } = await db
    .from("booking_requests")
    .insert({
      client_id: uid,
      start_date: startDate,
      end_date: endDate,
      region_id: regionId,
      departure_point: departurePoint?.trim() || null,
      arrival_point: arrivalPoint?.trim() || null,
      boat_type_id: boatTypeId || null,
      max_price_filter: maxPriceFilter || null,
      crew_role: crewRole || "skipper",
      party_size: partySize || null,
      private_cabin: privateCabin ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function payAndBroadcast(requestId, skipperIds) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("pay_and_broadcast", {
    p_request_id: requestId,
    p_skipper_ids: skipperIds,
  });
  if (error) throw error;
  return data;
}

export async function claimBookingRequest(requestId, skipperId) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("claim_booking_request", {
    p_request_id: requestId,
    p_skipper_id: skipperId,
  });
  if (error) {
    // Ένα date_overlap αναιρεί κάθε αλλαγή που έκανε η claim_booking_request
    // στην ίδια κλήση (η Postgres κάνει rollback ολόκληρη τη συνάρτηση όταν
    // σηκώνεται εξαίρεση) — άρα το ping μένει 'pending' αντί για 'missed'.
    // Το κλείνουμε εδώ με ξεχωριστή, ανεξάρτητη κλήση.
    if (error.message === "date_overlap") {
      try {
        await declineBookingRequest(requestId, skipperId);
      } catch {}
    }
    throw error;
  }
  return data;
}

export async function cancelBooking(bookingId, reason) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason });
  if (error) throw error;
  return data;
}

export async function listMyBookingRequests() {
  const db = requireDb();
  const uid = await actingUserId(db);
  const { data, error } = await db
    .from("booking_requests")
    .select("*, ports(name), regions(name), boat_types(name)")
    .eq("client_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Who got pinged for one of the caller's own open requests, and each one's
// current status — RLS already scopes this to the request's own client
// (owns_booking_request), so a plain select is enough, no RPC needed.
export async function listRequestPings(requestId) {
  const db = requireDb();
  const { data, error } = await db
    .from("booking_request_pings")
    .select("*, skipper_profiles(full_name, role, photo_url, rating_avg, rating_count, reliability_percentage)")
    .eq("booking_request_id", requestId)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Removes one still-pending professional from an open request without
// touching the others — for when the client changes their mind about one
// specific person before that person has answered.
export async function withdrawPing(requestId, pingId) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("client_withdraw_ping", { p_request_id: requestId, p_ping_id: pingId });
  if (error) throw error;
}

// Closes the whole open request at once (e.g. crew was found elsewhere) —
// refunds the request fee if it was paid, same as an unanswered request
// expiring on its own, just triggered by the client instead of the clock.
export async function cancelBookingRequest(requestId) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("cancel_booking_request", { p_request_id: requestId });
  if (error) throw error;
}

export async function listMyBookingsAsClient() {
  const db = requireDb();
  const uid = await actingUserId(db);
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), regions(name), boat_types(name)")
    .eq("client_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listMyBookingsAsSkipper(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), regions(name), boat_types(name)")
    .eq("skipper_id", skipperId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listMyPings(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("booking_request_pings")
    .select(
      "*, booking_requests(*, ports(name), regions(name), boat_types(name), client_profiles(rating_avg,rating_count,reliability_percentage," +
        "rating_avg_boat_respect,rating_avg_responsibility,rating_avg_cooperation,rating_avg_consistency,rating_avg_conduct,rating_avg_tidiness," +
        // nationality/languages ζουν στο users πια (0081), όχι στο
        // client_profiles — ένα επίπεδο βαθύτερο embed αντί για δύο ίδιου
        // επιπέδου foreign keys πάνω στο client_profiles.
        "users!user_id(nationalities(name,flag_emoji,country_name),user_languages(languages(name)))))"
    )
    .eq("skipper_id", skipperId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// RLS already lets a user read their own ledger rows directly (user_id =
// auth.uid()) — no RPC needed, unlike the admin-facing equivalent.
export async function listMyWalletTransactions() {
  const db = requireDb();
  const uid = await actingUserId(db);
  const { data, error } = await db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

// Declining is a response, not a non-answer: it clears the inbox and counts
// toward responsiveness the same way claiming does.
export async function declineBookingRequest(requestId, skipperId) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("decline_booking_request", {
    p_request_id: requestId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
}

// Threads with at least one message, newest first, for either side of a
// booking — the envelope's list.
export async function listMyConversations() {
  const db = requireDb();
  const { data, error } = await db.rpc("my_conversations", { p_user_id: viewAsUserId });
  if (error) throw error;
  return data || [];
}

export async function listMyNotifications(limit = 30) {
  const db = requireDb();
  const uid = await actingUserId(db);
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Null marks everything read; an explicit list marks just those.
export async function markNotificationsRead(ids = null) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("mark_notifications_read", { p_ids: ids });
  if (error) throw error;
}

// Behavioural standing, shown next to (never merged into) the star rating.
export async function getMyStanding() {
  const db = requireDb();
  const { data, error } = await db.rpc("my_standing", { p_user_id: viewAsUserId }).maybeSingle();
  if (error) throw error;
  return {
    responseRate: data?.response_rate != null ? Number(data.response_rate) : null,
    responded: data?.responded ?? 0,
    ignored: data?.ignored ?? 0,
    cancellations: data?.cancellations ?? 0,
    // Two different figures on purpose. rawReliability is the plain
    // completed-vs-cancelled ratio a client would read. cancelStanding is what
    // ranking uses: cancellations weighted by how much notice was given, aged
    // out over time, and penalised on a curve so repetition costs more than a
    // one-off. They are never shown as if they were the same number.
    rawReliability: data?.raw_reliability != null ? Number(data.raw_reliability) : null,
    cancelStanding: data?.cancel_standing != null ? Number(data.cancel_standing) : null,
    cancellationLoad: data?.cancel_load != null ? Number(data.cancel_load) : 0,
  };
}

// One round trip for the header's notification icons — open requests plus
// which bookings (if any) have an unread message — instead of loading the
// whole dashboard's data just to answer "is there anything new?".
//
// Takes no id: the function reads auth.uid() itself, so a caller can't ask
// about somebody else. Answers for clients and professionals alike.
export async function getMyNotificationCounts() {
  const db = requireDb();
  const { data, error } = await db.rpc("my_notification_counts", { p_user_id: viewAsUserId }).maybeSingle();
  if (error) throw error;
  return {
    pendingRequests: data?.pending_requests ?? 0,
    unreadBookingIds: data?.unread_booking_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// Identity reveal (post-confirmation)
// ---------------------------------------------------------------------------
// Both sides of a confirmed booking get the other's name and phone — one
// function for either direction, keyed by the booking rather than by
// "fetch a skipper" vs "fetch a client". The two used to be separate queries
// straight against skipper_profiles/users, and both were silently broken by
// RLS on the `users` table (only the owner or an admin can read a row there):
// the client's phone number, and the professional's name AND phone, never
// actually arrived. See 0029 for the full account of how each one failed.
export async function getBookingCounterpart(bookingId) {
  const db = requireDb();
  const { data, error } = await db.rpc("get_booking_counterpart", { p_booking_id: bookingId }).maybeSingle();
  if (error) throw error;
  return data;
}

// The one personal photo every account can have, client or professional —
// distinct from skipper_profiles.photo_url, which is the picture a
// professional curates for search results specifically.
export async function updateMyPhoto(photoUrl) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("not_authenticated");
  const { error } = await db.from("users").update({ photo_url: photoUrl }).eq("id", auth.user.id);
  if (error) throw error;
}

export async function getMyPendingReviewCount() {
  const db = requireDb();
  const { data, error } = await db.rpc("my_pending_review_count", { p_user_id: viewAsUserId });
  if (error) throw error;
  return data ?? 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export async function listMessages(bookingId) {
  const db = requireDb();
  const { data, error } = await db.from("messages").select("*").eq("booking_id", bookingId).order("sent_at");
  if (error) throw error;
  return data || [];
}

export async function sendMessage(bookingId, content) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { error } = await db.from("messages").insert({ booking_id: bookingId, sender_id: auth.user.id, content });
  if (error) throw error;
}

export async function markMessagesRead(bookingId) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("mark_messages_read", { p_booking_id: bookingId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
// `categories` — {safety, seamanship, professionalism, cleanliness,
// communication, hospitality}, all 1-5 — is required when revieweeId is the
// professional side of this booking, and must be omitted otherwise. The
// database enforces both halves of that itself (trg_review_categories) and
// computes the overall `rating` as their average when categories are given;
// `rating` here only matters for the plain client-review case.
export async function submitReview({ bookingId, revieweeId, rating, comment, categories }) {
  assertNotViewing();
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { error } = await db.from("reviews").insert({
    booking_id: bookingId,
    reviewer_id: auth.user.id,
    reviewee_id: revieweeId,
    rating: categories ? null : rating,
    comment,
    rating_safety: categories?.safety ?? null,
    rating_seamanship: categories?.seamanship ?? null,
    rating_professionalism: categories?.professionalism ?? null,
    rating_cleanliness: categories?.cleanliness ?? null,
    rating_communication: categories?.communication ?? null,
    rating_hospitality: categories?.hospitality ?? null,
    rating_cooking: categories?.cooking ?? null,
    rating_service: categories?.service ?? null,
    rating_boat_respect: categories?.boat_respect ?? null,
    rating_responsibility: categories?.responsibility ?? null,
    rating_cooperation: categories?.cooperation ?? null,
    rating_consistency: categories?.consistency ?? null,
    rating_conduct: categories?.conduct ?? null,
    rating_tidiness: categories?.tidiness ?? null,
    // Cook and deckhand's own axes (reviewCategories.js) — missing here meant
    // every cook/deckhand review submitted through the app failed at the
    // database with all_categories_required, since enforce_review_categories
    // requires exactly these six non-null for those two roles.
    rating_taste: categories?.taste ?? null,
    rating_variety: categories?.variety ?? null,
    rating_presentation: categories?.presentation ?? null,
    rating_adaptability: categories?.adaptability ?? null,
    rating_organization: categories?.organization ?? null,
    rating_maintenance: categories?.maintenance ?? null,
    rating_teamwork: categories?.teamwork ?? null,
    rating_diligence: categories?.diligence ?? null,
  });
  if (error) throw error;
}

export async function replyToReview(reviewId, reply) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("reviews").update({ reply }).eq("id", reviewId);
  if (error) throw error;
}

export async function listReviewsForBooking(bookingId) {
  const db = requireDb();
  const { data, error } = await db.from("reviews").select("*").eq("booking_id", bookingId);
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function adminListPendingSkippers() {
  const db = requireDb();
  // skipper_profiles έχει ΔΥΟ ξένα κλειδιά προς users (user_id και
  // approved_by) — χωρίς το !user_id το PostgREST δεν ξέρει ποιο από τα δύο
  // εννοούμε και αρνείται ολόκληρο το ερώτημα.
  const { data, error } = await db.from("skipper_profiles").select("*, users!user_id(phone_number)").eq("approval_status", "pending");
  if (error) throw error;
  return data || [];
}

export async function adminApproveSkipper(userId) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_approve_skipper", { p_user_id: userId });
  if (error) throw error;
  return data;
}

export async function adminRejectSkipper(userId, notes) {
  const db = requireDb();
  const { error } = await db.rpc("admin_reject_skipper", { p_user_id: userId, p_notes: notes || null });
  if (error) throw error;
}

export async function adminSoftDeleteSkipper(skipperId, notes) {
  const db = requireDb();
  const { error } = await db.rpc("admin_soft_delete_skipper", { p_skipper_id: skipperId, p_notes: notes || null });
  if (error) throw error;
}

export async function adminCreditWallet(userId, amount, notes) {
  const db = requireDb();
  const { error } = await db.rpc("admin_credit_wallet", { p_user_id: userId, p_amount: amount, p_notes: notes || null });
  if (error) throw error;
}

// One call for every headline figure on the console's overview, instead of
// six list queries the page then counts itself.
export async function adminOverview() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_overview");
  if (error) throw error;
  return data || {};
}

export async function adminRecentActivity(limit = 20) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_recent_activity", { p_limit: limit });
  if (error) throw error;
  return data || [];
}

export async function adminResolveReport(reportId, note) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("admin_resolve_report", { p_report_id: reportId, p_note: note || null });
  if (error) throw error;
}

export async function adminListSettings() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_settings");
  if (error) throw error;
  return data || [];
}

export async function adminUpdateSetting(key, value) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("admin_update_setting", { p_key: key, p_value: Number(value) });
  if (error) throw error;
}

// Who could take a job in a given window — the same availability rules the
// public search uses, so an operator is never offered someone the platform
// would not have offered a client.
export async function adminSearchAvailability({ role = "skipper", startDate, endDate, portId = null }) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_search_availability", {
    p_role: role,
    p_start: startDate,
    p_end: endDate,
    p_port_id: portId,
  });
  if (error) throw error;
  return data || [];
}

export async function adminCoverageNeeded() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_coverage_needed");
  if (error) throw error;
  return data || [];
}

export async function adminAssignReplacement(bookingId, skipperId) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("admin_assign_replacement", {
    p_booking_id: bookingId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
  return data;
}

// Offer a job to people you picked yourself, for them to accept or not.
//
// Two callers, one function: pass replacesBookingId to cover a cancellation
// (dates and client come from the cancelled booking, not from here), or pass
// the job details to hire for your own charter. Whoever accepts pays the claim
// fee, exactly as they would for any other request.
export async function adminCreateOffer({
  skipperIds,
  role = "skipper",
  startDate = null,
  endDate = null,
  portId = null,
  boatTypeId = null,
  replacesBookingId = null,
  claimFee = null,
  note = "",
  expiresHours = 24,
}) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("admin_create_offer", {
    p_skipper_ids: skipperIds,
    p_role: role,
    p_start: startDate,
    p_end: endDate,
    p_port_id: portId,
    p_boat_type_id: boatTypeId,
    p_replaces_booking_id: replacesBookingId,
    // null means "whatever the platform setting says"; an explicit 0 waives it.
    p_claim_fee: claimFee === null || claimFee === "" ? null : Number(claimFee),
    p_note: note,
    p_expires_hours: expiresHours,
  });
  if (error) throw error;
  return data;
}

export async function adminListOffers(includeClosed = false) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_offers", { p_include_closed: includeClosed });
  if (error) throw error;
  return data || [];
}

export async function adminCancelOffer(requestId) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("admin_cancel_offer", { p_request_id: requestId });
  if (error) throw error;
  return data;
}

// The console's account directory. One shape for clients and professionals
// alike, sorted server-side so the page never holds the whole table to sort it.
export async function adminListAccounts({
  role = null,
  crewRole = null,
  search = "",
  sort = "recent",
  limit = 200,
  invisibleOnly = false,
  deletedOnly = false,
  pendingVerificationOnly = false,
  suspendedOnly = false,
} = {}) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_accounts", {
    p_role: role,
    p_crew_role: crewRole,
    p_search: search,
    p_sort: sort,
    p_limit: limit,
    p_invisible_only: invisibleOnly,
    p_deleted_only: deletedOnly,
    p_pending_verification_only: pendingVerificationOnly,
    p_suspended_only: suspendedOnly,
  });
  if (error) throw error;
  return data || [];
}

// Αναστολή (0078): ενδιάμεσο βήμα ανάμεσα σε "τίποτα" και "Οριστική
// διαγραφή" — ο λογαριασμός σταματά να λειτουργεί (μπλοκάρεται η σύνδεση,
// κρύβεται από την αναζήτηση αν είναι επαγγελματίας) αλλά τίποτα δεν χάνεται
// και επαναφέρεται με ένα κλικ, χωρίς νέα εγγραφή. Ο λόγος είναι
// υποχρεωτικός — το νόημα είναι να θυμάται ο admin ΓΙΑΤΙ το έκανε.
export async function adminSuspendAccount(userId, reason) {
  const db = requireDb();
  const { error } = await db.rpc("admin_suspend_account", { p_user_id: userId, p_reason: reason });
  if (error) throw error;
}

export async function adminReactivateAccount(userId) {
  const db = requireDb();
  const { error } = await db.rpc("admin_reactivate_account", { p_user_id: userId });
  if (error) throw error;
}

// Χειροκίνητη επιβεβαίωση εγγραφής από τον admin (0075) — γράφει
// phone_verified_at, ίδιο σαν να είχε δουλέψει το πραγματικό SMS OTP.
export async function adminVerifyUser(userId) {
  const db = requireDb();
  const { error } = await db.rpc("admin_verify_user", { p_user_id: userId });
  if (error) throw error;
}

export async function adminActivityCounts() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_activity_counts");
  if (error) throw error;
  return data || {};
}

export async function adminListCancellationReports() {
  const db = requireDb();
  const { data, error } = await db
    .from("cancellation_reports")
    .select("*, bookings(*, ports(name), regions(name))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function adminListBookings() {
  const db = requireDb();
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), regions(name), boat_types(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function adminFindUserByPhone(phone) {
  const db = requireDb();
  const { data, error } = await db.from("users").select("*").ilike("phone_number", `%${phone.replace(/\D/g, "")}%`).limit(10);
  if (error) throw error;
  return data || [];
}

export async function adminSearchSkippersByName(name) {
  const db = requireDb();
  const { data, error } = await db
    .from("skipper_profiles")
    .select("*, users!user_id(phone_number)")
    .ilike("full_name", `%${name}%`)
    .limit(10);
  if (error) throw error;
  return data || [];
}

// Full account list for the admin console. Search matches either the phone
// number or the name, so the admin doesn't have to know which they have.
export async function adminListUsers({ search = "", role = "" } = {}) {
  const db = requireDb();
  let q = db
    .from("users")
    .select("id, role, full_name, phone_number, email, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (role) q = q.eq("role", role);

  const term = search.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    // or() takes a comma-separated filter list; match name OR phone.
    const filters = [`full_name.ilike.%${term}%`];
    if (digits) filters.push(`phone_number.ilike.%${digits}%`);
    q = q.or(filters.join(","));
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Populates the console with demo accounts. The server side verifies the
// caller is an admin from this token before doing anything.
export async function adminSeedDemoUsers() {
  const db = requireDb();
  const { data } = await db.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("not_authenticated");

  const res = await fetch("/api/platform/admin/seed-demo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "seed_failed");
  return body;
}

export async function adminSetTestAccount(userId, isTest) {
  const db = requireDb();
  const { error } = await db.rpc("admin_set_test_account", { p_user_id: userId, p_is_test: isTest });
  if (error) throw error;
}

export async function adminSetStaffAdmin(userId, flag) {
  const db = requireDb();
  const { error } = await db.rpc("admin_set_staff_admin", { p_user_id: userId, p_flag: flag });
  if (error) throw error;
}

// A real session swap, not the read-only "Προβολή ως": resets the target's
// PIN to a fresh random value server-side (service role, only for rows
// already marked is_test_account — see the API route) and signs in with it,
// exactly the way that account would sign in itself. The admin's own tokens
// are stashed first so returnToAdminSession() can restore them without
// asking for a PIN again.
export async function loginAsTestAccount(userId) {
  const db = requireDb();
  const { data: sessionData } = await db.auth.getSession();
  const current = sessionData?.session;
  if (!current?.access_token) throw new Error("not_authenticated");

  const res = await fetch("/api/platform/admin/impersonate", {
    method: "POST",
    headers: { Authorization: `Bearer ${current.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "impersonate_failed");

  // Stashed only after a successful reset, so a failed attempt never
  // overwrites an already-stashed admin session with a stale one.
  sessionStorage.setItem(
    "sf_admin_return_session",
    JSON.stringify({ access_token: current.access_token, refresh_token: current.refresh_token })
  );
  // A stale "Προβολή ως" pointer would otherwise sit alongside a genuinely
  // different, real session and confuse the two.
  sessionStorage.removeItem("sf_view_as");
  setViewAsUser(null);

  await signInWithPin(body.phone, body.pin);
}

export function hasStashedAdminSession() {
  return typeof window !== "undefined" && Boolean(sessionStorage.getItem("sf_admin_return_session"));
}

export async function returnToAdminSession() {
  const raw = typeof window !== "undefined" ? sessionStorage.getItem("sf_admin_return_session") : null;
  if (!raw) throw new Error("no_admin_session_to_restore");
  const { access_token, refresh_token } = JSON.parse(raw);
  const db = requireDb();
  const { error } = await db.auth.setSession({ access_token, refresh_token });
  sessionStorage.removeItem("sf_admin_return_session");
  if (error) throw error;
}

export async function adminGetUser(userId) {
  const db = requireDb();
  const { data, error } = await db.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Read-only "view as" — the admin sees what that account sees on its own
// dashboard. Deliberately NOT impersonation: no session is issued for the
// target user, so nothing can be done on their behalf, and their own session
// is untouched.
export async function adminGetUserOverview(userId, role) {
  const db = requireDb();

  // wallet_balance is one pool per person now (0059), held on users — not on
  // either profile table — so every branch below reads it from there and
  // folds it into `profile` to keep the shape the callers already expect.
  const walletBalance = db.from("users").select("wallet_balance").eq("id", userId).maybeSingle();

  if (role === "client") {
    const [profile, requests, bookings, wallet, userWallet] = await Promise.all([
      db.from("client_profiles").select("*").eq("user_id", userId).maybeSingle(),
      db.from("booking_requests").select("*, ports(name), regions(name), boat_types(name)").eq("client_id", userId).order("created_at", { ascending: false }),
      db.from("bookings").select("*, ports(name), regions(name), boat_types(name)").eq("client_id", userId).order("created_at", { ascending: false }),
      db.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      walletBalance,
    ]);
    if (profile.error) throw profile.error;
    if (requests.error) throw requests.error;
    if (bookings.error) throw bookings.error;
    return {
      role,
      profile: profile.data && { ...profile.data, wallet_balance: userWallet.data?.wallet_balance ?? 0 },
      requests: requests.data || [],
      bookings: bookings.data || [],
      wallet: wallet.data || [],
    };
  }

  if (role === "skipper") {
    const { data: rawProfile, error: pErr } = await db.from("skipper_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (pErr) throw pErr;
    if (!rawProfile) return { role, profile: null, bookings: [], pings: [], wallet: [], availability: [], lookups: null };
    const { data: userWallet } = await walletBalance;
    const profile = { ...rawProfile, wallet_balance: userWallet?.wallet_balance ?? 0 };

    const [bookings, pings, wallet, availability, langs, boats] = await Promise.all([
      db.from("bookings").select("*, ports(name), regions(name), boat_types(name)").eq("skipper_id", profile.id).order("created_at", { ascending: false }),
      db
        .from("booking_request_pings")
        .select("*, booking_requests(*, ports(name), regions(name), boat_types(name))")
        .eq("skipper_id", profile.id)
        .order("sent_at", { ascending: false }),
      db.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      // Declared availability windows, not the retired skipper_availability
      // blackout table — that one is never written to any more, so reading it
      // told the admin "no blacked-out days, available everywhere" for every
      // single profile, which is the exact opposite of what an empty
      // calendar now means.
      db
        .from("availability_windows")
        .select("*, availability_window_regions(regions(name))")
        .eq("skipper_id", profile.id)
        .order("start_date"),
      db.from("user_languages").select("languages(name)").eq("user_id", profile.user_id),
      db.from("skipper_boat_types").select("boat_types(name)").eq("skipper_id", profile.id),
    ]);
    if (bookings.error) throw bookings.error;
    if (pings.error) throw pings.error;

    return {
      role,
      profile,
      bookings: bookings.data || [],
      pings: pings.data || [],
      wallet: wallet.data || [],
      availability: availability.data || [],
      languages: (langs.data || []).map((r) => r.languages?.name).filter(Boolean),
      boatTypes: (boats.data || []).map((r) => r.boat_types?.name).filter(Boolean),
    };
  }

  return { role, profile: null };
}

export async function adminListActions() {
  const db = requireDb();
  const { data, error } = await db.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Φόρμα επικοινωνίας
//
// Καλείται και από επισκέπτη χωρίς λογαριασμό, οπότε δεν περνάει από
// assertNotViewing()/actingUserId(): η ίδια η συνάρτηση στη βάση διαβάζει το
// auth.uid() (null για ανώνυμο) και κάνει όλους τους ελέγχους εκεί.
// ---------------------------------------------------------------------------
export async function submitContactMessage({ name, contact, topic, message }) {
  const db = requireDb();
  const { error } = await db.rpc("submit_contact_message", {
    p_name: name,
    p_contact: contact,
    p_topic: topic,
    p_message: message,
  });
  if (error) throw error;
}

export async function adminListContactMessages(status = null) {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_contact_messages", { p_status: status });
  if (error) throw error;
  return data || [];
}

export async function adminSetContactMessageStatus(id, status, note = null) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("admin_set_contact_message_status", {
    p_id: id,
    p_status: status,
    p_note: note,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Μεταφορά σκάφους (boat delivery) — αυτοτελής λειτουργία, δικά της RPCs
// (βλ. 0067_boat_delivery.sql). Η τιμή είναι ελεύθερη ανά ρόλο· η προμήθεια
// της πλατφόρμας υπολογίζεται server-side από τα μίλια, όχι από την τιμή.
// ---------------------------------------------------------------------------
// Διαστήματα ημερομηνιών, όχι ένα on/off flag — ίδιο μοτίβο με τις
// δευτερεύουσες ειδικότητες (skipper_secondary_roles): απλή, owner-RLS,
// direct table access, χωρίς RPC.
export async function getMyDeliveryAvailabilityWindows(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("delivery_availability_windows")
    .select("*")
    .eq("skipper_id", skipperId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

export async function addDeliveryAvailabilityWindow(skipperId, crewRole, startDate, endDate) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db
    .from("delivery_availability_windows")
    .insert({ skipper_id: skipperId, crew_role: crewRole, start_date: startDate, end_date: endDate })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeDeliveryAvailabilityWindow(id) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.from("delivery_availability_windows").delete().eq("id", id);
  if (error) throw error;
}

export async function searchDeliveryCandidates(crewRole, startDate, endDate) {
  const db = requireDb();
  const { data, error } = await db.rpc("search_delivery_candidates", {
    p_crew_role: crewRole,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw error;
  return data || [];
}

export async function createDeliveryRequest({
  origin,
  destination,
  distanceMiles,
  dateMode,
  departureDate,
  flexibleDays,
  coversTickets,
  coversTravel,
  coversFood,
  foodAllowanceAmount,
  coversFuel,
  coversPortExpenses,
  notes,
}) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("create_delivery_request", {
    p_origin: origin,
    p_destination: destination,
    p_distance_miles: distanceMiles,
    p_date_mode: dateMode,
    p_departure_date: departureDate,
    p_flexible_days: flexibleDays || 0,
    p_covers_tickets: !!coversTickets,
    p_covers_travel: !!coversTravel,
    p_covers_food: !!coversFood,
    p_food_allowance_amount: coversFood && foodAllowanceAmount ? Number(foodAllowanceAmount) : null,
    p_covers_fuel: !!coversFuel,
    p_covers_port_expenses: !!coversPortExpenses,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data;
}

export async function createDeliveryRoleRequest(deliveryRequestId, crewRole, offeredPrice, skipperIds) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("create_delivery_role_request", {
    p_delivery_request_id: deliveryRequestId,
    p_crew_role: crewRole,
    p_offered_price: offeredPrice,
    p_skipper_ids: skipperIds,
  });
  if (error) throw error;
  return data;
}

export async function relistDeliveryRoleRequest(roleRequestId, newPrice, skipperIds) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("relist_delivery_role_request", {
    p_role_request_id: roleRequestId,
    p_new_price: newPrice,
    p_skipper_ids: skipperIds,
  });
  if (error) throw error;
  return data;
}

export async function acceptDeliveryRoleRequest(roleRequestId, skipperId) {
  assertNotViewing();
  const db = requireDb();
  const { data, error } = await db.rpc("accept_delivery_role_request", {
    p_role_request_id: roleRequestId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
  return data;
}

export async function declineDeliveryRoleRequest(roleRequestId, skipperId) {
  assertNotViewing();
  const db = requireDb();
  const { error } = await db.rpc("decline_delivery_role_request", {
    p_role_request_id: roleRequestId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
}

export async function listMyDeliveryRequests() {
  const db = requireDb();
  const { data, error } = await db.rpc("list_my_delivery_requests");
  if (error) throw error;
  return data || [];
}

export async function listMyDeliveryPings() {
  const db = requireDb();
  const { data, error } = await db.rpc("list_my_delivery_pings");
  if (error) throw error;
  return data || [];
}

export async function listMyDeliveryBookings() {
  const db = requireDb();
  const { data, error } = await db.rpc("list_my_delivery_bookings");
  if (error) throw error;
  return data || [];
}

export async function getDeliveryBookingCounterpart(deliveryBookingId) {
  const db = requireDb();
  const { data, error } = await db.rpc("get_delivery_booking_counterpart", {
    p_delivery_booking_id: deliveryBookingId,
  });
  if (error) throw error;
  return data?.[0] || null;
}

export async function adminListDeliveryRequests() {
  const db = requireDb();
  const { data, error } = await db.rpc("admin_list_delivery_requests");
  if (error) throw error;
  return data || [];
}
