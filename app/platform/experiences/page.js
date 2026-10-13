"use client";
import { useTranslations } from "next-intl";
import PlaceholderPage from "../components/PlaceholderPage";

// Εμπειρίες στη θάλασσα: η είσοδος υπάρχει στην αρχική· το περιεχόμενο έρχεται.
export default function ExperiencesPage() {
  const t = useTranslations("Experiences");
  return <PlaceholderPage title={t("title")} note={t("note")} />;
}
