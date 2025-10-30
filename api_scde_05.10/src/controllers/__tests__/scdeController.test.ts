import { Prisma } from "@prisma/client";
import { upsertSCDE } from "../scdeController";
import { prisma } from "../../db";

jest.mock("../../db", () => ({
  prisma: {
    scde: {
      upsert: jest.fn(),
    },
  },
}));

type PrismaMock = {
  scde: {
    upsert: jest.Mock;
  };
};

const getPrismaMock = (): PrismaMock => prisma as unknown as PrismaMock;

describe("upsertSCDE", () => {
  beforeEach(() => {
    getPrismaMock().scde.upsert.mockReset();
  });

  it("insere novo registro SCDE normalizando campos", async () => {
    const prismaMock = getPrismaMock();
    const upsertResponse = {
      recordId: BigInt(1),
      createdAt: new Date("2024-01-01T00:00:00Z"),
      clientName: "Cliente X",
      periodRef: "2024-01",
      consumed: new Prisma.Decimal("123.45"),
      statusMeasurement: "OK",
      origin: ["fonte"],
      groupName: "GRP",
    };

    prismaMock.scde.upsert.mockResolvedValue(upsertResponse);

    const result = await upsertSCDE({
      recordId: "1",
      created_at: "2024-01-01T00:00:00Z",
      clientName: "Cliente X",
      periodRef: "2024-01",
      consumed: "123.45",
      statusMeasurement: "OK",
      origin: ["fonte"],
      group: "GRP",
    });

    expect(prismaMock.scde.upsert).toHaveBeenCalledWith({
      where: {
        groupName_periodRef: {
          groupName: "GRP",
          periodRef: "2024-01",
        },
      },
      update: expect.objectContaining({
        createdAt: new Date("2024-01-01T00:00:00Z"),
        origin: ["fonte"],
        clientName: "Cliente X",
        consumed: new Prisma.Decimal("123.45"),
        statusMeasurement: "OK",
      }),
      create: expect.objectContaining({
        recordId: BigInt(1),
        createdAt: new Date("2024-01-01T00:00:00Z"),
        clientName: "Cliente X",
        periodRef: "2024-01",
        consumed: new Prisma.Decimal("123.45"),
        statusMeasurement: "OK",
        origin: ["fonte"],
        groupName: "GRP",
      }),
    });

    expect(result).toEqual({
      success: true,
      message: expect.stringContaining("upsert succeeded"),
      data: upsertResponse,
    });
  });

  it("retorna erro quando campos obrigatorios faltam", async () => {
    const prismaMock = getPrismaMock();

    const result = await upsertSCDE({
      recordId: "1",
      created_at: "2024-01-01T00:00:00Z",
      periodRef: "2024-01",
      origin: [],
      group: "",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("upsert failed");
    expect(prismaMock.scde.upsert).not.toHaveBeenCalled();
  });
});
