"use client";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useHeaderBack } from "./HeaderBack";
import { backShell } from "./HeaderBackSlot";
import Icon from "./Icon";

// Το «μπροστά» του οδηγού: ζει δίπλα στο «πίσω» στην κεφαλίδα και ξαναφέρνει
// στο βήμα από όπου γύρισε ο χρήστης. Εμφανίζεται μόνο όταν υπάρχει βήμα
// μπροστά· αλλιώς δεν πιάνει χώρο.
export default function ForwardButton({ onClick, disabled }) {
  const t = useTranslations("BackButton");
  const slot = useHeaderBack()?.slot;
  if (!slot) return null;
  return createPortal(
    <button
      type="button"
      data-forward
      aria-label={t("forward")}
      disabled={disabled}
      onClick={onClick}
      style={{ ...backShell, opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      <Icon name="forward" size={22} />
    </button>,
    slot
  );
}
