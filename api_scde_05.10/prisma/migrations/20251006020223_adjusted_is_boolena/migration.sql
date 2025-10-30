/*
  Warnings:

  - The `adjusted` column on the `contracts` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "adjusted",
ADD COLUMN     "adjusted" BOOLEAN;
