import { Prisma } from "@prisma/client";

export type DecimalInput = string | number | bigint | Prisma.Decimal | null | undefined;

const DECIMAL_ZERO = new Prisma.Decimal(0);
const DECIMAL_TWO = new Prisma.Decimal(2);

const normalizeDecimal = (value: DecimalInput): Prisma.Decimal | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (normalized.length === 0) {
      return null;
    }
    return new Prisma.Decimal(normalized);
  }
  if (typeof value === "bigint") {
    return new Prisma.Decimal(value.toString());
  }
  return new Prisma.Decimal(value);
};

type ContractDemandOptions = {
  contractedVolume: DecimalInput;
  lowerLimitPercent?: DecimalInput;
  upperLimitPercent?: DecimalInput;
  flexibilityPercent?: DecimalInput;
};

export const calculateContractDemandBounds = ({
  contractedVolume,
}: ContractDemandOptions): { min: Prisma.Decimal | null; max: Prisma.Decimal | null } => {
  const volume = normalizeDecimal(contractedVolume);
  if (!volume) {
    return { min: null, max: null };
  }

  const min = volume.mul(DECIMAL_ZERO);
  const max = volume.mul(DECIMAL_TWO);

  return { min, max };
};
