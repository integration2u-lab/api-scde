"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toContract = exports.contractCreateSchema = exports.contractUpdateSchema = exports.contractRowSchema = void 0;
const zod_1 = require("zod");
const nullableString = (max) => zod_1.z.union([zod_1.z.string().trim().min(1).max(max), zod_1.z.literal(null)]);
const nullableFiniteNumber = zod_1.z.union([
    zod_1.z
        .coerce
        .number({ invalid_type_error: "Value must be a number" })
        .refine((numeric) => Number.isFinite(numeric), { message: "Value must be finite" }),
    zod_1.z.literal(null),
]);
const nullableUuid = zod_1.z.union([
    zod_1.z.string().uuid({ message: "client_id must be a valid UUID" }),
    zod_1.z.literal(null),
]);
const ensureFiniteNumber = (value, field) => {
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`Invalid ${field} value received from database.`);
    }
    return numeric;
};
const ensureBoolean = (value, fallback = false) => {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (value === "t" || value === "1" || value === 1) {
        return true;
    }
    if (value === "f" || value === "0" || value === 0) {
        return false;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "yes", "y"].includes(normalized)) {
            return true;
        }
        if (["false", "no", "n"].includes(normalized)) {
            return false;
        }
    }
    return Boolean(value);
};
const ensureOptionalBoolean = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    return ensureBoolean(value);
};
const ensureOptionalString = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : null;
};
const ensureReferenceBase = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const stringValue = String(value).trim();
    if (!stringValue) {
        return null;
    }
    const date = new Date(stringValue);
    if (Number.isNaN(date.getTime())) {
        return stringValue;
    }
    return date.toISOString().split("T")[0];
};
const ensureId = (value) => {
    const numeric = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(numeric)) {
        throw new Error("Invalid id value received from database.");
    }
    return numeric;
};
exports.contractRowSchema = zod_1.z.object({
    id: zod_1.z.number(),
    client: zod_1.z.string().nullable(),
    price: zod_1.z.number().nullable(),
    reference_base: zod_1.z.string().nullable(),
    adjusted: zod_1.z.boolean(),
    supplier: zod_1.z.string().nullable(),
    meter: zod_1.z.string().nullable(),
    contract: zod_1.z.number().nullable(),
    contact_active: zod_1.z.boolean().nullable(),
    client_id: zod_1.z.string().uuid().nullable(),
});
const contractMutationSchema = zod_1.z
    .object({
    client: nullableString(255).optional(),
    price: nullableFiniteNumber.optional(),
    reference_base: zod_1.z
        .union([
        zod_1.z
            .coerce
            .date({ invalid_type_error: "reference_base must be a valid date" })
            .transform((date) => date.toISOString().split("T")[0]),
        zod_1.z.literal(null),
    ])
        .optional(),
    adjusted: zod_1.z.union([zod_1.z.coerce.boolean(), zod_1.z.literal(null)]).optional(),
    supplier: nullableString(255).optional(),
    meter: nullableString(255).optional(),
    contract: nullableFiniteNumber.optional(),
    contact_active: zod_1.z.union([zod_1.z.coerce.boolean(), zod_1.z.literal(null)]).optional(),
    client_id: nullableUuid.optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
});
exports.contractUpdateSchema = contractMutationSchema;
exports.contractCreateSchema = contractMutationSchema;
const toContract = (row) => {
    const normalized = {
        id: ensureId(row.id),
        client: ensureOptionalString(row.client),
        price: ensureFiniteNumber(row.price, "price"),
        reference_base: ensureReferenceBase(row.reference_base),
        adjusted: ensureBoolean(row.adjusted),
        supplier: ensureOptionalString(row.supplier),
        meter: ensureOptionalString(row.meter),
        contract: ensureFiniteNumber(row.contract, "contract"),
        contact_active: ensureOptionalBoolean(row.contact_active),
        client_id: ensureOptionalString(row.client_id),
    };
    return exports.contractRowSchema.parse(normalized);
};
exports.toContract = toContract;
