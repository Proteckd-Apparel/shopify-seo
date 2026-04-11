import { Languages } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TranslationsUI } from "./translations-ui";
import { getLocales, getTranslatorLocales } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function TranslationsPage() {
  const locales = await getLocales();
  const myLocales = await getTranslatorLocales();
  return (
    <div>
      <PageHeader
        icon={Languages}
        title="Translations"
        description="Translate your store into languages Translate & Adapt doesn't cover. Reads from Shopify, writes via the official Translation API."
      />
      <TranslationsUI initialLocales={locales} initialMyLocales={myLocales} />
    </div>
  );
}
