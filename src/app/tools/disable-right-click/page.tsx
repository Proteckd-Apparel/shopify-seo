import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function DisableRightClickPage() {
  return (
    <div>
      <PageHeader
        icon={Lock}
        title="Disable Right Click"
        description="Theme snippet to disable right-click on storefront pages."
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 max-w-3xl text-sm text-amber-900 mb-4">
        <h3 className="font-semibold mb-2">Honest take</h3>
        <p>
          Disabling right-click is mostly cosmetic — it stops casual users from
          saving images but anyone with dev tools or curl can bypass it
          instantly. Real watermarks or DMCA takedowns are stronger
          protection.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl">
        <h3 className="font-semibold mb-2">Snippet</h3>
        <p className="text-xs text-slate-500 mb-3">
          Paste this into your <code className="bg-slate-100 px-1 rounded">theme.liquid</code> just before the closing <code className="bg-slate-100 px-1 rounded">&lt;/body&gt;</code> tag.
        </p>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto">
{`<script>
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });
  document.addEventListener('selectstart', function(e) {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
  document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });
</script>`}
        </pre>
      </div>
    </div>
  );
}
