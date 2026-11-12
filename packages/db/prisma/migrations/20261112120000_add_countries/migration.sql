-- AlterTable
ALTER TABLE "SearchPreference" ADD COLUMN "countries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN "country" TEXT;

-- CreateIndex
CREATE INDEX "JobPosting_country_idx" ON "JobPosting"("country");

-- Enable the new SK/CZ/HU/PL/DE/AT sources on existing preferences
-- (new preferences get every source checked by default in the UI).
UPDATE "SearchPreference"
SET "sources" = ARRAY(
  SELECT DISTINCT unnest("sources" || ARRAY[
    'sluzbyzamestnanosti', 'kariera', 'worki',
    'mpsv', 'jobs-cz', 'prace-cz', 'jenprace', 'startupjobs',
    'profession-hu',
    'cbop', 'justjoin', 'rocketjobs', 'bulldogjob', 'nofluffjobs',
    'arbeitsagentur', 'karriere-at',
    'eures', 'careerjet'
  ])
);
