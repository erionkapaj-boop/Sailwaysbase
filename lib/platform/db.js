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

export async function getSession() {
  const db = requireDb();
  const { data } = await db.auth.getSession();
  return data.session;
}

// ---------------------------------------------------------------------------
// Users / profile bootstrap
// ---------------------------------------------------------------------------
export async function getMyUserRow() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await db.from("users").select("*").eq("id", auth.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

// Called straight after OTP verification, from the shared registration form.
// Professionals land as 'draft' — their profile is still empty at this point —
// while clients are usable immediately.
//
// crewRole carries the requested profession (skipper/hostess/cook/deckhand).
// Only skipper has a table today, so the others get a users row and nothing
// more; the professional profile step will fill that gap.
export async function createUserDraft({ fullName, phone, email, crewRole }) {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("not_authenticated");

  const isProfessional = Boolean(crewRole);
  const { error: uErr } = await db.from("users").insert({
    id: auth.user.id,
    role: isProfessional ? "skipper" : "client",
    full_name: fullName?.trim() || null,
    email: email?.trim() || null,
    phone_number: normalizePhone(phone),
    phone_verified_at: new Date().toISOString(),
    status: isProfessional ? "draft" : "active",
  });
  if (uErr && uErr.code !== "23505") throw uErr;

  if (!isProfessional) {
    const { error } = await db.from("client_profiles").insert({ user_id: auth.user.id });
    if (error && error.code !== "23505") throw error;
  } else if (crewRole === "skipper") {
    // license_number is nullable now that phone is the identifier — the
    // platform no longer verifies licences.
    const { error } = await db.from("skipper_profiles").insert({
      user_id: auth.user.id,
      full_name: fullName?.trim() || "",
      price_per_day: 210,
    });
    if (error && error.code !== "23505") throw error;
  }
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

export async function getMyClientProfile() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await db
    .from("client_profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMySkipperProfile() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await db
    .from("skipper_profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSkipperProfile(fields) {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { error } = await db.from("skipper_profiles").update(fields).eq("user_id", auth.user.id);
  if (error) throw error;
}

// Ports are deliberately absent: since migration 0013 they live on each
// availability window, so skipper_coverage_areas no longer feeds search or
// anything a user can see. Reading and rewriting it on every profile save
// only kept dead rows in sync with nothing.
export async function setSkipperLookups(skipperId, { languageIds = [], boatTypeIds = [] }) {
  const db = requireDb();
  await db.from("skipper_languages").delete().eq("skipper_id", skipperId);
  await db.from("skipper_boat_types").delete().eq("skipper_id", skipperId);
  if (languageIds.length)
    await db.from("skipper_languages").insert(languageIds.map((language_id) => ({ skipper_id: skipperId, language_id })));
  if (boatTypeIds.length)
    await db.from("skipper_boat_types").insert(boatTypeIds.map((boat_type_id) => ({ skipper_id: skipperId, boat_type_id })));
}

export async function getSkipperLookups(skipperId) {
  const db = requireDb();
  const [langs, boats] = await Promise.all([
    db.from("skipper_languages").select("language_id").eq("skipper_id", skipperId),
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
// Availability windows
//
// A window says "available these dates, out of these ports". Ports belong to
// the window rather than the profile, because where someone works changes
// with the season — Mykonos in summer, Volos in winter — and a single global
// port list can't express that.
// ---------------------------------------------------------------------------
export async function listAvailabilityWindows(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("availability_windows")
    .select("*, availability_window_ports(port_id, ports(name, region))")
    .eq("skipper_id", skipperId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

export async function addAvailabilityWindow(skipperId, { startDate, endDate, allPorts, portIds }) {
  const db = requireDb();

  // Declaring the same dates twice (e.g. tapping "mark whole month" again to
  // add a second port) should widen the existing window rather than stack an
  // identical duplicate row next to it. Overlapping windows with *different*
  // dates stay separate — that's a legitimate way to express seasons.
  const { data: existing, error: exErr } = await db
    .from("availability_windows")
    .select("id, all_ports")
    .eq("skipper_id", skipperId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    if (allPorts && !existing.all_ports) {
      // "Anywhere" supersedes any specific list, so the rows become noise.
      const { error } = await db.from("availability_windows").update({ all_ports: true }).eq("id", existing.id);
      if (error) throw error;
      await db.from("availability_window_ports").delete().eq("window_id", existing.id);
    } else if (!allPorts && !existing.all_ports && portIds?.length) {
      const { error } = await db
        .from("availability_window_ports")
        .upsert(
          portIds.map((port_id) => ({ window_id: existing.id, port_id })),
          { onConflict: "window_id,port_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    }
    return existing;
  }

  const { data, error } = await db
    .from("availability_windows")
    .insert({
      skipper_id: skipperId,
      start_date: startDate,
      end_date: endDate,
      all_ports: Boolean(allPorts),
    })
    .select("id")
    .single();
  if (error) throw error;

  if (!allPorts && portIds?.length) {
    const { error: pErr } = await db
      .from("availability_window_ports")
      .insert(portIds.map((port_id) => ({ window_id: data.id, port_id })));
    if (pErr) throw pErr;
  }
  return data;
}

export async function removeAvailabilityWindow(id) {
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
  const [languages, boatTypes, ports] = await Promise.all([
    db.from("languages").select("*").order("name"),
    db.from("boat_types").select("*").order("name"),
    // Only ports still in scope, ordered primary-then-secondary so display
    // order comes from the data (brief §3), not from a hardcoded UI list.
    db
      .from("ports")
      .select("*")
      .eq("active", true)
      .order("tier")
      .order("region")
      .order("name"),
  ]);
  if (languages.error) throw languages.error;
  if (boatTypes.error) throw boatTypes.error;
  if (ports.error) throw ports.error;
  return { languages: languages.data || [], boatTypes: boatTypes.data || [], ports: ports.data || [] };
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
export async function searchSkippers({ startDate, endDate, portId, boatTypeId, maxPrice, gender }) {
  const db = requireDb();
  const { data, error } = await db.rpc("search_available_skippers", {
    p_start: startDate,
    p_end: endDate,
    p_port_id: portId,
    p_boat_type_id: boatTypeId,
    p_max_price: maxPrice || null,
    p_gender: gender || null,
  });
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Booking requests / broadcast / claim / cancel
// ---------------------------------------------------------------------------
export async function createBookingRequest({ startDate, endDate, portId, boatTypeId, maxPriceFilter, genderFilter }) {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from("booking_requests")
    .insert({
      client_id: auth.user.id,
      start_date: startDate,
      end_date: endDate,
      port_id: portId,
      boat_type_id: boatTypeId,
      max_price_filter: maxPriceFilter || null,
      gender_filter: genderFilter || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function payAndBroadcast(requestId, skipperIds) {
  const db = requireDb();
  const { data, error } = await db.rpc("pay_and_broadcast", {
    p_request_id: requestId,
    p_skipper_ids: skipperIds,
  });
  if (error) throw error;
  return data;
}

export async function claimBookingRequest(requestId, skipperId) {
  const db = requireDb();
  const { data, error } = await db.rpc("claim_booking_request", {
    p_request_id: requestId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
  return data;
}

export async function cancelBooking(bookingId, reason) {
  const db = requireDb();
  const { data, error } = await db.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason });
  if (error) throw error;
  return data;
}

export async function listMyBookingRequests() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from("booking_requests")
    .select("*, ports(name), boat_types(name)")
    .eq("client_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listMyBookingsAsClient() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), boat_types(name)")
    .eq("client_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listMyBookingsAsSkipper(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), boat_types(name)")
    .eq("skipper_id", skipperId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listMyPings(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("booking_request_pings")
    .select("*, booking_requests(*, ports(name), boat_types(name), client_profiles(rating_avg,rating_count,reliability_percentage))")
    .eq("skipper_id", skipperId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// RLS already lets a user read their own ledger rows directly (user_id =
// auth.uid()) — no RPC needed, unlike the admin-facing equivalent.
export async function listMyWalletTransactions() {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

// Declining is a response, not a non-answer: it clears the inbox and counts
// toward responsiveness the same way claiming does.
export async function declineBookingRequest(requestId, skipperId) {
  const db = requireDb();
  const { error } = await db.rpc("decline_booking_request", {
    p_request_id: requestId,
    p_skipper_id: skipperId,
  });
  if (error) throw error;
}

export async function listMyNotifications(limit = 30) {
  const db = requireDb();
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Null marks everything read; an explicit list marks just those.
export async function markNotificationsRead(ids = null) {
  const db = requireDb();
  const { error } = await db.rpc("mark_notifications_read", { p_ids: ids });
  if (error) throw error;
}

// Behavioural standing, shown next to (never merged into) the star rating.
export async function getMyStanding() {
  const db = requireDb();
  const { data, error } = await db.rpc("my_standing").maybeSingle();
  if (error) throw error;
  return {
    responseRate: data?.response_rate != null ? Number(data.response_rate) : null,
    responded: data?.responded ?? 0,
    ignored: data?.ignored ?? 0,
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
  const { data, error } = await db.rpc("my_notification_counts").maybeSingle();
  if (error) throw error;
  return {
    pendingRequests: data?.pending_requests ?? 0,
    unreadBookingIds: data?.unread_booking_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// Identity reveal (post-confirmation)
// ---------------------------------------------------------------------------
export async function getRevealedSkipper(skipperId) {
  const db = requireDb();
  const { data, error } = await db.from("skipper_profiles").select("*, users(phone_number,email)").eq("id", skipperId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRevealedClient(clientUserId) {
  const db = requireDb();
  const { data, error } = await db.from("users").select("phone_number,email").eq("id", clientUserId).maybeSingle();
  if (error) throw error;
  return data;
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
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { error } = await db.from("messages").insert({ booking_id: bookingId, sender_id: auth.user.id, content });
  if (error) throw error;
}

export async function markMessagesRead(bookingId) {
  const db = requireDb();
  const { error } = await db.rpc("mark_messages_read", { p_booking_id: bookingId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export async function submitReview({ bookingId, revieweeId, rating, comment }) {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  const { error } = await db
    .from("reviews")
    .insert({ booking_id: bookingId, reviewer_id: auth.user.id, reviewee_id: revieweeId, rating, comment });
  if (error) throw error;
}

export async function replyToReview(reviewId, reply) {
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
  const { data, error } = await db.from("skipper_profiles").select("*, users(phone_number)").eq("approval_status", "pending");
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

export async function adminListCancellationReports() {
  const db = requireDb();
  const { data, error } = await db
    .from("cancellation_reports")
    .select("*, bookings(*, ports(name))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function adminListBookings() {
  const db = requireDb();
  const { data, error } = await db
    .from("bookings")
    .select("*, ports(name), boat_types(name)")
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
    .select("*, users(phone_number)")
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

  if (role === "client") {
    const [profile, requests, bookings, wallet] = await Promise.all([
      db.from("client_profiles").select("*").eq("user_id", userId).maybeSingle(),
      db.from("booking_requests").select("*, ports(name), boat_types(name)").eq("client_id", userId).order("created_at", { ascending: false }),
      db.from("bookings").select("*, ports(name), boat_types(name)").eq("client_id", userId).order("created_at", { ascending: false }),
      db.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (profile.error) throw profile.error;
    if (requests.error) throw requests.error;
    if (bookings.error) throw bookings.error;
    return {
      role,
      profile: profile.data,
      requests: requests.data || [],
      bookings: bookings.data || [],
      wallet: wallet.data || [],
    };
  }

  if (role === "skipper") {
    const { data: profile, error: pErr } = await db.from("skipper_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (pErr) throw pErr;
    if (!profile) return { role, profile: null, bookings: [], pings: [], wallet: [], availability: [], lookups: null };

    const [bookings, pings, wallet, availability, langs, boats] = await Promise.all([
      db.from("bookings").select("*, ports(name), boat_types(name)").eq("skipper_id", profile.id).order("created_at", { ascending: false }),
      db
        .from("booking_request_pings")
        .select("*, booking_requests(*, ports(name), boat_types(name))")
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
        .select("*, availability_window_ports(ports(name))")
        .eq("skipper_id", profile.id)
        .order("start_date"),
      db.from("skipper_languages").select("languages(name)").eq("skipper_id", profile.id),
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
