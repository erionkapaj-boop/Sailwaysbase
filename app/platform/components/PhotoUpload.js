"use client";
import { useRef, useState } from "react";
import { supabase } from "../../../lib/platform/supabaseClient";
import { colors, muted, button, radius } from "../../../lib/platform/theme";

const MAX_BYTES = 5 * 1024 * 1024;

// Real upload to Supabase Storage, replacing the old URL text field.
// Files land under <uid>/… because the bucket policy only lets a user write
// inside their own folder.
export default function PhotoUpload({ value, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const shown = preview || value;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    if (!file.type.startsWith("image/")) return setError("Επίλεξε αρχείο εικόνας.");
    if (file.size > MAX_BYTES) return setError("Η εικόνα είναι πάνω από 5MB.");

    // Show it immediately; the upload can take a moment on mobile data.
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("not_authenticated");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // Timestamped name so a replacement can't be served from cache under
      // the old URL.
      const path = `${auth.user.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("crew-photos")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("crew-photos").getPublicUrl(path);
      onUploaded(data.publicUrl);
    } catch (err) {
      setError(err.message || String(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          flexShrink: 0,
          background: shown ? `url(${shown}) center/cover` : "#EFEDE8",
          border: `1px solid ${colors.border}`,
          opacity: busy ? 0.6 : 1,
          transition: "opacity 0.2s ease",
        }}
      />
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          style={button("secondary")}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Ανέβασμα…" : shown ? "Αλλαγή φωτογραφίας" : "Ανέβασμα φωτογραφίας"}
        </button>
        <p style={{ ...muted, fontSize: 12, margin: "8px 0 0" }}>JPG ή PNG, έως 5MB.</p>
        {error && <p style={{ color: colors.danger, fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
