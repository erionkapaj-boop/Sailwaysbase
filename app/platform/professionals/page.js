import { getTranslations } from "next-intl/server";
import ProfessionalsBody from "./ProfessionalsBody";

export async function generateMetadata() {
  const t = await getTranslations("ProfessionalsMeta");
  return { title: t("title") };
}

export default function ProfessionalsPage() {
  return <ProfessionalsBody />;
}
