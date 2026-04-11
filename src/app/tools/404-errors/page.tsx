import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { listNotFounds } from "./actions";
import { NotFoundManager } from "./not-found-manager";

export const dynamic = "force-dynamic";

export default async function FourOhFourPage() {
  const [rows, settings] = await Promise.all([
    listNotFounds(false),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  return (
    <div>
      <PageHeader
        icon={AlertCircle}
        title="404 Errors"
        description="Real 404s captured from your storefront. Add the snippet below to theme.liquid and they start streaming in."
      />
      <NotFoundManager
        initial={rows}
        redirectToHome={settings?.redirect404ToHome ?? false}
      />
    </div>
  );
}
