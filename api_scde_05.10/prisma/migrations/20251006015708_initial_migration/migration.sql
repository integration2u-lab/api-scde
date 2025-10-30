-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SCDE" (
    "recordId" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "clientName" TEXT,
    "periodRef" TEXT NOT NULL,
    "consumed" DECIMAL,
    "statusMeasurement" TEXT,
    "origin" TEXT[],
    "group" TEXT NOT NULL,

    CONSTRAINT "SCDE_pkey" PRIMARY KEY ("recordId")
);

-- CreateTable
CREATE TABLE "energy_balance" (
    "id" BIGSERIAL NOT NULL,
    "client_name" TEXT NOT NULL,
    "price" DECIMAL,
    "reference_base" DATE NOT NULL,
    "supplier" TEXT,
    "meter" TEXT,
    "consumption_kwh" DECIMAL,
    "proinfa_contribution" DECIMAL,
    "contract" DECIMAL,
    "min_demand" DECIMAL,
    "max_demand" DECIMAL,
    "cp_code" TEXT,
    "created_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ,
    "client_id" UUID,
    "contract_id" BIGINT,
    "adjusted" DECIMAL,
    "contact_active" BOOLEAN,
    "billable" DECIMAL,

    CONSTRAINT "energy_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" BIGSERIAL NOT NULL,
    "client" TEXT,
    "price" DECIMAL(65,30),
    "reference_base" TEXT,
    "adjusted" DECIMAL(65,30),
    "supplier" TEXT,
    "meter" TEXT,
    "contract" DECIMAL(65,30),
    "contact_active" BOOLEAN,
    "client_id" UUID,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SCDE_group_periodRef_key" ON "SCDE"("group", "periodRef");
