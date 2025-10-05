import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { ZodIssue } from "zod";
import { query } from "../db";
import {
  contractCreateSchema,
  contractUpdateSchema,
  toContract,
  type Contract,
  type ContractCreateInput,
  type ContractMutationInput,
  type ContractUpdateInput,
} from "../types/contract";

const router = Router();
const CONTRACT_COLUMNS =
  "id, client, price, reference_base, adjusted, supplier, meter, contract, contact_active, client_id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseIdParam = (rawId: string): number | null => {
  const parsed = Number.parseInt(rawId, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseClientIdParam = (rawClientId: string): string | null => {
  const trimmed = rawClientId.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
};

const mapValidationErrors = (errors: ZodIssue[]) =>
  errors.map(({ path, message }) => ({ field: path.join(".") || "root", message }));

const prepareValueForColumn = (
  field: keyof ContractMutationInput,
  value: ContractMutationInput[keyof ContractMutationInput],
): unknown => {
  if (value === null) {
    return null;
  }

  if (field === "adjusted") {
    return value ? 1 : 0;
  }

  return value;
};

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts ORDER BY id ASC`;
    const { rows } = await query<Record<string, unknown>>(sql);
    const contracts: Contract[] = rows.map((row) => toContract(row));
    res.json({ data: contracts });
  } catch (error) {
    next(error);
  }
});

router.get("/client/:clientId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = parseClientIdParam(req.params.clientId);
    if (!clientId) {
      return res.status(400).json({ error: "Invalid client_id provided." });
    }

    const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE client_id = $1 ORDER BY id ASC`;
    const { rows } = await query<Record<string, unknown>>(sql, [clientId]);

    const contracts: Contract[] = rows.map((row) => toContract(row));
    res.json({ data: contracts });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid contract id provided." });
    }

    const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE id = $1 LIMIT 1`;
    const { rows } = await query<Record<string, unknown>>(sql, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Contract not found." });
    }

    const contract = toContract(rows[0]);
    res.json({ data: contract });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = contractCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: mapValidationErrors(parsed.error.errors) });
    }

    const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as [
      keyof ContractCreateInput,
      ContractCreateInput[keyof ContractCreateInput]
    ][];

    if (entries.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for creation." });
    }

    const columns: string[] = [];
    const placeholders: string[] = [];
    const values: unknown[] = [];

    entries.forEach(([field, value], index) => {
      columns.push(field);
      placeholders.push(`$${index + 1}`);
      values.push(prepareValueForColumn(field, value));
    });

    const sql = `
      INSERT INTO contracts (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
   RETURNING ${CONTRACT_COLUMNS}
    `;

    const { rows } = await query<Record<string, unknown>>(sql, values);
    const contract = toContract(rows[0]);
    res.status(201).json({ data: contract });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid contract id provided." });
    }

    const parsed = contractUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: mapValidationErrors(parsed.error.errors) });
    }

    const updates = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as [
      keyof ContractUpdateInput,
      ContractUpdateInput[keyof ContractUpdateInput]
    ][];

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    updates.forEach(([field, value], index) => {
      setClauses.push(`${field} = $${index + 1}`);
      values.push(prepareValueForColumn(field, value));
    });

    const sql = `
      UPDATE contracts
         SET ${setClauses.join(", ")}
       WHERE id = $${values.length + 1}
   RETURNING ${CONTRACT_COLUMNS}
    `;

    values.push(id);

    const { rows } = await query<Record<string, unknown>>(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Contract not found." });
    }

    const contract = toContract(rows[0]);
    res.json({ data: contract });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid contract id provided." });
    }

    const sql = `
      DELETE FROM contracts
            WHERE id = $1
        RETURNING ${CONTRACT_COLUMNS}
    `;

    const { rows } = await query<Record<string, unknown>>(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Contract not found." });
    }

    const contract = toContract(rows[0]);
    res.json({ data: contract });
  } catch (error) {
    next(error);
  }
});

export default router;
