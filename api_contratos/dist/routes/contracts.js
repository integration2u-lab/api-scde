"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const contract_1 = require("../types/contract");
const router = (0, express_1.Router)();
const CONTRACT_COLUMNS = "id, client, price, reference_base, adjusted, supplier, meter, contract, contact_active, client_id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseIdParam = (rawId) => {
    const parsed = Number.parseInt(rawId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
};
const parseClientIdParam = (rawClientId) => {
    const trimmed = rawClientId.trim();
    return UUID_REGEX.test(trimmed) ? trimmed : null;
};
const mapValidationErrors = (errors) => errors.map(({ path, message }) => ({ field: path.join(".") || "root", message }));
const prepareValueForColumn = (field, value) => {
    if (value === null) {
        return null;
    }
    if (field === "adjusted") {
        return value ? 1 : 0;
    }
    return value;
};
router.get("/", async (_req, res, next) => {
    try {
        const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts ORDER BY id ASC`;
        const { rows } = await (0, db_1.query)(sql);
        const contracts = rows.map((row) => (0, contract_1.toContract)(row));
        res.json({ data: contracts });
    }
    catch (error) {
        next(error);
    }
});
router.get("/client/:clientId", async (req, res, next) => {
    try {
        const clientId = parseClientIdParam(req.params.clientId);
        if (!clientId) {
            return res.status(400).json({ error: "Invalid client_id provided." });
        }
        const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE client_id = $1 ORDER BY id ASC`;
        const { rows } = await (0, db_1.query)(sql, [clientId]);
        const contracts = rows.map((row) => (0, contract_1.toContract)(row));
        res.json({ data: contracts });
    }
    catch (error) {
        next(error);
    }
});
router.get("/:id", async (req, res, next) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) {
            return res.status(400).json({ error: "Invalid contract id provided." });
        }
        const sql = `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE id = $1 LIMIT 1`;
        const { rows } = await (0, db_1.query)(sql, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Contract not found." });
        }
        const contract = (0, contract_1.toContract)(rows[0]);
        res.json({ data: contract });
    }
    catch (error) {
        next(error);
    }
});
router.post("/", async (req, res, next) => {
    try {
        const parsed = contract_1.contractCreateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ errors: mapValidationErrors(parsed.error.errors) });
        }
        const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
        if (entries.length === 0) {
            return res.status(400).json({ error: "No valid fields provided for creation." });
        }
        const columns = [];
        const placeholders = [];
        const values = [];
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
        const { rows } = await (0, db_1.query)(sql, values);
        const contract = (0, contract_1.toContract)(rows[0]);
        res.status(201).json({ data: contract });
    }
    catch (error) {
        next(error);
    }
});
router.put("/:id", async (req, res, next) => {
    try {
        const id = parseIdParam(req.params.id);
        if (!id) {
            return res.status(400).json({ error: "Invalid contract id provided." });
        }
        const parsed = contract_1.contractUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ errors: mapValidationErrors(parsed.error.errors) });
        }
        const updates = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
        if (updates.length === 0) {
            return res.status(400).json({ error: "No valid fields provided for update." });
        }
        const setClauses = [];
        const values = [];
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
        const { rows } = await (0, db_1.query)(sql, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Contract not found." });
        }
        const contract = (0, contract_1.toContract)(rows[0]);
        res.json({ data: contract });
    }
    catch (error) {
        next(error);
    }
});
router.delete("/:id", async (req, res, next) => {
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
        const { rows } = await (0, db_1.query)(sql, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Contract not found." });
        }
        const contract = (0, contract_1.toContract)(rows[0]);
        res.json({ data: contract });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
