/*
  Warnings:

  - The `adjusted` column on the `energy_balance` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "energy_balance" DROP COLUMN "adjusted",
ADD COLUMN     "adjusted" BOOLEAN;
