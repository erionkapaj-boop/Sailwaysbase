"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "../../../AuthContext";
import { adminGetUser, adminGetUserOverview } from "../../../../../lib/platform/db";
import Stat from "../../../components/Stat";
import {
  container,
  card,
  h1,
  h2,
  muted,
  badge,
  colors,
  money,
} from "../../../../../lib/platform/theme";

const BIO_TAG_LABELS = {
  family_friendly: "Οικογενειακός",
  fishing: "Ψάρεμα",
  diving: "Καταδύσεις",
  party: "Party sailing",
  long_range: "Μεγάλες αποστάσεις",
  islands_expert: "Ειδικός σε νησιά",
};

function Row({ left, right, tone = "neutral" }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>{left}</span>
        {right && <span style={badge(tone)}>{right}</span>}
      </div>
    </div>
  );
}

function Chips({ items }) {
  if (!items?.length) return <p style={muted}>—</p>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((t) => (
        <span key={t} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
          {t}
        </span>
      ))}
    </div>
  );
}

export default function AdminUserViewPage() {
  const { id } = useParams();
  const { session, userRow, loading } = useAuth();

  const [target, setTarget] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || userRow?.role !== "admin") return;
    (async () => {
      setBusy(true);
      try {
        const u = await adminGetUser(id);
        setTarget(u);
        if (u) setData(await adminGetUserOverview(id, u.role));
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [id, userRow]);

  if (loading) return <div style={container}>Φόρτωση…</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "admin") return <div style={container}>Πρόσβαση μόνο για admin.</div>;

  return (
    <div style={container}>
      <Link href="/platform/admin" style={{ ...muted, fontSize: 14, textDecoration: "none" }}>
        ← Πίσω στη λίστα
      </Link>

      {/* Always visible, so it's never ambiguous whose screen this is. */}
      <div
        style={{
          ...card,
          marginTop: 14,
          borderLeft: `3px solid ${colors.warn}`,
        }}
      >
        <b style={{ fontWeight: 600 }}>Προβολή ως χρήστης</b>
        <p style={{ ...muted, margin: "6px 0 0" }}>
          Βλέπεις τα δεδομένα του λογαριασμού όπως τα βλέπει ο ίδιος. Μόνο ανάγνωση — δεν μπορείς να
          κάνεις ενέργειες εκ μέρους του.
        </p>
      </div>

      {busy && <p style={muted}>Φόρτωση…</p>}
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {target && (
        <>
          <h1 style={h1}>{target.full_name || "(χωρίς όνομα)"}</h1>
          <p style={muted}>
            <span style={money}>{target.phone_number}</span>
            {target.email ? ` · ${target.email}` : ""} · {target.role} · {target.status}
          </p>

          {data?.role === "client" && (
            <>
              <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap", marginTop: 20 }}>
                <Stat label="Wallet" value={`${data.profile?.wallet_balance ?? 0}€`} />
                <Stat
                  label="Αξιοπιστία"
                  value={
                    data.profile?.reliability_percentage != null
                      ? `${data.profile.reliability_percentage}%`
                      : "—"
                  }
                />
                <Stat label="Ολοκληρωμένες" value={data.profile?.completed_bookings_count ?? 0} />
                <Stat
                  label="Αξιολόγηση"
                  value={data.profile?.rating_avg ? data.profile.rating_avg.toFixed(1) : "—"}
                />
              </div>

              <h2 style={h2}>Αιτήματα ({data.requests.length})</h2>
              {data.requests.length === 0 && <p style={muted}>Κανένα αίτημα.</p>}
              {data.requests.map((r) => (
                <Row
                  key={r.id}
                  left={
                    <>
                      {r.ports?.name} · <span style={money}>{r.start_date}</span> →{" "}
                      <span style={money}>{r.end_date}</span>
                    </>
                  }
                  right={r.status}
                />
              ))}

              <h2 style={h2}>Κρατήσεις ({data.bookings.length})</h2>
              {data.bookings.length === 0 && <p style={muted}>Καμία κράτηση.</p>}
              {data.bookings.map((b) => (
                <Row
                  key={b.id}
                  left={
                    <>
                      {b.ports?.name} · <span style={money}>{b.start_date}</span> →{" "}
                      <span style={money}>{b.end_date}</span>
                    </>
                  }
                  right={b.status}
                  tone={b.status === "confirmed" || b.status === "completed" ? "success" : "neutral"}
                />
              ))}
            </>
          )}

          {data?.role === "skipper" && !data.profile && (
            <p style={{ ...muted, marginTop: 20 }}>Δεν υπάρχει προφίλ επαγγελματία για αυτόν τον λογαριασμό.</p>
          )}

          {data?.role === "skipper" && data.profile && (
            <>
              <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap", marginTop: 20 }}>
                <Stat label="Wallet" value={`${data.profile.wallet_balance}€`} />
                <Stat label="Τιμή/ημέρα" value={`${data.profile.price_per_day}€`} />
                <Stat
                  label="Βαθμίδα"
                  value={
                    data.profile.tier === "high"
                      ? "Υψηλή"
                      : data.profile.tier === "low"
                      ? "Χαμηλή"
                      : "Μεσαία"
                  }
                />
                <Stat
                  label="Αξιοπιστία"
                  value={
                    data.profile.reliability_percentage != null
                      ? `${data.profile.reliability_percentage}%`
                      : "—"
                  }
                />
                <Stat label="Έγκριση" value={data.profile.approval_status} />
              </div>

              <h2 style={h2}>Προφίλ</h2>
              <div style={card}>
                <p style={{ ...muted, margin: "0 0 4px" }}>Εμπειρία</p>
                <p style={{ margin: "0 0 14px" }}>
                  <span style={money}>{data.profile.years_experience}</span> χρόνια
                  {data.profile.gender ? ` · ${data.profile.gender}` : ""}
                </p>

                <p style={{ ...muted, margin: "0 0 6px" }}>Βιογραφικό</p>
                <Chips
                  items={(Array.isArray(data.profile.bio) ? data.profile.bio : []).map(
                    (t) => BIO_TAG_LABELS[t] || t
                  )}
                />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Γλώσσες</p>
                <Chips items={data.languages} />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Τύποι σκαφών</p>
                <Chips items={data.boatTypes} />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Λιμάνια</p>
                <Chips items={data.ports} />
              </div>

              <h2 style={h2}>Μη διαθέσιμες ημέρες ({data.blackouts.length})</h2>
              {data.blackouts.length === 0 && <p style={muted}>Καμία — διαθέσιμος παντού.</p>}
              {data.blackouts.length > 0 && (
                <div style={{ ...card, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {data.blackouts.map((b) => (
                    <span key={b.id} style={badge("neutral")}>
                      {b.start_date} → {b.end_date}
                    </span>
                  ))}
                </div>
              )}

              <h2 style={h2}>Καμπανάκια ({data.pings.length})</h2>
              {data.pings.length === 0 && <p style={muted}>Κανένα.</p>}
              {data.pings.map((p) => (
                <Row
                  key={p.id}
                  left={
                    <>
                      {p.booking_requests?.ports?.name} ·{" "}
                      <span style={money}>{p.booking_requests?.start_date}</span> →{" "}
                      <span style={money}>{p.booking_requests?.end_date}</span>
                    </>
                  }
                  right={p.status}
                />
              ))}

              <h2 style={h2}>Κρατήσεις ({data.bookings.length})</h2>
              {data.bookings.length === 0 && <p style={muted}>Καμία κράτηση.</p>}
              {data.bookings.map((b) => (
                <Row
                  key={b.id}
                  left={
                    <>
                      {b.ports?.name} · <span style={money}>{b.start_date}</span> →{" "}
                      <span style={money}>{b.end_date}</span>
                    </>
                  }
                  right={b.status}
                  tone={b.status === "confirmed" || b.status === "completed" ? "success" : "neutral"}
                />
              ))}
            </>
          )}

          {data?.wallet?.length > 0 && (
            <>
              <h2 style={h2}>Κινήσεις wallet</h2>
              {data.wallet.map((w) => (
                <Row
                  key={w.id}
                  left={
                    <>
                      <span style={money}>{w.created_at?.slice(0, 10)}</span> · {w.type}
                    </>
                  }
                  right={`${w.amount > 0 ? "+" : ""}${w.amount}€`}
                  tone={w.amount > 0 ? "success" : "neutral"}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
