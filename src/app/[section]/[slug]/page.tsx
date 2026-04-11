import { notFound } from "next/navigation";
import { findItem, findSection } from "@/lib/nav";
import { PageHeader, PlaceholderCard } from "@/components/page-header";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  const { section, slug } = await params;
  if (!findSection(section)) notFound();
  const item = findItem(section, slug);
  if (!item) notFound();

  return (
    <div>
      <PageHeader
        icon={item.icon}
        title={item.title}
        description={item.description}
      />
      <PlaceholderCard
        text={`"${item.title}" placeholder. Real implementation lands in a later phase.`}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string; slug: string }>;
}) {
  const { section, slug } = await params;
  const item = findItem(section, slug);
  return { title: item ? `${item.title} · Shopify SEO` : "Shopify SEO" };
}
