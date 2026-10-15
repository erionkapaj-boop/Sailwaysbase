"use client";
import { useTranslations } from "next-intl";
import { boatImage } from "../../../lib/platform/boatImages";
import { colors } from "../../../lib/platform/theme";

// Μικρή εικόνα του μοντέλου δίπλα στη γραμμή σκάφους (επαγγελματίας που βλέπει/αναλαμβάνει
// το αίτημα). Δείχνει τη φωτογραφία του μοντέλου αν υπάρχει, αλλιώς την ενδεικτική εικόνα AI
// με ένδειξη «AI»· χωρίς αναγνωρίσιμο μοντέλο δεν δείχνει τίποτα.
export default function BoatThumb({ name, width = 64 }) {
  const t = useTranslations("BoatPicture");
  const img = boatImage(name);
  if (!img) return null;
  return (
    <span
      data-boat-thumb
      title={img.illustrative ? t("caption") : undefined}
      style={{ position: "relative", display: "inline-block", width, height: Math.round(width * 0.75), borderRadius: 8, overflow: "hidden", background: colors.seaGlass, flexShrink: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={t("alt")} loading="lazy" width={800} height={600} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      {img.illustrative && (
        <span style={{ position: "absolute", left: 3, bottom: 3, fontSize: 9, fontWeight: 600, lineHeight: 1, padding: "2px 4px", borderRadius: 4, background: "rgba(255,255,255,0.9)", color: colors.ink }}>
          {t("tag")}
        </span>
      )}
    </span>
  );
}
