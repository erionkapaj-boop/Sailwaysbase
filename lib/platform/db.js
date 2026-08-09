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

export async function createAccount({ role, phone }) {
  const db = requireDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("not_authenticated");
  const { error: uErr } = await db.from("users").insert({
    id: auth.user.id,
    role,
    phone_number: normalizePhone(phone),
    phone_verified_at: new Date().toISOString(),
  });
  if (uErr) throw uErr;

  if (role === "client") {
    const { error } = await db.from("client_profiles").insert({ user_id: auth.user.id });
    if (error) throw error;
  } else if (role === "skipper") {
    const { error } = await db.from("skipper_profiles").insert({
      user_id: auth.user.id,
      full_name: "",
      license_number: "PENDING-" + auth.user.id.slice(0, 8),
      license_type: "",
      price_per_day: 210,
    });
    if (error) throw error;
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

export async function setSkipperLookups(skipperId, { languageIds = [], boatTypeIds = [], portIds = [] }) {
  const db = requireDb();
  await db.from("skipper_languages").delete().eq("skipper_id", skipperId);
  await db.from("skipper_boat_types").delete().eq("skipper_id", skipperId);
  await db.from("skipper_coverage_areas").delete().eq("skipper_id", skipperId);
  if (languageIds.length)
    await db.from("skipper_languages").insert(languageIds.map((language_id) => ({ skipper_id: skipperId, language_id })));
  if (boatTypeIds.length)
    await db.from("skipper_boat_types").insert(boatTypeIds.map((boat_type_id) => ({ skipper_id: skipperId, boat_type_id })));
  if (portIds.length)
    await db.from("skipper_coverage_areas").insert(portIds.map((port_id) => ({ skipper_id: skipperId, port_id })));
}

export async function getSkipperLookups(skipperId) {
  const db = requireDb();
  const [langs, boats, ports] = await Promise.all([
    db.from("skipper_languages").select("language_id").eq("skipper_id", skipperId),
    db.from("skipper_boat_types").select("boat_type_id").eq("skipper_id", skipperId),
    db.from("skipper_coverage_areas").select("port_id").eq("skipper_id", skipperId),
  ]);
  if (langs.error) throw langs.error;
  if (boats.error) throw boats.error;
  if (ports.error) throw ports.error;
  return {
    languageIds: (langs.data || []).map((r) => r.language_id),
    boatTypeIds: (boats.data || []).map((r) => r.boat_type_id),
    portIds: (ports.data || []).map((r) => r.port_id),
  };
}

export async function addBlackout(skipperId, startDate, endDate) {
  const db = requireDb();
  const { error } = await db
    .from("skipper_availability")
    .insert({ skipper_id: skipperId, start_date: startDate, end_date: endDate });
  if (error) throw error;
}

export async function removeBlackout(id) {
  const db = requireDb();
  const { error } = await db.from("skipper_availability").delete().eq("id", id);
  if (error) throw error;
}

export async function listBlackouts(skipperId) {
  const db = requireDb();
  const { data, error } = await db
    .from("skipper_availability")
    .select("*")
    .eq("skipper_id", skipperId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export async function listLookups() {
  const db = requireDb();
  const [languages, boatTypes, ports] = await Promise.all([
    db.from("languages").select("*").order("name"),
    db.from("boat_types").select("*").order("name"),
    db.from("ports").select("*").order("region,name"),
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

export async function adminListActions() {
  const db = requireDb();
  const { data, error } = await db.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}
