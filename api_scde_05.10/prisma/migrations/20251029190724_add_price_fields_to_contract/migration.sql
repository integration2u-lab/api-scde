-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "price" DECIMAL,
ADD COLUMN     "reajuted_price" DECIMAL,
ALTER COLUMN "compliance_consumption" SET DEFAULT 'Em analise',
ALTER COLUMN "compliance_nf" SET DEFAULT 'Em analise',
ALTER COLUMN "compliance_invoice" SET DEFAULT 'Em analise',
ALTER COLUMN "compliance_charges" SET DEFAULT 'Em analise',
ALTER COLUMN "compliance_overall" SET DEFAULT 'Em analise';