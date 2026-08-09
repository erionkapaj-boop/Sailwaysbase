"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/platform/supabaseClient";
import { container, card, h1, h2, muted, colors } from "../../../lib/platform/theme";

function mask(v) {
  if (!v) return null;
  if (v.length <= 24) return v;
  return v.slice(0, 14) + "..." + v.slice(-8);
}

export default function DebugPage() {
  const [portsResult, setPortsResult] = useState(null);
  const [settingsResult, setSettingsResult] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("ports")
      .select("id,name")
      .limit(3)
      .then((r) => setPortsResult(r));
    supabase
      .from("platform_settings")
      .select("key,value")
      .then((r) => setSettingsResult(r));
  }, []);

  const url = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY;

  return (
    <div style={container}>
      <h1 style={h1}>🔧 Διαγνωστική σελίδα (προσωρινή)</h1>

      <div style={card}>
        <h2 style={h2}>1. Env vars που "βλέπει" η σελίδα</h2>
        <p style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
          <b>NEXT_PUBLIC_PLATFORM_SUPABASE_URL:</b><br />
          {url ? url : <span style={{ color: colors.danger }}>ΛΕΙΠΕΙ / undefined</span>}
        </p>
        <p style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
          <b>NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY:</b><br />
          {key ? mask(key) : <span style={{ color: colors.danger }}>ΛΕΙΠΕΙ / undefined</span>}
        </p>
        <p style={muted}>supabase client δημιουργήθηκε: {supabase ? "ΝΑΙ ✓" : "ΟΧΙ ✗"}</p>
      </div>

      <div style={card}>
        <h2 style={h2}>2. Ζωντανό query: ports</h2>
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {portsResult ? JSON.stringify(portsResult, null, 2) : "φόρτωση..."}
        </pre>
      </div>

      <div style={card}>
        <h2 style={h2}>3. Ζωντανό query: platform_settings</h2>
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {settingsResult ? JSON.stringify(settingsResult, null, 2) : "φόρτωση..."}
        </pre>
      </div>
    </div>
  );
}
