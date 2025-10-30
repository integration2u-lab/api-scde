-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "energy_balance" ADD COLUMN     "bills_date" TIMESTAMPTZ(6),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "send_date" TIMESTAMPTZ(6),
ADD COLUMN     "sent_ok" BOOLEAN;
