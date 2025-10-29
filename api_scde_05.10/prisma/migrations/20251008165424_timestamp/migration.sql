/*
  Warnings:

  - You are about to drop the `contracts` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "SCDE" ADD COLUMN     "client_id" UUID,
ALTER COLUMN "origin" DROP NOT NULL,
ALTER COLUMN "origin" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "public"."contracts";

-- CreateTable
CREATE TABLE "Contract" (
    "id" BIGSERIAL NOT NULL,
    "contract_code" TEXT,
    "client_id" UUID NOT NULL,
    "client_name" TEXT NOT NULL,
    "cnpj" TEXT,
    "segment" TEXT,
    "contact_responsible" TEXT,
    "contracted_volume_mwh" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "energy_source" TEXT DEFAULT 'Convencional',
    "contracted_modality" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "billing_cycle" TEXT,
    "upper_limit_percent" DECIMAL(65,30),
    "lower_limit_percent" DECIMAL(65,30),
    "flexibility_percent" DECIMAL(65,30),
    "average_price_mwh" DECIMAL(65,30),
    "spot_price_ref_mwh" DECIMAL(65,30),
    "compliance_consumption" TEXT DEFAULT 'Em análise',
    "compliance_nf" TEXT DEFAULT 'Em análise',
    "compliance_invoice" TEXT DEFAULT 'Em análise',
    "compliance_charges" TEXT DEFAULT 'Em análise',
    "compliance_overall" TEXT DEFAULT 'Em análise',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contract_code_key" ON "Contract"("contract_code");
