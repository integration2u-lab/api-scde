import { z } from "zod";

const nullableString = (max: number) =>
  z.union([z.string().trim().min(1).max(max), z.literal(null)]);

const nullableFiniteNumber = z.union([
  z
    .coerce
    .number({ invalid_type_error: "Value must be a number" })
    .refine((numeric) => Number.isFinite(numeric), { message: "Value must be finite" }),
  z.literal(null),
]);

const nullableUuid = z.union([
  z.string().uuid({ message: "client_id must be a valid UUID" }),
  z.literal(null),
]);

const ensureFiniteNumber = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${field} value received from database.`);
  }
  return numeric;
};

const ensureBoolean = (value: unknown, fallback = false): boolean => {
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

const ensureOptionalBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return ensureBoolean(value);
};

const ensureOptionalString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
};

const ensureReferenceBase = (value: unknown): string | null => {
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

const ensureId = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid id value received from database.");
  }
  return numeric;
};

export const contractRowSchema = z.object({
  id: z.number(),
  client: z.string().nullable(),
  price: z.number().nullable(),
  reference_base: z.string().nullable(),
  adjusted: z.boolean(),
  supplier: z.string().nullable(),
  meter: z.string().nullable(),
  contract: z.number().nullable(),
  contact_active: z.boolean().nullable(),
  client_id: z.string().uuid().nullable(),
});

export type Contract = z.infer<typeof contractRowSchema>;

const contractMutationSchema = z
  .object({
    client: nullableString(255).optional(),
    price: nullableFiniteNumber.optional(),
    reference_base: z
      .union([
        z
          .coerce
          .date({ invalid_type_error: "reference_base must be a valid date" })
          .transform((date) => date.toISOString().split("T")[0]),
        z.literal(null),
      ])
      .optional(),
    adjusted: z.union([z.coerce.boolean(), z.literal(null)]).optional(),
    supplier: nullableString(255).optional(),
    meter: nullableString(255).optional(),
    contract: nullableFiniteNumber.optional(),
    contact_active: z.union([z.coerce.boolean(), z.literal(null)]).optional(),
    client_id: nullableUuid.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export type ContractMutationInput = z.infer<typeof contractMutationSchema>;

export const contractUpdateSchema = contractMutationSchema;
export type ContractUpdateInput = ContractMutationInput;

export const contractCreateSchema = contractMutationSchema;
export type ContractCreateInput = ContractMutationInput;

export const toContract = (row: Record<string, unknown>): Contract => {
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
  } satisfies Record<keyof Contract, unknown>;

  return contractRowSchema.parse(normalized);
};
