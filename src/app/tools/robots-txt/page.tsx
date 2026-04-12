import { FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getRobotsState } from "./actions";
import { RobotsUI } from "./robots-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RobotsTxtPage() {
  const state = await getRobotsState();

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Robots.txt"
        description="Add custom robots.txt rules and write them to your theme. Shopify defaults are preserved — your rules are appended inside each user-agent group."
      />
      <RobotsUI
        initialRules={state.rules}
        initialBoost={state.boostImages}
        initialLive={state.liveContent}
        domain={state.domain}
      />
    </div>
  );
}
