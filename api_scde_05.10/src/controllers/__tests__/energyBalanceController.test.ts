import { Prisma } from "@prisma/client";
import { updateEnergyBalance } from "../energyBalanceController";
import { prisma } from "../../db";

jest.mock("../../db", () => ({
  prisma: {
    energyBalance: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    contract: {
      findFirst: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
  },
}));

type PrismaMock = {
  energyBalance: {
    findFirst: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  contract: {
    findFirst: jest.Mock;
  };
  client: {
    findUnique: jest.Mock;
  };
};

const getPrismaMock = (): PrismaMock => prisma as unknown as PrismaMock;

const expectedCpCode = "\u004E\u00E3o h\u00E1.";

describe("updateEnergyBalance", () => {
  beforeEach(() => {
    const prismaMock = getPrismaMock();
    prismaMock.energyBalance.findFirst.mockReset();
    prismaMock.energyBalance.update.mockReset();
    prismaMock.energyBalance.create.mockReset();
    prismaMock.contract.findFirst.mockReset();
    prismaMock.client.findUnique.mockReset();
  });

  it("cria registro calculando campos derivados", async () => {
    const prismaMock = getPrismaMock();

    prismaMock.contract.findFirst.mockResolvedValue({
      id: BigInt(3),
      average_price_mwh: null,
      supplier: "Fornecedor Contrato",
      email: "contato@contrato.com",
      contracted_volume_mwh: new Prisma.Decimal("50"),
      proinfa_contribution: null,
      lower_limit_percent: null,
      upper_limit_percent: null,
      flexibility_percent: null,
      minDemand: new Prisma.Decimal("0"),
      maxDemand: new Prisma.Decimal("100"),
    });
    prismaMock.energyBalance.findFirst.mockResolvedValue(null);
    prismaMock.energyBalance.create.mockResolvedValue({
      id: BigInt(1),
      meter: "MTR-1",
    });

    await updateEnergyBalance({
      meter: "MTR-1",
      clientName: "Cliente",
      referenceBase: "2024-01-01",
      price: "0.45",
      reajutedPrice: "0.5",
      supplier: "Fornecedor",
      ativaCKwh: "100",
      proinfaContribution: "0.01",
      contract: "50",
      adjusted: true,
      contactActive: true,
      sentOk: true,
      sendDate: "2024-01-12T00:00:00Z",
      billsDate: "2024-01-20T00:00:00Z",
      clientId: "uuid-123",
      contractId: "12",
      createdAt: "2024-01-05T00:00:00Z",
      updatedAt: "2024-01-10T00:00:00Z",
    });

    expect(prismaMock.energyBalance.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.energyBalance.create.mock.calls[0][0];

    expect(createArgs.data.meter).toBe("MTR-1");
    expect(createArgs.data.clientName).toBe("Cliente");
    expect(createArgs.data.referenceBase).toEqual(new Date("2024-01-01"));
    expect(createArgs.data.consumptionKwh?.toString()).toBe("0.1");
    expect(createArgs.data.proinfaContribution.toString()).toBe("0.01");
    expect(createArgs.data.contract.toString()).toBe("50");
    expect(createArgs.data.reajuted_price?.toString()).toBe("0.5");
    expect(createArgs.data.email).toBe("contato@contrato.com");
    expect(createArgs.data.sentOk).toBe(true);
    expect(createArgs.data.sendDate).toEqual(new Date("2024-01-12T00:00:00Z"));
    expect(createArgs.data.billsDate).toEqual(new Date("2024-01-20T00:00:00Z"));
    expect(createArgs.data.minDemand?.toString()).toBe("0");
    expect(createArgs.data.maxDemand?.toString()).toBe("100");
    expect(createArgs.data.billable?.toString()).toBe(
      new Prisma.Decimal("0.1")
        .mul(new Prisma.Decimal(103))
        .div(new Prisma.Decimal(100))
        .minus(new Prisma.Decimal("0.01"))
        .toString(),
    );
    expect(createArgs.data.loss).toBe(
      new Prisma.Decimal("0.1").mul(new Prisma.Decimal("0.03")).toString(),
    );
    expect(createArgs.data.requirement).toBe(
      new Prisma.Decimal("0.1")
        .add(new Prisma.Decimal("0.1").mul(new Prisma.Decimal("0.03")))
        .minus(new Prisma.Decimal("0.01"))
        .toString(),
    );
    expect(createArgs.data.net).toBe("0");
    expect(createArgs.data.cpCode).toBe(expectedCpCode);
    expect(createArgs.data.contractId).toBe(BigInt(12));
    expect(createArgs.data.adjusted).toBe(true);
    expect(createArgs.data.createdAt).toEqual(new Date("2024-01-05T00:00:00Z"));
    expect(createArgs.data.updatedAt).toEqual(new Date("2024-01-10T00:00:00Z"));
  });

  it("atualiza registro limitando billable ao maximo", async () => {
    const prismaMock = getPrismaMock();

    prismaMock.contract.findFirst.mockResolvedValue({
      id: BigInt(7),
      average_price_mwh: null,
      supplier: null,
      email: "contrato@cliente.com",
      contracted_volume_mwh: new Prisma.Decimal("50"),
      proinfa_contribution: null,
      lower_limit_percent: null,
      upper_limit_percent: null,
      flexibility_percent: null,
      minDemand: null,
      maxDemand: null,
    });
    prismaMock.energyBalance.findFirst.mockResolvedValue({ id: BigInt(5) });
    prismaMock.energyBalance.update.mockResolvedValue({ id: BigInt(5) });

    await updateEnergyBalance({
      meter: "MTR-2",
      clientName: "Cliente",
      referenceBase: "2024-02-01",
      ativaCKwh: "200000",
      contract: "50",
      proinfaContribution: "0",
      sentOk: false,
      email: "payload@cliente.com",
      sendDate: "2024-02-10T00:00:00Z",
      clientId: "uuid-456",
    });

    expect(prismaMock.energyBalance.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.energyBalance.update.mock.calls[0][0];

    expect(updateArgs.where).toEqual({ id: BigInt(5) });
    expect(updateArgs.data.billable?.toString()).toBe("100");
    expect(updateArgs.data.maxDemand?.toString()).toBe("100");
    expect(updateArgs.data.email).toBe("contrato@cliente.com");
    expect(updateArgs.data.sentOk).toBe(false);
    expect(updateArgs.data.sendDate).toEqual(new Date("2024-02-10T00:00:00Z"));
    expect(updateArgs.data.billsDate).toBeNull();
    expect(updateArgs.data.reajuted_price).toBeNull();
    expect(updateArgs.data.loss).toBe(new Prisma.Decimal("200").mul(new Prisma.Decimal("0.03")).toString());
    expect(updateArgs.data.requirement).toBe(
      new Prisma.Decimal("200")
        .add(new Prisma.Decimal("200").mul(new Prisma.Decimal("0.03")))
        .toString(),
    );
    expect(updateArgs.data.net).toBe(
      new Prisma.Decimal("200")
        .add(new Prisma.Decimal("200").mul(new Prisma.Decimal("0.03")))
        .minus(new Prisma.Decimal("100"))
        .toString(),
    );
    expect(updateArgs.data.cpCode).toBe("Compra");
    expect(updateArgs.data.updatedAt).toBeInstanceOf(Date);
  });

  it("nao calcula billable quando nao ha contrato nem proinfa", async () => {
    const prismaMock = getPrismaMock();

    prismaMock.contract.findFirst.mockResolvedValue(null);
    prismaMock.energyBalance.findFirst.mockResolvedValue(null);
    prismaMock.energyBalance.create.mockResolvedValue({
      id: BigInt(99),
      meter: "MTR-SEM",
    });

    await updateEnergyBalance({
      meter: "MTR-SEM",
      clientName: "Cliente",
      referenceBase: "2024-03-01",
      ativaCKwh: "500",
      clientId: "uuid-789",
    });

    expect(prismaMock.energyBalance.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.energyBalance.create.mock.calls[0][0];

    expect(createArgs.data.contract).toBeNull();
    expect(createArgs.data.email).toBeNull();
    expect(createArgs.data.sentOk).toBeNull();
    expect(createArgs.data.sendDate).toBeNull();
    expect(createArgs.data.billsDate).toBeNull();
    expect(createArgs.data.maxDemand).toBeNull();
    expect(createArgs.data.billable).toBeNull();
    expect(createArgs.data.reajuted_price).toBeNull();
    expect(createArgs.data.cpCode).toBeNull();
    expect(createArgs.data.loss).toBe(
      new Prisma.Decimal("0.5").mul(new Prisma.Decimal("0.03")).toString(),
    );
    expect(createArgs.data.requirement).toBe(
      new Prisma.Decimal("0.5")
        .add(new Prisma.Decimal("0.5").mul(new Prisma.Decimal("0.03")))
        .toString(),
    );
    expect(createArgs.data.net).toBeNull();
  });

  it("usa email do cliente quando contrato nao possui", async () => {
    const prismaMock = getPrismaMock();

    prismaMock.contract.findFirst.mockResolvedValue({
      id: BigInt(11),
      client_id: "client-abc",
      average_price_mwh: null,
      supplier: "Fornecedor",
      email: null,
      contracted_volume_mwh: new Prisma.Decimal("40"),
      proinfa_contribution: null,
      lower_limit_percent: null,
      upper_limit_percent: null,
      flexibility_percent: null,
      minDemand: new Prisma.Decimal("0"),
      maxDemand: new Prisma.Decimal("80"),
    });
    prismaMock.energyBalance.findFirst.mockResolvedValue(null);
    prismaMock.energyBalance.create.mockResolvedValue({
      id: BigInt(77),
      meter: "MTR-CLIENT",
    });

    prismaMock.client.findUnique.mockResolvedValue({ email: "cliente@empresa.com" });

    await updateEnergyBalance({
      meter: "MTR-CLIENT",
      clientName: "Cliente",
      referenceBase: "2024-05-01",
      ativaCKwh: "50000",
      contract: "40",
      clientId: "client-abc",
    });

    expect(prismaMock.energyBalance.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.energyBalance.create.mock.calls[0][0];
    expect(createArgs.data.email).toBe("cliente@empresa.com");
    expect(prismaMock.client.findUnique).toHaveBeenCalledTimes(1);
  });
});
