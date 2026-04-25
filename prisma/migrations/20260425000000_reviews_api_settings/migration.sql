-- Self-hosted reviews API replaces Judge.me. judgeMeToken is left in place
-- for backfill; reviewsApiBase + reviewsApiKey are the new fields the
-- JSON-LD generator reads from.
ALTER TABLE "Settings" ADD COLUMN "reviewsApiBase" TEXT;
ALTER TABLE "Settings" ADD COLUMN "reviewsApiKey" TEXT;
