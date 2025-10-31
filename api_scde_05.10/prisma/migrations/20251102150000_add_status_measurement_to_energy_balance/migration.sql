-- Add statusMeasurement column to energy_balance
ALTER TABLE "energy_balance"
ADD COLUMN IF NOT EXISTS "statusMeasurement" TEXT;
