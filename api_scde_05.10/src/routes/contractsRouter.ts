import { Prisma } from "@prisma/client";
import { Router, Response } from "express";
import { ZodError } from "zod";

import {
  createContract,
  deleteContract,
  getContractById,
  listContracts,
  updateContract,
} from "../controllers/contractsController";
import {
  createContractSchema,
  updateContractSchema,
} from "../validators/contractsValidator";

const router = Router();

const parseId = (value: string) => {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error("Invalid contract id");
  }
};


const normalizeContractInput = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const data = { ...(payload as Record<string, unknown>) };
  if (data.proinfa_contribution === undefined && data.proinfaContribution !== undefined) {
    data.proinfa_contribution = data.proinfaContribution;
  } else if (data.proinfa_contribution !== undefined && data.proinfaContribution === undefined) {
    data.proinfaContribution = data.proinfa_contribution;
  }
  if (typeof data.proinfa_contribution === "string") {
    data.proinfa_contribution = data.proinfa_contribution.replace(",", ".");
  }
  if (typeof data.proinfaContribution === "string") {
    data.proinfaContribution = data.proinfaContribution.replace(",", ".");
  }
  return data;
};

const handleValidationError = (error: unknown, res: Response): boolean => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Validation failed", issues: error.issues });
    return true;
  }
  return false;
};

const handlePrismaNotFound = (error: unknown, res: Response): boolean => {
  const isPrismaNotFound =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025";
  const isCustomNotFound =
    error instanceof Error && (error as Error & { code?: string }).code === "P2025";

  if (isPrismaNotFound || isCustomNotFound) {
    res.status(404).json({ message: "Contract not found" });
    return true;
  }
  return false;
};

router.post("/", async (req, res) => {
  try {
    const normalizedBody = normalizeContractInput(req.body);
    const payload = createContractSchema.parse(normalizedBody);
    const contract = await createContract(payload);
    res.status(201).json(contract);
  } catch (error) {
    if (handleValidationError(error, res)) {
      return;
    }

    if (error instanceof Error) {
      if (error.message === "Invalid contract id") {
        return res.status(400).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Failed to create contract" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const contracts = await listContracts();
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ message: "Failed to list contracts" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const contract = await getContractById(id);

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid contract id") {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Failed to fetch contract" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const normalizedBody = normalizeContractInput(req.body);
    const payload = updateContractSchema.parse(normalizedBody);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: "No fields provided for update" });
    }

    const contract = await updateContract(id, payload);
    res.json(contract);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid contract id") {
      return res.status(400).json({ message: error.message });
    }

    if (handleValidationError(error, res)) {
      return;
    }

    if (handlePrismaNotFound(error, res)) {
      return;
    }

    res.status(500).json({ message: "Failed to update contract" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await deleteContract(id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid contract id") {
      return res.status(400).json({ message: error.message });
    }

    if (handlePrismaNotFound(error, res)) {
      return;
    }

    res.status(500).json({ message: "Failed to delete contract" });
  }
});

export const contractsRouter = router;
