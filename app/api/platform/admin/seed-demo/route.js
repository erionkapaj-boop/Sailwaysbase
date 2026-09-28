import { serviceClient } from "../../../../../lib/platform/serverDb";

// Creates demo accounts so the admin console has something to look at.
//
// Guarded by an admin check on the caller's own access token — this holds the
// service key, so an open endpoint here would let anyone mint accounts.
//
// Every demo account gets the same PIN and a phone in the reserved
// +30698000000X test range, so you can sign in as any of them directly
// (phone + PIN needs no SMS). That range is a world of its own (0102): real
// clients never see these professionals and these clients never reach real
// ones. Re-running is safe: existing accounts are skipped, not duplicated.

const DEMO_PIN = "123456";

const DEMO_USERS = [
  {
    phone: "+306980000004",
    name: "Γιώργος Αντωνίου",
    email: "g.antoniou@example.com",
    role: "skipper",
    skipper: {
      price: 260,
      years: 12,
      gender: "Άνδρας",
      tier: "high",
      approval: "approved",
      rating: 4.8,
      ratingCount: 24,
      completed: 31,
      flags: 1,
    },
  },
  {
    phone: "+306980000005",
    name: "Μαρία Δημητρίου",
    email: "m.dimitriou@example.com",
    role: "skipper",
    skipper: {
      price: 300,
      years: 8,
      gender: "Γυναίκα",
      tier: "high",
      approval: "approved",
      rating: 4.9,
      ratingCount: 17,
      completed: 19,
      flags: 0,
    },
  },
  {
    phone: "+306980000006",
    name: "Νίκος Βασιλείου",
    email: "n.vasileiou@example.com",
    role: "skipper",
    skipper: {
      price: 210,
      years: 3,
      gender: "Άνδρας",
      tier: "medium",
      approval: "approved",
      rating: 4.2,
      ratingCount: 5,
      completed: 6,
      flags: 0,
    },
  },
  {
    phone: "+306980000007",
    name: "Ελένη Παππά",
    email: "e.pappa@example.com",
    role: "skipper",
    skipper: {
      price: 240,
      years: 6,
      gender: "Γυναίκα",
      tier: "medium",
      approval: "pending",
      rating: null,
      ratingCount: 0,
      completed: 0,
      flags: 0,
    },
  },
  {
    phone: "+306980000008",
    name: "Κώστας Ιωάννου",
    email: "k.ioannou@example.com",
    role: "skipper",
    skipper: {
      price: 220,
      years: 15,
      gender: "Άνδρας",
      tier: "low",
      approval: "approved",
      rating: 3.1,
      ratingCount: 9,
      completed: 7,
      flags: 4,
    },
  },
  {
    phone: "+306980000009",
    name: "Άννα Καραγιάννη",
    email: "a.karagianni@example.com",
    role: "client",
    client: { completed: 3, flags: 0, rating: 4.7, ratingCount: 3 },
  },
  {
    phone: "+306980000010",
    name: "Δημήτρης Σταύρου",
    email: "d.stavrou@example.com",
    role: "client",
    client: { completed: 1, flags: 2, rating: 3.4, ratingCount: 2 },
  },
];

async function requireAdmin(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  // Λογαριασμοί επίδειξης: μόνο ο ιδιοκτήτης (0112).
  const { data: row } = await db.from("users").select("role, is_owner").eq("id", data.user.id).maybeSingle();
  return row?.role === "admin" || row?.is_owner ? data.user : null;
}

const GENDER = { Άνδρας: "male", Γυναίκα: "female" };
const iso = (d) => d.toISOString().slice(0, 10);

// Every step reports its own failure: this used to swallow them, and after
// the schema moved on (0059 wallet per person, 0081 photo on users, region
// availability) it quietly created accounts with no profile at all.
async function createOne(db, u, lookups) {
  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    phone: u.phone,
    password: DEMO_PIN,
    phone_confirm: true,
  });
  if (authErr || !authUser?.user) throw new Error(`auth: ${authErr?.message || "failed"}`);
  const id = authUser.user.id;

  // The signup bonus and the client profile come from the database's own
  // triggers, as for any new account. Test phones are their own world
  // (0102): demo accounts only ever meet other test accounts.
  const { error: userErr } = await db.from("users").insert({
    id,
    role: u.role,
    full_name: u.name,
    email: u.email,
    phone_number: u.phone,
    phone_verified_at: new Date().toISOString(),
    photo_reviewed_at: new Date().toISOString(),
    status: "active",
    is_test_account: true,
  });
  if (userErr) throw new Error(`users: ${userErr.message}`);

  if (u.role === "client") {
    const { error } = await db.from("client_profiles").upsert({
      user_id: id,
      completed_bookings_count: u.client.completed,
      cancellation_flag_count: u.client.flags,
      rating_avg: u.client.rating,
      rating_count: u.client.ratingCount,
    });
    if (error) throw new Error(`client_profiles: ${error.message}`);
    return;
  }

  const { data: sp, error: spErr } = await db
    .from("skipper_profiles")
    .insert({
      user_id: id,
      full_name: u.name,
      role: "skipper",
      gender: GENDER[u.skipper.gender] || null,
      years_experience: u.skipper.years,
      price_per_day: u.skipper.price,
      tier: u.skipper.tier,
      approval_status: u.skipper.approval,
      approved_at: u.skipper.approval === "approved" ? new Date().toISOString() : null,
      rating_avg: u.skipper.rating,
      rating_count: u.skipper.ratingCount,
      completed_bookings_count: u.skipper.completed,
      cancellation_flag_count: u.skipper.flags,
    })
    .select("id")
    .single();
  if (spErr) throw new Error(`skipper_profiles: ${spErr.message}`);

  // Availability for the next year in three regions, and two boat types —
  // without them a professional never turns up in a search.
  const today = new Date();
  const inAYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  const { data: win, error: winErr } = await db
    .from("availability_windows")
    .insert({ skipper_id: sp.id, start_date: iso(today), end_date: iso(inAYear) })
    .select("id")
    .single();
  if (winErr) throw new Error(`availability_windows: ${winErr.message}`);
  const steps = [
    ["availability_window_regions", lookups.regions.map((r) => ({ window_id: win.id, region_id: r.id }))],
    ["skipper_boat_types", lookups.boats.map((b) => ({ skipper_id: sp.id, boat_type_id: b.id }))],
    ["user_languages", lookups.langs.map((l) => ({ user_id: id, language_id: l.id }))],
  ];
  for (const [table, rows] of steps) {
    if (!rows.length) continue;
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const admin = await requireAdmin(req, db);
  if (!admin) return Response.json({ error: "not_admin" }, { status: 403 });

  const [{ data: regions }, { data: boats }, { data: langs }] = await Promise.all([
    db.from("regions").select("id").limit(3),
    db.from("boat_types").select("id").limit(2),
    db.from("languages").select("id").limit(2),
  ]);
  const lookups = { regions: regions || [], boats: boats || [], langs: langs || [] };

  const created = [];
  const skipped = [];
  const failed = [];

  for (const u of DEMO_USERS) {
    const { data: existing } = await db.from("users").select("id").eq("phone_number", u.phone).maybeSingle();
    if (existing) {
      skipped.push(u.phone);
      continue;
    }
    try {
      await createOne(db, u, lookups);
      created.push(`${u.phone} — ${u.name} (${u.role})`);
    } catch (err) {
      failed.push(`${u.phone} — ${u.name}: ${err.message}`);
    }
  }

  return Response.json({ ok: failed.length === 0, pin: DEMO_PIN, created, skipped, failed });
}
