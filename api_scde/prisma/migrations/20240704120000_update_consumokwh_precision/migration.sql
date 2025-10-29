-- Adjust consumoKwh column to match SCDE consumption precision
ALTER TABLE "public"."EnergyBalance"
  ALTER COLUMN "consumoKwh" TYPE DECIMAL(14,6);
