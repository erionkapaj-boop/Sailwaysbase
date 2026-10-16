"use client";
import { useTranslations } from "next-intl";
import PlaceholderPage from "../components/PlaceholderPage";

// Προσωρινή οθόνη (απόφαση ιδιοκτήτη 16/10/2026): μόνο το όνομα και «Σύντομα». Η εφαρμογή έρχεται με δική της εντολή.
export default function Page() {
  const t = useTranslations("Home");
  return <PlaceholderPage title={t("apps.community")} note={t("comingSoon")} />;
}
