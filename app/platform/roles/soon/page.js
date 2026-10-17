"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PlaceholderPage from "../../components/PlaceholderPage";
import { ROLE_KEYS } from "../../../../lib/platform/userRoles";

// Προσωρινή οθόνη για ρόλους που δεν έχουν ακόμη εγγραφή (Εταιρεία, Δημιουργός): όνομα ρόλου και «Σύντομα».
export default function Page() {
  const tr = useTranslations("UserRoles");
  const t = useTranslations("Soon");
  const [role, setRole] = useState("company");
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    if (ROLE_KEYS.includes(r)) setRole(r);
  }, []);
  return <PlaceholderPage title={tr(role)} note={t("note")} />;
}
