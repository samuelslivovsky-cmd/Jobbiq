-- Enable the Austrian browser-based sources (local crawler only) on existing
-- preferences; they're skipped automatically on Vercel.
UPDATE "SearchPreference"
SET "sources" = ARRAY(
  SELECT DISTINCT unnest("sources" || ARRAY['ams', 'stepstone-at'])
);
