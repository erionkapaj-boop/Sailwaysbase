"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import {
  adminListPendingSkippers,
  adminApproveSkipper,
  adminRejectSkipper,
  adminListPendingSecondaryRoles,
  adminApproveSecondaryRole,
  adminRejectSecondaryRole,
} from "../../../../lib/platform/db";
import { labelForRole } from "../../../../lib/platform/roles";

export default function ApprovalsPage() {
  const counts = useAdminCounts();
  const [list, setList] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});
  const [merged, setMerged] = useState(null);
  const [secondaryList, setSecondaryList] = useState([]);
  const [secondaryBusyId, setSecondaryBusyId] = useState(null);
  const [secondaryNotes, setSecondaryNotes] = useState({});

  async function load() {
    try {
      setList(await adminListPendingSkippers());
    } catch (err) {
      setError(err.message || String(err));
    }
    try {
      setSecondaryList(await adminListPendingSecondaryRoles());
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function approveSecondary(id) {
    setSecondaryBusyId(id);
    setError("");
    try {
      await adminApproveSecondaryRole(id);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSecondaryBusyId(null);
    }
  }

  async function rejectSecondary(id) {
    setSecondaryBusyId(id);
    setError("");
    try {
      await adminRejectSecondaryRole(id, secondaryNotes[id] || null);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSecondaryBusyId(null);
    }
  }

  async function approve(userId) {
    setBusyId(userId);
    setError("");
    setMerged(null);
    try {
      const result = await adminApproveSkipper(userId);
      // The approval function merges a returning professional back onto their
      // old history when it recognises them — worth saying so, since the
      // numbers on their profile will suddenly not be zero.
      if (result?.completed_bookings_count > 0) setMerged(result);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(userId) {
    setBusyId(userId);
    setError("");
    try {
      await adminRejectSkipper(userId, notes[userId] || null);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Εγκρίσεις"
      subtitle="Προφίλ επαγγελματιών σε αναμονή. Μέχρι να εγκριθούν δεν εμφανίζονται σε καμία αναζήτηση."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {merged && (
        <div
          style={{
            background: "#EAF2EE",
            border: `1px solid ${colors.success}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          Ο λογαριασμός συνδέθηκε με παλιό ιστορικό:{" "}
          <b style={money}>{merged.completed_bookings_count}</b> ολοκληρωμένες κρατήσεις,
          βαθμίδα <b>{merged.tier}</b>.
        </div>
      )}

      <Panel title={`Σε αναμονή (${list.length})`} padded={false}>
        {list.length === 0 && <Empty>Καμία εκκρεμής έγκριση.</Empty>}
        {list.map((s) => (
          <div key={s.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <RowMain
                title={s.full_name || "(χωρίς όνομα)"}
                meta={
                  <>
                    <span style={money}>{s.users?.phone_number}</span>
                    {" · "}
                    <span style={money}>{s.price_per_day}€</span>/ημέρα
                  </>
                }
              />
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <button
                  style={button("primary")}
                  disabled={busyId === s.user_id}
                  onClick={() => approve(s.user_id)}
                >
                  {busyId === s.user_id ? "…" : "Έγκριση"}
                </button>
                <button
                  style={button("secondary")}
                  disabled={busyId === s.user_id}
                  onClick={() => reject(s.user_id)}
                >
                  Απόρριψη
                </button>
              </div>
            </div>
            <input
              placeholder="Λόγος απόρριψης (προαιρετικό, καταγράφεται)"
              value={notes[s.user_id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [s.user_id]: e.target.value }))}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                boxSizing: "border-box",
                color: colors.ink,
                background: colors.bg,
              }}
            />
          </div>
        ))}
      </Panel>

      <Panel title={`Επιπλέον ρόλοι σε αναμονή (${secondaryList.length})`} padded={false}>
        {secondaryList.length === 0 && <Empty>Καμία εκκρεμής έγκριση.</Empty>}
        {secondaryList.map((r) => (
          <div key={r.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <RowMain
                title={`${r.full_name || "(χωρίς όνομα)"} — ${labelForRole(r.role)}`}
                meta={
                  <>
                    <span style={money}>{r.phone_number}</span>
                    {" · "}
                    <span style={money}>{r.price_per_day}€</span>/ημέρα
                    {r.license_number ? (
                      <>
                        {" · άδεια "}
                        <span style={money}>{r.license_number}</span>
                      </>
                    ) : null}
                  </>
                }
              />
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <button style={button("primary")} disabled={secondaryBusyId === r.id} onClick={() => approveSecondary(r.id)}>
                  {secondaryBusyId === r.id ? "…" : "Έγκριση"}
                </button>
                <button style={button("secondary")} disabled={secondaryBusyId === r.id} onClick={() => rejectSecondary(r.id)}>
                  Απόρριψη
                </button>
              </div>
            </div>
            <input
              placeholder="Λόγος απόρριψης (προαιρετικό, καταγράφεται)"
              value={secondaryNotes[r.id] || ""}
              onChange={(e) => setSecondaryNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                boxSizing: "border-box",
                color: colors.ink,
                background: colors.bg,
              }}
            />
          </div>
        ))}
      </Panel>
    </AdminShell>
  );
}
