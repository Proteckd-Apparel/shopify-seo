import { Replace } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listRedirects } from "@/lib/shopify-redirects";
import { RedirectsManager } from "./redirects-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RedirectsPage() {
  let redirects: { id: string; path: string; target: string }[] = [];
  let error: string | null = null;
  try {
    redirects = await listRedirects();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load redirects";
  }

  return (
    <div>
      <PageHeader
        icon={Replace}
        title="Redirects"
        description="Manage 301 URL redirects on your Shopify store."
      />
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <RedirectsManager initial={redirects} />
      )}
    </div>
  );
}
