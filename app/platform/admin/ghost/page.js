"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocalData } from "../../useLocalData";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListAccounts, adminSeedDemoUsers } from "../../../../lib/platform/db";

// Ghost Mode: αυτό το panel δεν φτιάχνει καινούρια μηχανισμό — μαζεύει σε ένα
// σημείο τα ήδη υπάρχοντα, πραγματικά εργαλεία (Προβολή ως και τη
// δοκιμαστική εγγραφή χωρίς SMS) και εξηγεί πότε χρησιμοποιείς
// ποιο. Η Προβολή ως αφήνει πάντα ορατό, sticky banner με κουμπί εξόδου
// (PlatformShell.js) — δεν χρειάζεται ξεχωριστό εδώ.

function TestPhoneRow({ u }) {
  const t = useTranslations("AdminGhost");
  const L = useLocalData();
  return (
    <Row>
      <RowMain
        title={L.person(u) || t("noName")}
        meta={
          <>
            <span style={money}>{u.phone_number}</span>
            {u.role && ` · ${u.role}`}
          </>
        }
      />
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Status value={u.status} />
        <Link href={`/platform/admin/user/${u.id}`} style={{ textDecoration: "none" }}>
          <span style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}>{t("details")}</span>
        </Link>
      </span>
    </Row>
  );
}

function GhostInner() {
  const t = useTranslations("AdminGhost");
  const counts = useAdminCounts();
  const [used, setUsed] = useState(null);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  async function loadUsed() {
    try {
      const [active, deleted] = await Promise.all([
        adminListAccounts({ search: "+306980000", limit: 200 }),
        adminListAccounts({ search: "+306980000", limit: 200, deletedOnly: true }),
      ]);
      setUsed([...active, ...deleted].sort((a, b) => a.phone_number.localeCompare(b.phone_number)));
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    loadUsed();
  }, []);

  // Μετακόμισε εδώ από τη λίστα Χρήστες — εργαλείο δοκιμών, δεν είναι
  // διαχείριση πραγματικού λογαριασμού. Οι 7 λογαριασμοί που φτιάχνει είναι
  // ΜΕΣΑ στη δεσμευμένη σειρά τηλεφώνων (+306980000004 έως 010), οπότε
  // ξαναφορτώνει και τη λίστα από κάτω μετά την επιτυχία.
  async function seed() {
    setSeeding(true);
    try {
      setSeedResult(await adminSeedDemoUsers());
      await loadUsed();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <AdminShell
      ownerOnly
      title={t("title")}
      subtitle={t("subtitle")}
      counts={counts}
    >
      <Panel title={t("step1Title")}>
        <ol style={{ ...muted, margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>{t.rich("step1a", { b: (c) => <b>{c}</b> })}</li>
          <li>{t("step1b")}</li>
          <li>{t.rich("step1c", { b: (c) => <b>{c}</b> })}</li>
        </ol>
        <p style={{ ...muted, margin: "0 0 14px", fontSize: 13 }}>
          {t.rich("step1note", { i: (c) => <i>{c}</i> })}
        </p>
        <Link href="/platform/admin/users" style={{ ...button("primary"), display: "inline-block", textDecoration: "none" }}>
          {t("openUsers")}
        </Link>
      </Panel>

      <Panel title={t("step2Title")}>
        <p style={{ ...muted, margin: "0 0 8px" }}>
          {t("step2intro")}
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600 }}>{t("testRange")}</p>
        <p style={{ ...muted, margin: "0 0 18px", fontSize: 13 }}>
          {t.rich("step2note", { b: (c) => <b>{c}</b> })}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/platform" style={{ textDecoration: "none" }}>
            <span style={button("primary")}>{t("openHome")}</span>
          </Link>
          <Link href="/platform/register?as=professional" style={{ textDecoration: "none" }}>
            <span style={button("secondary")}>{t("registerPro")}</span>
          </Link>
        </div>
      </Panel>

      <Panel
        title={t("step3Title")}
        subtitle={t("step3Hint")}
      >
        <button style={button("secondary")} disabled={seeding} onClick={seed}>
          {seeding ? t("creating") : t("createDemo")}
        </button>
        {seedResult && (
          <div style={{ ...muted, fontSize: 13, marginTop: 12 }}>
            {seedResult.created?.length > 0 && (
              <>
                <div style={{ color: colors.success }}>{t("created", { count: seedResult.created.length })}</div>
                {seedResult.created.map((c) => (
                  <div key={c} style={money}>
                    {c}
                  </div>
                ))}
              </>
            )}
            {seedResult.skipped?.length > 0 && <div style={{ marginTop: 6 }}>{t("skipped", { count: seedResult.skipped.length })}</div>}
            {seedResult.failed?.length > 0 && (
              <div style={{ marginTop: 6, color: colors.danger }}>
                {t("failed", { count: seedResult.failed.length })}
                {seedResult.failed.map((f) => (
                  <div key={f} style={{ fontSize: 12.5 }}>{f}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title={`${t("usedTitle")}${used ? ` (${used.length})` : ""}`}>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {!used && !error && <Empty>{t("loading")}</Empty>}
        {used && used.length === 0 && <Empty>{t("usedEmpty")}</Empty>}
        {used?.map((u) => (
          <TestPhoneRow key={u.id} u={u} />
        ))}
      </Panel>
    </AdminShell>
  );
}

export default function GhostPage() {
  return <GhostInner />;
}
