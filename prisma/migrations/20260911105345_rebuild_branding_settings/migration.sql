/*
  Warnings:

  - You are about to drop the column `fontFamily` on the `branding_settings` table. All the data in the column will be lost.
  - Added the required column `currency` to the `branding_settings` table.
  - Added the required column `fonts` to the `branding_settings` table.
  - Made the column `logoUrl` on table `branding_settings` required.

  Written by hand (not the raw Prisma-generated SQL) to stay safe against a
  table that already has a row: this environment's own table happened to be
  empty when the migration was generated, but staging/production may already
  have a "default" row from before this rewrite (BrandingController.get()
  upserts one on first GET). Adding `currency`/`fonts` as NOT NULL with no
  default in one step would fail against such a row - add nullable, backfill,
  then tighten.
*/
-- AlterTable: new/changed columns, existing ones keep their old values
ALTER TABLE "branding_settings"
  ADD COLUMN     "countryName" TEXT NOT NULL DEFAULT 'Nigeria',
  ADD COLUMN     "currency" JSONB,
  ADD COLUMN     "fonts" JSONB,
  ADD COLUMN     "sidebarColor" TEXT NOT NULL DEFAULT '#004972',
  ADD COLUMN     "textColor" TEXT NOT NULL DEFAULT '#101828',
  ALTER COLUMN "primaryColor" SET DEFAULT '#004972',
  ALTER COLUMN "secondaryColor" SET DEFAULT '#ffca05',
  ALTER COLUMN "logoUrl" SET DEFAULT '/Logos/geapp.png';

-- Backfill any pre-existing row (there is at most one - id is always
-- "default") with the same shipped defaults BrandingService.ts uses.
UPDATE "branding_settings"
SET
  "currency" = COALESCE("currency", '{"code":"NGN","symbol":"₦","locale":"en-NG"}'::jsonb),
  "fonts" = COALESCE(
    "fonts",
    '{"h1":"Google Sans","h2":"Google Sans","h3":"Google Sans","h4":"Google Sans","h5":"Google Sans","h6":"Google Sans","body":"Google Sans"}'::jsonb
  ),
  "logoUrl" = COALESCE("logoUrl", '/Logos/geapp.png');

-- Now safe to tighten to NOT NULL.
ALTER TABLE "branding_settings"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "fonts" SET NOT NULL,
  ALTER COLUMN "logoUrl" SET NOT NULL;

ALTER TABLE "branding_settings" DROP COLUMN "fontFamily";
