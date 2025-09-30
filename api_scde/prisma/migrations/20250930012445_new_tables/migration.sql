-- CreateTable
CREATE TABLE "public"."scde" (
    "id" BIGSERIAL NOT NULL,
    "client" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "base_date" DATE,
    "adjusted" DECIMAL(12,2),
    "supplier" TEXT,
    "meter" TEXT,
    "consumption" DECIMAL(14,6),
    "measurement" TEXT,
    "proinfa" DECIMAL(12,3),
    "contract" DECIMAL(14,6),
    "minimum" DECIMAL(14,6),
    "maximum" DECIMAL(14,6),
    "to_bill" DECIMAL(14,6),
    "cp" TEXT NOT NULL DEFAULT 'None.',
    "charges" JSONB,

    CONSTRAINT "scde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."energy_contracts_v2" (
    "id" BIGSERIAL NOT NULL,
    "client" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "base_date" DATE,
    "adjusted" DECIMAL(12,2),
    "supplier" TEXT,
    "meter" TEXT,
    "consumption" DECIMAL(14,6),
    "measurement" TEXT,
    "proinfa" DECIMAL(12,3) DEFAULT 0,
    "contract" DECIMAL(14,6),
    "minimum" DECIMAL(14,6) DEFAULT 0,
    "maximum" DECIMAL(14,6),
    "to_invoice" DECIMAL(14,6),
    "cp" TEXT DEFAULT 'None.',
    "unnamed_14" TEXT,
    "charges" JSONB,

    CONSTRAINT "energy_contracts_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoicing" (
    "id" BIGSERIAL NOT NULL,
    "company" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "consumption" DECIMAL(12,3) NOT NULL,
    "losses_3_percent" DECIMAL(12,3) NOT NULL,
    "proinfa" DECIMAL(12,3) NOT NULL,
    "requirement" DECIMAL(12,3) NOT NULL,
    "resource" DECIMAL(12,3) NOT NULL,
    "net" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "invoicing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."n8n_chat_histories" (
    "id" SERIAL NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "message" JSONB NOT NULL,

    CONSTRAINT "n8n_chat_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."note" (
    "id" BIGSERIAL NOT NULL,
    "invoice" BIGINT NOT NULL,
    "client" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "to_invoice" DECIMAL(14,3) NOT NULL,
    "volume_mwh" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "icms" TEXT,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."peDaSerra" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "number" TEXT,
    "Date" TEXT,

    CONSTRAINT "peDaSerra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EnergyBalance" (
    "id" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "numeroInstalacao" VARCHAR(64),
    "referencia" TEXT NOT NULL,
    "dataBase" TIMESTAMP(3) NOT NULL,
    "consumoKwh" DECIMAL(18,3) NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "importBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportBatch" (
    "id" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "overwriteStrategy" TEXT NOT NULL DEFAULT 'upsert',
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnergyBalance_numeroInstalacao_dataBase_idx" ON "public"."EnergyBalance"("numeroInstalacao", "dataBase");

-- CreateIndex
CREATE INDEX "EnergyBalance_clienteNome_dataBase_idx" ON "public"."EnergyBalance"("clienteNome", "dataBase");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_batchKey_key" ON "public"."ImportBatch"("batchKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_idempotencyKey_key" ON "public"."ImportBatch"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "public"."EnergyBalance" ADD CONSTRAINT "EnergyBalance_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "public"."ImportBatch"("batchKey") ON DELETE CASCADE ON UPDATE CASCADE;
