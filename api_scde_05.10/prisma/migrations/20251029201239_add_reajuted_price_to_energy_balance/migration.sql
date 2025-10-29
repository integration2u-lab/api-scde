-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "compliance_consumption" SET DEFAULT 'Em anï¿½lise',
ALTER COLUMN "compliance_nf" SET DEFAULT 'Em anï¿½lise',
ALTER COLUMN "compliance_invoice" SET DEFAULT 'Em anï¿½lise',
ALTER COLUMN "compliance_charges" SET DEFAULT 'Em anï¿½lise',
ALTER COLUMN "compliance_overall" SET DEFAULT 'Em anï¿½lise';

-- AlterTable
ALTER TABLE "energy_balance" ADD COLUMN     "reajuted_price" DECIMAL;
