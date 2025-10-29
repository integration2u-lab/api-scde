/*
  Warnings:

  - You are about to drop the column `max_demand` on the `energy_balance` table. All the data in the column will be lost.
  - You are about to drop the column `min_demand` on the `energy_balance` table. All the data in the column will be lost.
  - Added the required column `group` to the `Contract` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "group" TEXT NOT NULL,
ADD COLUMN     "max_demand" DECIMAL,
ADD COLUMN     "min_demand" DECIMAL,
ADD COLUMN     "proinfa_contribution" DECIMAL,
ADD COLUMN     "supplier" TEXT,
ALTER COLUMN "compliance_consumption" SET DEFAULT 'Em an�lise',
ALTER COLUMN "compliance_nf" SET DEFAULT 'Em an�lise',
ALTER COLUMN "compliance_invoice" SET DEFAULT 'Em an�lise',
ALTER COLUMN "compliance_charges" SET DEFAULT 'Em an�lise',
ALTER COLUMN "compliance_overall" SET DEFAULT 'Em an�lise';

-- AlterTable
ALTER TABLE "energy_balance" DROP COLUMN "max_demand",
DROP COLUMN "min_demand";

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "contract_id" BIGINT NOT NULL,
    "client_id" UUID,
    "client_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "saving_monthly" DECIMAL NOT NULL,
    "impact_pct" DECIMAL NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "due_date" DATE,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
