"use client";
import { useRef, useState } from "react";
import { supabase } from "../../../lib/platform/supabaseClient";
import { colors, muted, button, radius } from "../../../lib/platform/theme";
import { friendlyError } from "../../../lib/platform/friendlyError";

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
      setError(friendlyError(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <button
        type="button"
        aria-label={shown ? "Αλλαγή φωτογραφίας" : "Ανέβασμα φωτογραφίας"}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          flexShrink: 0,
          padding: 0,
          cursor: "pointer",
          background: shown ? `url(${shown}) center/cover` : colors.card,
          border: shown ? `1px solid ${colors.border}` : `1.5px dashed ${colors.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.6 : 1,
          transition: "opacity 0.2s ease",
        }}
      >
        {!shown && (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-1.8A1 1 0 0 1 9.5 4.8h5a1 1 0 0 1 .8.4L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"
              stroke={colors.inkSoft}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12.8" r="3.3" stroke={colors.inkSoft} strokeWidth="1.4" />
          </svg>
        )}
      </button>
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
          Προσαρμόζεται αυτόματα.
        </p>
        {error && <p style={{ color: colors.danger, fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
