import { getOrCreateIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

// Proof-of-ownership file for the IndexNow protocol. Search engines fetch
// this to confirm we control the domain before accepting submissions.
export async function GET() {
  const key = await getOrCreateIndexNowKey();
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
