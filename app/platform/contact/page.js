import { getTranslations } from "next-intl/server";
import ContactBody from "./ContactBody";

export async function generateMetadata() {
  const t = await getTranslations("ContactMeta");
  return { title: t("title"), description: t("description") };
}

export default function ContactPage() {
  return <ContactBody />;
}
