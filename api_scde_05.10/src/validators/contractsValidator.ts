import { z } from "zod";

const decimalField = z
  .union([
    z.number(),
    z.string().regex(/^-?\d+(?:[.,]\d+)?$/),
    z.null(),
  ])
  .transform((value) => {
    if (value === null) {
      return null;
    }
    if (typeof value === "string") {
      value = value.replace(",", ".");
    }
    return value.toString();
  });

const dateField = z
  .union([
    z.date(),
    z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date format"),
  ])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const optionalString = z.union([z.string().trim(), z.null()]).optional();
const optionalDate = z.union([dateField, z.null()]).optional();

export const createContractSchema = z.object({
  contract_code: z.union([z.string().trim().min(1), z.null()]).optional(),
  client_id: z.string().uuid().optional(),
  client_name: z.string().trim().min(1, "client_name is required"),
  groupName: z.string().trim().min(1, "groupName is required"),
  social_reason: optionalString,
  cnpj: optionalString,
  segment: optionalString,
  supplier: optionalString,
  contact_responsible: optionalString,
  email: optionalString,
  contracted_volume_mwh: decimalField.optional(),
  status: optionalString,
  energy_source: optionalString,
  contracted_modality: optionalString,
  start_date: dateField,
  end_date: dateField,
  billing_cycle: optionalString,
  upper_limit_percent: decimalField.optional(),
  lower_limit_percent: decimalField.optional(),
  flexibility_percent: decimalField.optional(),
  average_price_mwh: decimalField.optional(),
  proinfa_contribution: decimalField.optional(),
  spot_price_ref_mwh: decimalField.optional(),
  compliance_consumption: optionalString,
  compliance_nf: optionalString,
  compliance_invoice: optionalString,
  compliance_charges: optionalString,
  compliance_overall: optionalString,
  created_at: optionalDate,
  updated_at: optionalDate,
});

export const updateContractSchema = createContractSchema.partial();

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
