"use client";
import { useRef, useState } from "react";
import { supabase } from "../../../lib/platform/supabaseClient";
import { colors, muted, button, radius } from "../../../lib/platform/theme";

// Phone cameras produce 4–12MB files, so rejecting on size would fail for
// most real uploads. Downscale and re-encode in the browser instead: 1200px
// on the long edge is plenty for a 84px avatar and a 60px result thumbnail,
// and lands comfortably under a megabyte.
const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.85;
const HARD_LIMIT = 5 * 1024 * 1024;

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // White backdrop so transparent PNGs don't turn black once flattened.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("resize_failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Δεν μπόρεσε να διαβαστεί η εικόνα."));
    };
    img.src = url;
  });
}

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

    // Show it immediately; the upload can take a moment on mobile data.
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("not_authenticated");

      const resized = await resizeImage(file);
      // Only conceivable if someone feeds in an enormous canvas; the resize
      // itself normally brings anything well under this.
      if (resized.size > HARD_LIMIT) throw new Error("Η εικόνα είναι πολύ μεγάλη.");

      // Timestamped name so a replacement can't be served from cache under
      // the old URL. Always .jpg — the resize re-encodes to JPEG.
      const path = `${auth.user.id}/${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from("crew-photos")
        .upload(path, resized, { contentType: "image/jpeg", upsert: true });
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
        <p style={{ ...muted, fontSize: 12, margin: "8px 0 0" }}>
          Οποιαδήποτε φωτογραφία — προσαρμόζεται αυτόματα.
        </p>
        {error && <p style={{ color: colors.danger, fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
