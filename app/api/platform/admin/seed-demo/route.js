import { serviceClient } from "../../../../../lib/platform/serverDb";

// Creates demo accounts so the admin console has something to look at.
//
// Guarded by an admin check on the caller's own access token — this holds the
// service key, so an open endpoint here would let anyone mint accounts.
//
// Every demo account gets the same PIN and a phone in the reserved
// +30698000000X test range, so you can sign in as any of them directly
// (phone + PIN needs no SMS). Re-running is safe: existing accounts are
// skipped, not duplicated.

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
      wallet: 180,
      bio: ["islands_expert", "family_friendly"],
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
      wallet: 95,
      bio: ["diving", "long_range"],
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
      wallet: 40,
      bio: ["fishing"],
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
      wallet: 0,
      bio: ["party"],
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
      wallet: 10,
      bio: ["long_range"],
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
    client: { wallet: 15, completed: 3, flags: 0, rating: 4.7, ratingCount: 3 },
  },
  {
    phone: "+306980000010",
    name: "Δημήτρης Σταύρου",
    email: "d.stavrou@example.com",
    role: "client",
    client: { wallet: 0, completed: 1, flags: 2, rating: 3.4, ratingCount: 2 },
  },
];

async function requireAdmin(req, db) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await db.from("users").select("role, is_staff_admin").eq("id", data.user.id).maybeSingle();
  return row?.role === "admin" || row?.is_staff_admin ? data.user : null;
}

export async function POST(req) {
  const db = serviceClient();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const admin = await requireAdmin(req, db);
  if (!admin) return Response.json({ error: "not_admin" }, { status: 403 });

  const created = [];
  const skipped = [];

  for (const u of DEMO_USERS) {
    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("phone_number", u.phone)
      .maybeSingle();
    if (existing) {
      skipped.push(u.phone);
      continue;
    }

    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      phone: u.phone,
      password: DEMO_PIN,
      phone_confirm: true,
    });
    if (authErr || !authUser?.user) {
      skipped.push(`${u.phone} (${authErr?.message || "auth failed"})`);
      continue;
    }

    const id = authUser.user.id;
    await db.from("users").insert({
      id,
      role: u.role,
      full_name: u.name,
      email: u.email,
      phone_number: u.phone,
      phone_verified_at: new Date().toISOString(),
      status: "active",
    });

    if (u.role === "client") {
      await db.from("client_profiles").insert({
        user_id: id,
        wallet_balance: u.client.wallet,
        completed_bookings_count: u.client.completed,
        cancellation_flag_count: u.client.flags,
        rating_avg: u.client.rating,
        rating_count: u.client.ratingCount,
      });
    } else {
      const { data: sp } = await db
        .from("skipper_profiles")
        .insert({
          user_id: id,
          full_name: u.name,
          gender: u.skipper.gender,
          bio: u.skipper.bio,
          years_experience: u.skipper.years,
          price_per_day: u.skipper.price,
          wallet_balance: u.skipper.wallet,
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

      // Give each skipper availability and boat types, otherwise they never
      // turn up in a search and the demo data is useless for testing the flow.
      if (sp) {
        const { data: ports } = await db.from("ports").select("id").eq("active", true).limit(4);
        const { data: boats } = await db.from("boat_types").select("id").limit(2);
        const { data: langs } = await db.from("languages").select("id").limit(2);

        // An availability window, not skipper_coverage_areas: since migration
        // 0013 search reads windows, so seeding the old table left every demo
        // skipper invisible to the very search they exist to exercise.
        if (ports?.length) {
          const today = new Date();
          const inAYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
          const iso = (d) => d.toISOString().slice(0, 10);
          const { data: win } = await db
            .from("availability_windows")
            .insert({ skipper_id: sp.id, start_date: iso(today), end_date: iso(inAYear), all_ports: false })
            .select("id")
            .single();
          if (win)
            await db
              .from("availability_window_ports")
              .insert(ports.map((p) => ({ window_id: win.id, port_id: p.id })));
        }
        if (boats?.length)
          await db.from("skipper_boat_types").insert(boats.map((b) => ({ skipper_id: sp.id, boat_type_id: b.id })));
        if (langs?.length)
          await db.from("user_languages").insert(langs.map((l) => ({ user_id: id, language_id: l.id })));
      }
    }

    created.push(`${u.phone} — ${u.name} (${u.role})`);
  }

  return Response.json({ ok: true, pin: DEMO_PIN, created, skipped });
}
