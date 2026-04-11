import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function OptimizerSettingsPage() {
  const cfg = await loadOptimizerConfig();
  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Optimizer Settings"
        description="Choose what the optimizer touches when you run Optimize All. Per-resource toggles, with optional overwrite of existing values."
      />
      <SettingsForm initial={cfg} />
    </div>
  );
}
