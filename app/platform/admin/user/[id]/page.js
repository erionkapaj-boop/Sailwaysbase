"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "../../../AuthContext";
import {
  adminGetUser,
  adminGetUserOverview,
  adminApproveSkipper,
  adminRejectSkipper,
} from "../../../../../lib/platform/db";
import { computeCrewHighlights } from "../../../../../lib/platform/roles";
import Stat from "../../../components/Stat";
import {
  container,
  card,
  h1,
  h2,
  muted,
  button,
  badge,
  colors,
  money,
} from "../../../../../lib/platform/theme";

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
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function load() {
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
  }

  useEffect(() => {
    if (!id || userRow?.role !== "admin") return;
    load();
  }, [id, userRow]);

  async function handleApprove() {
    setActionBusy(true);
    setActionError("");
    try {
      await adminApproveSkipper(id);
      await load();
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject() {
    setActionBusy(true);
    setActionError("");
    try {
      await adminRejectSkipper(id, null);
      await load();
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

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
              {/* The only action this screen allows — everything else here is
                  read-only "view as". Approving/rejecting acts on the real
                  row, not on what the admin happens to be looking at. */}
              {(data.profile.approval_status === "pending" || data.profile.approval_status === "rejected") && (
                <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
                  <b style={{ fontWeight: 600 }}>
                    {data.profile.approval_status === "pending"
                      ? "Το προφίλ περιμένει έγκριση."
                      : "Το προφίλ έχει απορριφθεί."}
                  </b>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button style={button("primary")} disabled={actionBusy} onClick={handleApprove}>
                      {actionBusy ? "..." : "Έγκριση"}
                    </button>
                    {data.profile.approval_status === "pending" && (
                      <button style={button("secondary")} disabled={actionBusy} onClick={handleReject}>
                        {actionBusy ? "..." : "Απόρριψη"}
                      </button>
                    )}
                  </div>
                  {actionError && <p style={{ color: colors.danger, marginTop: 10 }}>{actionError}</p>}
                </div>
              )}
              {data.profile.approval_status === "approved" && (
                <div style={{ ...card, marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={badge("success")}>Εγκεκριμένο</span>
                  <button style={button("secondary")} disabled={actionBusy} onClick={handleReject}>
                    {actionBusy ? "..." : "Ανάκληση έγκρισης"}
                  </button>
                  {actionError && <p style={{ color: colors.danger, margin: 0 }}>{actionError}</p>}
                </div>
              )}

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

                <p style={{ ...muted, margin: "0 0 6px" }}>Highlights</p>
                <Chips
                  items={computeCrewHighlights(data.profile, { languageCount: data.languages.length })}
                />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Γλώσσες</p>
                <Chips items={data.languages} />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Τύποι σκαφών</p>
                <Chips items={data.boatTypes} />
              </div>

              {/* Positive declarations, so an empty list means "findable
                  nowhere" — the opposite of what the old blackout view here
                  claimed. Ports are per window now, not one global list. */}
              <h2 style={h2}>Διαθεσιμότητα ({data.availability.length})</h2>
              {data.availability.length === 0 && (
                <p style={muted}>Καμία δηλωμένη περίοδος — δεν εμφανίζεται σε καμία αναζήτηση.</p>
              )}
              {data.availability.map((w) => (
                <div key={w.id} style={card}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    <span style={money}>{w.start_date}</span> → <span style={money}>{w.end_date}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Chips
                      items={
                        w.all_ports
                          ? ["Από οπουδήποτε"]
                          : (w.availability_window_ports || []).map((p) => p.ports?.name).filter(Boolean)
                      }
                    />
                  </div>
                </div>
              ))}

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
