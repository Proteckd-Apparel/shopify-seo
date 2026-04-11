import JSZip from "jszip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET() {
  const products = await prisma.resource.findMany({
    where: { type: "product" },
    include: { images: true },
  });

  const zip = new JSZip();
  let count = 0;

  for (const p of products) {
    if (p.images.length === 0) continue;
    const folder = zip.folder(p.handle ?? p.id.replace(/[^a-z0-9-]/gi, "_"));
    if (!folder) continue;
    for (let i = 0; i < p.images.length; i++) {
      const img = p.images[i];
      try {
        const cleanUrl = img.src.split("?")[0];
        const res = await fetch(cleanUrl);
        if (!res.ok) continue;
        const ext = (cleanUrl.split(".").pop() ?? "jpg").slice(0, 5);
        const filename = `${String(i + 1).padStart(2, "0")}.${ext}`;
        folder.file(filename, await res.arrayBuffer());
        count++;
      } catch {
        // Skip broken images
      }
    }
  }

  const arr = await zip.generateAsync({ type: "uint8array" });
  // Wrap in a stream so the Response body is a valid BodyInit
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(arr);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="shopify-photos-${count}.zip"`,
    },
  });
}
