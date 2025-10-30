/*
  Warnings:

  - The `reference_base` column on the `contracts` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "reference_base",
ADD COLUMN     "reference_base" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "energy_balance" ALTER COLUMN "reference_base" DROP NOT NULL;
