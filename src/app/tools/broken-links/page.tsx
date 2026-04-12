import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BrokenLinksUI } from "./broken-links-ui";
import { getScopeCounts, listBroken } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function BrokenLinksPage() {
  const [counts, rows] = await Promise.all([
    getScopeCounts(),
    listBroken("product"),
  ]);

  return (
    <div>
      <PageHeader
        icon={AlertCircle}
        title="Broken Links"
        description="HEAD-checks every <a> and <img> in your product / collection / article / page bodies. Anything non-2xx shows up here with a one-click 301 redirect."
      />
      <BrokenLinksUI initialScope="product" initialRows={rows} counts={counts} />
    </div>
  );
}
