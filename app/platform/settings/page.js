"use client";
import { useTranslations } from "next-intl";
import PlaceholderPage from "../components/PlaceholderPage";

// Προσωρινή οθόνη: υπάρχει για να μη σπάει ο σύνδεσμος του μενού προφίλ. Το περιεχόμενο έρχεται με δική του εντολή.
export default function Page() {
  const t = useTranslations("Soon");
  return <PlaceholderPage title={t("settingsTitle")} note={t("note")} />;
}
