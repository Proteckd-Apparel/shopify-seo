import { Settings as SettingsIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Wire up Shopify and Claude. Stored locally in SQLite."
      />
      <SettingsForm
        defaults={{
          shopDomain: s?.shopDomain ?? "",
          shopifyToken: s?.shopifyToken ?? "",
          anthropicKey: s?.anthropicKey ?? "",
          judgeMeToken: s?.judgeMeToken ?? "",
          replicateToken: s?.replicateToken ?? "",
          optimizerRules: s?.optimizerRules ?? "",
          storeName: s?.storeName ?? "",
          storeDescription: s?.storeDescription ?? "",
        }}
      />
    </div>
  );
}
