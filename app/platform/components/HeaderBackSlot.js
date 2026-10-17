"use client";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useHeaderBack, isRootPath } from "./HeaderBack";
import Icon from "./Icon";
import { colors } from "../../../lib/platform/theme";

export const backShell = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: colors.ink,
  cursor: "pointer",
  flexShrink: 0,
  textDecoration: "none",
  padding: 0,
};

// Η υποδοχή της κεφαλίδας: το προεπιλεγμένο βέλος (αν η σελίδα δεν έχει δικό
// της) και το σημείο όπου προβάλλονται τα BackButton των σελίδων.
export default function HeaderBackSlot() {
  const hb = useHeaderBack();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("BackButton");
  const showDefault = hb && hb.custom === 0 && !isRootPath(pathname);
  return (
    <>
      {showDefault && (
        <button type="button" data-header-back aria-label={t("back")} onClick={() => router.back()} style={backShell}>
          <Icon name="back" size={22} />
        </button>
      )}
      <span ref={hb?.setSlot} data-header-slot style={{ display: "inline-flex", alignItems: "center" }} />
    </>
  );
}
