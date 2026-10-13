import { getTranslations } from "next-intl/server";
import AboutBody from "./AboutBody";

export async function generateMetadata() {
  const t = await getTranslations("AboutMeta");
  return { title: t("title"), description: t("description") };
}

export default function AboutPage() {
  return <AboutBody />;
}
