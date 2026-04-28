// HTTP basic auth gate so the embedded-admin UI + every server action
// behind it isn't reachable on the bare Railway URL. Shopify session
// auth only kicks in inside the iframe — direct hostname hits had no
// gate before this. Public endpoints (cron, storefront pixel, sitemaps)
// are excluded via the matcher below.

import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    // Run on everything EXCEPT:
    //   _next/ static + image internals
    //   favicon
    //   binary asset extensions
    //   api/cron/*           (CRON_SECRET bearer-gated; called by proteckd-cron)
    //   api/log-404 exactly  (storefront pixel POST; /api/log-404/export still gated)
    //   feeds/*              (sitemaps, llms.txt, indexnow-key, google-shopping feeds — public by design)
    "/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff|woff2|ttf|css|js)$|api/cron/|api/log-404$|feeds/).*)",
  ],
};

export function middleware(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // No password = open access (dev only). Set ADMIN_PASSWORD on Railway.
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const pw = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      if (pw === expected) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Shopify SEO"',
    },
  });
}
