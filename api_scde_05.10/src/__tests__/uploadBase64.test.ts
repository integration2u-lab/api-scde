import request from "supertest";

jest.mock("../db", () => ({
  prisma: {
    $disconnect: jest.fn(),
  },
}));

jest.mock("../controllers/scdeController", () => ({
  upsertSCDE: jest.fn(),
}));

jest.mock("../controllers/energyBalanceController", () => ({
  updateEnergyBalance: jest.fn(),
}));

import { app } from "../server";
import { upsertSCDE } from "../controllers/scdeController";
import { updateEnergyBalance } from "../controllers/energyBalanceController";

describe("POST /api/upload-base64", () => {
  const upsertSCDEMock = upsertSCDE as jest.MockedFunction<typeof upsertSCDE>;
  const updateEnergyBalanceMock = updateEnergyBalance as jest.MockedFunction<typeof updateEnergyBalance>;

  beforeEach(() => {
    upsertSCDEMock.mockReset();
    updateEnergyBalanceMock.mockReset();

    upsertSCDEMock.mockResolvedValue({
      success: true,
      message: "SCDE ok",
      data: { recordId: "1" } as any,
    });

    updateEnergyBalanceMock.mockResolvedValue({
      success: true,
      message: "Energy ok",
      data: { id: 1 } as any,
    });
  });

  it("decodifica base64, converte CSV e processa registros", async () => {
    const csv = [
      "recordId,created_at,periodRef,group,origin,meter,clientName,Ativa C (kWh),contract,proinfa_contribution,reference_base",
      "1,2024-01-01T00:00:00Z,2024-01,Grupo A,fonte1;fonte2,MTR-1,Cliente 1,120,50,10,2024-01-01",
    ].join("\n");

    const base64 = Buffer.from(csv, "utf-8").toString("base64");

    const response = await request(app)
      .post("/api/upload-base64")
      .send({ data: base64 })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("Processamento concluido");

    expect(upsertSCDEMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "1",
        periodRef: "2024-01",
        group: "Grupo A",
        origin: ["fonte1", "fonte2"],
      }),
    );

    expect(updateEnergyBalanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meter: "MTR-1",
        clientName: "Cliente 1",
        ativaCKwh: "120",
        contract: "50",
      }),
    );

    expect(response.body.logs.scde[0]).toEqual(
      expect.objectContaining({
        success: true,
        message: "SCDE ok",
        row: "linha 1",
      }),
    );

    expect(response.body.logs.energyBalance[0]).toEqual(
      expect.objectContaining({
        success: true,
        message: "Energy ok",
        row: "linha 1",
      }),
    );
  });
});
