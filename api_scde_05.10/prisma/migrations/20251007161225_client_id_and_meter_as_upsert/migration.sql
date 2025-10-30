/*
  Warnings:

  - A unique constraint covering the columns `[meter,client_id]` on the table `energy_balance` will be added. If there are existing duplicate values, this will fail.
  - Made the column `meter` on table `energy_balance` required. This step will fail if there are existing NULL values in that column.
  - Made the column `client_id` on table `energy_balance` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "energy_balance" ALTER COLUMN "meter" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "client_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "energy_balance_meter_client_id_key" ON "energy_balance"("meter", "client_id");
