// The legacy feed route. The original implementation emitted a partial
// XML feed missing several Google Merchant Center required attributes
// (most importantly <g:price>) and hardcoded availability. Anyone whose
// Merchant Center is pulling from this URL has been getting every item
// rejected.
//
// Permanent redirect to the primary feed at /feeds/google-shopping-primary.xml,
// which pulls live from Shopify GraphQL and emits every required field.

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const target = new URL(
    "/feeds/google-shopping-primary.xml",
    new URL(req.url).origin,
  );
  return Response.redirect(target.toString(), 301);
}
