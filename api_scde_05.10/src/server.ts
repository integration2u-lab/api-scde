"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const sync_1 = require("csv-parse/sync");
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const scdeController_1 = require("./controllers/scdeController");
const energyBalanceController_1 = require("./controllers/energyBalanceController");
const energyBalanceRouter_1 = require("./routes/energyBalanceRouter");
const contractsRouter_1 = require("./routes/contractsRouter");
if (typeof BigInt.prototype.toJSON !== "function") {
    Object.defineProperty(BigInt.prototype, "toJSON", {
        value() {
            return this.toString();
        },
        writable: true,
        configurable: true,
    });
}
exports.app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3000;
exports.app.use(express_1.default.json({ limit: "100mb" }));
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', '*']
};
exports.app.use((0, cors_1.default)(corsOptions));
exports.app.use("/contracts", contractsRouter_1.contractsRouter);
exports.app.use("/energy-balance", energyBalanceRouter_1.energyBalanceRouter);
exports.app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
exports.app.get("/api/contacts/active-count", async (_req, res) => {
    try {
        const contractDelegate = db_1.prisma.contract;
        const [totalContracts, totalActiveContracts, totalInactiveContracts] = await Promise.all([
            contractDelegate.count(),
            contractDelegate.count({
                where: {
                    status: {
                        equals: "Ativo",
                        mode: "insensitive",
                    },
                },
            }),
            contractDelegate.count({
                where: {
                    status: {
                        equals: "Inativo",
                        mode: "insensitive",
                    },
                },
            }),
        ]);
        const totalOtherStatuses = Math.max(totalContracts - totalActiveContracts - totalInactiveContracts, 0);
        const consideredTotal = totalActiveContracts + totalInactiveContracts;
        const differencePercentage = consideredTotal === 0
            ? 0
            : Number((((totalActiveContracts - totalInactiveContracts) / consideredTotal) * 100).toFixed(2));
        res.json({
            totalContracts,
            totalActiveContracts,
            totalInactiveContracts,
            totalOtherStatuses,
            differencePercentage,
        });
    }
    catch (error) {
        console.error("[contacts] active count failed", error);
        res.status(500).json({ message: "Failed to fetch contacts activity totals." });
    }
});
const startOfMonthUtc = (date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
const formatMonth = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const decimalToNumber = (value) => {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (value instanceof client_1.Prisma.Decimal) {
        return value.toNumber();
    }
    const num = typeof value === "string" ? Number(value) : Number(value);
    return Number.isFinite(num) ? num : undefined;
};
const roundToTwo = (value) => Math.round(value * 100) / 100;
const flexToPercentage = (flex) => `${Math.round(flex * 100)}%`;
const normalizeText = (value) => {
    if (typeof value !== "string") {
        return "";
    }
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
const classifyCompliance = (consumption, min, max) => {
    if (consumption === null || min === null || max === null) {
        return "indefinido";
    }
    if (consumption < min) {
        return "subutilizado";
    }
    if (consumption > max) {
        return "excedente";
    }
    return "conforme";
};
const complianceQuerySchema = zod_1.z.object({
    mes: zod_1.z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    flex: zod_1.z
        .preprocess((val) => {
        if (val === undefined) {
            return undefined;
        }
        if (Array.isArray(val)) {
            val = val[0];
        }
        if (typeof val === "string" && val.trim() === "") {
            return undefined;
        }
        const num = Number(val);
        return Number.isFinite(num) ? num : NaN;
    }, zod_1.z.number().min(0).max(0.5))
        .optional(),
});
const parseBooleanParam = (val) => {
    if (val === undefined) {
        return undefined;
    }
    if (Array.isArray(val)) {
        val = val[0];
    }
    if (typeof val === "boolean") {
        return val;
    }
    if (typeof val === "string") {
        const normalized = val.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) {
            return true;
        }
        if (["false", "0", "no", "off"].includes(normalized)) {
            return false;
        }
        if (normalized === "") {
            return undefined;
        }
    }
    return undefined;
};
const parseStringListParam = (val) => {
    if (val === undefined || val === null) {
        return undefined;
    }
    const rawValues = Array.isArray(val) ? val : [val];
    const collected = [];
    for (const raw of rawValues) {
        if (typeof raw !== "string") {
            continue;
        }
        const fragments = raw
            .split(/[,;]+/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        collected.push(...fragments);
    }
    if (collected.length === 0) {
        return undefined;
    }
    return Array.from(new Set(collected));
};
const opportunitiesQuerySchema = complianceQuerySchema.extend({
    n: zod_1.z
        .preprocess((val) => {
        if (val === undefined) {
            return undefined;
        }
        if (Array.isArray(val)) {
            val = val[0];
        }
        if (typeof val === "string" && val.trim() === "") {
            return undefined;
        }
        const num = Number(val);
        return Number.isFinite(num) ? Math.trunc(num) : NaN;
    }, zod_1.z.number().int().min(1).max(50))
        .optional(),
    deltaPct: zod_1.z
        .preprocess(parseBooleanParam, zod_1.z.boolean())
        .optional(),
});
const closingContractsQuerySchema = complianceQuerySchema.extend({
    limit: zod_1.z
        .preprocess((val) => {
        if (val === undefined) {
            return undefined;
        }
        if (Array.isArray(val)) {
            val = val[0];
        }
        if (typeof val === "string" && val.trim() === "") {
            return undefined;
        }
        const num = Number(val);
        return Number.isFinite(num) ? Math.trunc(num) : NaN;
    }, zod_1.z.number().int().min(1).max(20))
        .optional(),
    statusAberto: zod_1.z
        .preprocess(parseStringListParam, zod_1.z.array(zod_1.z.string().min(1).max(100)).min(1))
        .optional(),
});
const defaultOpenOpportunityStatuses = [
    "Em negociação",
    "Em negociacao",
    "Proposta enviada",
    "Aguardando assinatura",
];
const ensureRecord = (map, clientId) => {
    const key = clientId ?? "__sem_id__";
    let record = map.get(key);
    if (!record) {
        record = {
            client_id: clientId,
            consumo: null,
            min: null,
            max: null,
            status: "indefinido",
        };
        map.set(key, record);
    }
    return record;
};
async function buildComplianceDetails(options) {
    const { monthKey, currentPeriodStart, nextPeriodStart, flex } = options;
    const fallbackFlex = typeof flex === "number" ? flex : 0;
    const records = new Map();
    const consumptionGroups = await db_1.prisma.scde.groupBy({
        by: ["client_id"],
        where: { periodRef: monthKey },
        _sum: { consumed: true },
    });
    for (const row of consumptionGroups) {
        const clientId = row.client_id ?? null;
        if (!clientId) {
            continue;
        }
        const record = ensureRecord(records, clientId);
        const total = decimalToNumber(row._sum.consumed);
        record.consumo = total ?? null;
    }
    const energyRows = await db_1.prisma.energyBalance.findMany({
        where: {
            referenceBase: {
                gte: currentPeriodStart,
                lt: nextPeriodStart,
            },
        },
        select: {
            clientId: true,
            minDemand: true,
            maxDemand: true,
        },
    });
    for (const row of energyRows) {
        if (!row.clientId) {
            continue;
        }
        const record = ensureRecord(records, row.clientId);
        const min = decimalToNumber(row.minDemand);
        const max = decimalToNumber(row.maxDemand);
        if (record.min === null && min !== undefined) {
            record.min = min;
        }
        if (record.max === null && max !== undefined) {
            record.max = max;
        }
    }
    const contractRows = await db_1.prisma.contract.findMany({
        where: {
            start_date: { lte: nextPeriodStart },
            end_date: { gte: currentPeriodStart },
        },
        select: {
            client_id: true,
            contracted_volume_mwh: true,
            upper_limit_percent: true,
            lower_limit_percent: true,
            flexibility_percent: true,
        },
    });
    for (const row of contractRows) {
        const clientId = row.client_id ?? null;
        if (!clientId) {
            continue;
        }
        const record = ensureRecord(records, clientId);
        if (record.min !== null && record.max !== null) {
            continue;
        }
        const target = decimalToNumber(row.contracted_volume_mwh);
        if (target === undefined) {
            continue;
        }
        const flexPercent = decimalToNumber(row.flexibility_percent);
        let lowerPercent = decimalToNumber(row.lower_limit_percent);
        let upperPercent = decimalToNumber(row.upper_limit_percent);
        if (flexPercent !== undefined) {
            lowerPercent = flexPercent;
            upperPercent = flexPercent;
        }
        const appliedLower = lowerPercent !== undefined ? lowerPercent : fallbackFlex;
        const appliedUpper = upperPercent !== undefined ? upperPercent : fallbackFlex;
        const min = target * (1 - appliedLower);
        const max = target * (1 + appliedUpper);
        if (record.min === null) {
            record.min = min;
        }
        if (record.max === null) {
            record.max = max;
        }
    }
    for (const record of records.values()) {
        record.status = classifyCompliance(record.consumo, record.min, record.max);
    }
    return Array.from(records.values());
}
async function buildContractOpportunities(options) {
    const { monthKey, currentPeriodStart, nextPeriodStart, flex, deltaPct } = options;
    const fallbackFlex = typeof flex === "number" ? flex : 0;
    const consumptionGroups = await db_1.prisma.scde.groupBy({
        by: ["client_id"],
        where: { periodRef: monthKey },
        _sum: { consumed: true },
    });
    const consumptionMap = new Map();
    for (const row of consumptionGroups) {
        if (!row.client_id) {
            continue;
        }
        const total = decimalToNumber(row._sum.consumed);
        consumptionMap.set(row.client_id, total ?? 0);
    }
    const energyRows = await db_1.prisma.energyBalance.findMany({
        where: {
            referenceBase: {
                gte: currentPeriodStart,
                lt: nextPeriodStart,
            },
        },
        select: {
            clientId: true,
            maxDemand: true,
        },
    });
    const energyMap = new Map();
    for (const row of energyRows) {
        if (!row.clientId) {
            continue;
        }
        const max = decimalToNumber(row.maxDemand);
        if (max !== undefined) {
            energyMap.set(row.clientId, max);
        }
    }
    const contractRows = await db_1.prisma.contract.findMany({
        where: {
            start_date: { lte: nextPeriodStart },
            end_date: { gte: currentPeriodStart },
        },
        select: {
            id: true,
            client_name: true,
            client_id: true,
            contracted_volume_mwh: true,
            upper_limit_percent: true,
            lower_limit_percent: true,
            flexibility_percent: true,
        },
    });
    const clientIds = new Set();
    for (const row of contractRows) {
        if (row.client_id) {
            clientIds.add(row.client_id);
        }
    }
    const clientsById = new Map();
    if (clientIds.size > 0) {
        const clientRows = await db_1.prisma.client.findMany({
            where: { clientId: { in: Array.from(clientIds) } },
            select: { clientId: true, name: true },
        });
        for (const client of clientRows) {
            clientsById.set(client.clientId, client.name);
        }
    }
    const opportunities = [];
    for (const contractRow of contractRows) {
        const clientId = contractRow.client_id;
        if (!clientId) {
            continue;
        }
        const consumption = consumptionMap.get(clientId) ?? 0;
        let limit = energyMap.get(clientId);
        if (limit === undefined) {
            const target = decimalToNumber(contractRow.contracted_volume_mwh);
            if (target !== undefined) {
                const flexPercent = decimalToNumber(contractRow.flexibility_percent);
                let upperPercent = decimalToNumber(contractRow.upper_limit_percent);
                if (flexPercent !== undefined) {
                    upperPercent = flexPercent;
                }
                const appliedUpper = upperPercent !== undefined ? upperPercent : fallbackFlex;
                limit = target * (1 + appliedUpper);
            }
        }
        if (limit === undefined || limit <= 0) {
            continue;
        }
        if (consumption <= limit) {
            continue;
        }
        const delta = consumption - limit;
        const consumptionRounded = roundToTwo(consumption);
        const limitRounded = roundToTwo(limit);
        let percentage;
        if (deltaPct && limit > 0) {
            const pctDelta = ((consumption - limit) / limit) * 100;
            percentage = `${Math.round(pctDelta)}%`;
        }
        else {
            percentage = flexToPercentage(fallbackFlex);
        }
        const contractLabel = `CT-${contractRow.id}`;
        const clientName = contractRow.client_name ?? clientsById.get(clientId) ?? "Cliente sem nome";
        opportunities.push({
            contract: contractLabel,
            client: clientName,
            consumption: consumptionRounded,
            limit: limitRounded,
            percentage,
            status: "Com Oportunidade",
            actionUrl: `/contratos/${contractRow.id}`,
            delta,
        });
    }
    opportunities.sort((a, b) => b.delta - a.delta);
    return opportunities;
}
async function buildClosingPotentialContracts(options) {
    const { currentPeriodStart, nextPeriodStart, openStatuses, baseDate } = options;
    const statusList = openStatuses.length > 0 ? openStatuses : defaultOpenOpportunityStatuses;
    const normalizedStatusSet = new Set(statusList.map(normalizeText).filter((item) => item.length > 0));
    const opportunityRows = await db_1.prisma.$queryRaw `
        SELECT
            o.id,
            o.title,
            o.status,
            o.priority,
            o.impact_pct AS "impactPct",
            o.saving_monthly AS "savingMonthly",
            o.due_date AS "dueDate",
            o.contract_id AS "contractId",
            c.contract_code AS "contractCode",
            c.client_name AS "clientName",
            c.status AS "contractStatus",
            c.compliance_overall AS "complianceOverall"
        FROM "opportunities" o
        INNER JOIN "Contract" c ON c.id = o.contract_id
        WHERE o.period >= ${currentPeriodStart} AND o.period < ${nextPeriodStart}
    `;
    const processed = [];
    let maxSaving = 0;
    let maxImpact = 0;
    for (const row of opportunityRows) {
        if (!row.contractId) {
            continue;
        }
        const contractStatusNormalized = normalizeText(row.contractStatus ?? "");
        if (contractStatusNormalized && contractStatusNormalized !== "ativo") {
            continue;
        }
        const opportunityStatusNormalized = normalizeText(row.status ?? "");
        if (normalizedStatusSet.size > 0 && !normalizedStatusSet.has(opportunityStatusNormalized)) {
            continue;
        }
        const savingValue = decimalToNumber(row.savingMonthly) ?? 0;
        const impactValue = decimalToNumber(row.impactPct) ?? 0;
        const priorityValue = typeof row.priority === "number" ? row.priority : null;
        const dueDateValue = row.dueDate instanceof Date ? row.dueDate : null;
        if (savingValue > maxSaving) {
            maxSaving = savingValue;
        }
        if (impactValue > maxImpact) {
            maxImpact = impactValue;
        }
        processed.push({
            id: row.id,
            title: row.title,
            status: row.status,
            priority: priorityValue,
            saving: savingValue,
            impact: impactValue,
            dueDate: dueDateValue,
            contractId: row.contractId,
            contract: {
                id: row.contractId,
                contract_code: row.contractCode,
                client_name: row.clientName,
                status: row.contractStatus,
                compliance_overall: row.complianceOverall,
            },
        });
    }
    if (processed.length === 0) {
        return [];
    }
    const contractMap = new Map();
    const dayInMs = 24 * 60 * 60 * 1000;
    const dueWindowDays = 45;
    for (const item of processed) {
        const priorityScore = item.priority && item.priority > 0 ? Math.min(1, 1 / Math.max(item.priority, 1)) : 0.5;
        const impactScore = maxImpact > 0 ? Math.min(Math.max(item.impact / maxImpact, 0), 1) : 0;
        const valueScore = maxSaving > 0 ? Math.min(Math.max(item.saving / maxSaving, 0), 1) : 0;
        let dueSoonScore = 0;
        if (item.dueDate instanceof Date) {
            const diffDays = (item.dueDate.getTime() - baseDate.getTime()) / dayInMs;
            if (diffDays <= 0) {
                dueSoonScore = 1;
            }
            else if (diffDays <= dueWindowDays) {
                dueSoonScore = 1 - diffDays / dueWindowDays;
            }
        }
        let weightedScore = (priorityScore * 0.35) + (impactScore * 0.3) + (valueScore * 0.25) + (dueSoonScore * 0.1);
        const complianceNormalized = normalizeText(item.contract.compliance_overall ?? "");
        if (complianceNormalized && complianceNormalized !== "em analise" && complianceNormalized !== "irregular") {
            weightedScore += 0.05;
        }
        const finalScore = weightedScore * 100;
        const contractKey = item.contractId.toString();
        let entry = contractMap.get(contractKey);
        if (!entry) {
            entry = {
                contractId: item.contractId,
                contractCode: item.contract.contract_code ?? null,
                clientName: item.contract.client_name ?? "Cliente sem nome",
                contractStatus: item.contract.status ?? null,
                totalScore: 0,
                count: 0,
                nextDueDate: null,
                keyOpportunity: null,
            };
            contractMap.set(contractKey, entry);
        }
        entry.totalScore += finalScore;
        entry.count += 1;
        if (item.dueDate && (!entry.nextDueDate || item.dueDate < entry.nextDueDate)) {
            entry.nextDueDate = item.dueDate;
        }
        if (!entry.keyOpportunity || finalScore > entry.keyOpportunity.score) {
            entry.keyOpportunity = {
                score: finalScore,
                title: item.title,
                status: item.status,
                priority: item.priority,
                impact: item.impact,
                saving: item.saving,
                dueDate: item.dueDate,
            };
        }
    }
    const results = [];
    for (const entry of contractMap.values()) {
        if (!entry.count) {
            continue;
        }
        const averageScore = entry.totalScore / entry.count;
        results.push({
            contractId: entry.contractId,
            contractCode: entry.contractCode,
            clientName: entry.clientName,
            contractStatus: entry.contractStatus,
            score: Number(averageScore.toFixed(2)),
            openOpportunities: entry.count,
            nextDueDate: entry.nextDueDate ? entry.nextDueDate.toISOString() : null,
            keyOpportunity: entry.keyOpportunity
                ? {
                    title: entry.keyOpportunity.title,
                    status: entry.keyOpportunity.status,
                    priority: entry.keyOpportunity.priority ?? null,
                    impactPct: Number(entry.keyOpportunity.impact.toFixed(2)),
                    savingMonthly: Number(entry.keyOpportunity.saving.toFixed(2)),
                    dueDate: entry.keyOpportunity.dueDate ? entry.keyOpportunity.dueDate.toISOString() : null,
                }
                : null,
        });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}
async function fetchTopContractsByVolume(limit) {
    const rows = await db_1.prisma.contract.findMany({
        where: {
            contracted_volume_mwh: {
                not: null,
            },
        },
        orderBy: {
            contracted_volume_mwh: "desc",
        },
        take: limit,
        select: {
            id: true,
            contract_code: true,
            client_name: true,
            contracted_volume_mwh: true,
            status: true,
            start_date: true,
            end_date: true,
            price: true,
            reajuted_price: true,
            average_price_mwh: true,
            proinfa_contribution: true,
            minDemand: true,
            maxDemand: true,
            supplier: true,
            email: true,
        },
    });
    return rows.map((row) => ({
        id: row.id,
        contractCode: row.contract_code,
        clientName: row.client_name,
        contractedVolumeMwh: row.contracted_volume_mwh,
        status: row.status,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString() : null,
        endDate: row.end_date instanceof Date ? row.end_date.toISOString() : null,
        price: decimalToNumber(row.price) ?? null,
        reajutedPrice: decimalToNumber(row.reajuted_price) ?? null,
        averagePriceMwh: decimalToNumber(row.average_price_mwh) ?? null,
        proinfaContribution: decimalToNumber(row.proinfa_contribution) ?? null,
        minDemand: decimalToNumber(row.minDemand) ?? null,
        maxDemand: decimalToNumber(row.maxDemand) ?? null,
        supplier: row.supplier ?? null,
        email: row.email ?? null,
    }));
}
exports.app.get("/api/contratos/oportunidades", async (req, res) => {
    const parseResult = opportunitiesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid query parameters." });
    }
    const { mes, flex, n, deltaPct } = parseResult.data;
    const flexValue = flex ?? 0.06;
    const nValue = n ?? 5;
    const deltaPctFlag = deltaPct ?? false;
    const baseDate = mes ? new Date(`${mes}-01T00:00:00Z`) : new Date();
    const currentPeriodStart = startOfMonthUtc(baseDate, 0);
    const nextPeriodStart = startOfMonthUtc(baseDate, 1);
    const monthKey = mes ?? formatMonth(currentPeriodStart);
    try {
        const opportunities = await buildContractOpportunities({
            monthKey,
            currentPeriodStart,
            nextPeriodStart,
            flex: flexValue,
            deltaPct: deltaPctFlag,
        });
        const topLimit = Math.min(nValue, opportunities.length);
        const topContractOpportunities = opportunities
            .slice(0, topLimit)
            .map(({ delta, ...rest }) => rest);
        res.json({ topContractOpportunities });
    }
    catch (error) {
        console.error("[opportunities] fetch failed", error);
        res.status(500).json({ message: "Failed to fetch contract opportunities." });
    }
});
exports.app.get("/api/contratos/fechamento-potencial", async (req, res) => {
    const parseResult = closingContractsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid query parameters." });
    }
    const { mes, limit, statusAberto } = parseResult.data;
    const limitValue = limit ?? 5;
    const statusList = Array.isArray(statusAberto) && statusAberto.length > 0
        ? statusAberto
        : defaultOpenOpportunityStatuses;
    const baseDate = mes ? new Date(`${mes}-01T00:00:00Z`) : new Date();
    const currentPeriodStart = startOfMonthUtc(baseDate, 0);
    const nextPeriodStart = startOfMonthUtc(baseDate, 1);
    try {
        const candidates = await buildClosingPotentialContracts({
            currentPeriodStart,
            nextPeriodStart,
            openStatuses: statusList,
            baseDate,
        });
        const topClosingContracts = candidates.slice(0, limitValue);
        res.json({ topClosingContracts });
    }
    catch (error) {
        console.error("[contracts] fechamento potencial failed", error);
        res.status(500).json({ message: "Failed to fetch closing potential contracts." });
    }
});
exports.app.get("/api/contratos/top-volume", async (_req, res) => {
    try {
        const topContracts = await fetchTopContractsByVolume(10);
        res.json({ topContracts });
    }
    catch (error) {
        console.error("[contracts] top volume failed", error);
        res.status(500).json({ message: "Failed to fetch top contracts by volume." });
    }
});
exports.app.get("/api/conformidade-resumo", async (req, res) => {
    const parseResult = complianceQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid query parameters." });
    }
    const { mes, flex } = parseResult.data;
    const flexValue = flex ?? 0.1;
    const baseDate = mes ? new Date(`${mes}-01T00:00:00Z`) : new Date();
    const currentPeriodStart = startOfMonthUtc(baseDate, 0);
    const nextPeriodStart = startOfMonthUtc(baseDate, 1);
    const previousPeriodStart = startOfMonthUtc(baseDate, -1);
    const monthKey = mes ?? formatMonth(currentPeriodStart);
    try {
        const details = await buildComplianceDetails({
            monthKey,
            currentPeriodStart,
            nextPeriodStart,
            previousPeriodStart,
            flex: flexValue,
        });
        const counters = {
            conforme: 0,
            excedente: 0,
            subutilizado: 0,
            indefinido: 0,
        };
        for (const item of details) {
            counters[item.status] += 1;
        }
        const total = details.length;
        res.json({
            compliance: {
                total,
                details: counters,
            },
        });
    }
    catch (error) {
        console.error("[compliance] resumo failed", error);
        res.status(500).json({ message: "Failed to fetch compliance summary." });
    }
});
exports.app.get("/api/conformidade-detalhes", async (req, res) => {
    const parseResult = complianceQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid query parameters." });
    }
    const { mes, flex } = parseResult.data;
    const flexValue = flex ?? 0.1;
    const baseDate = mes ? new Date(`${mes}-01T00:00:00Z`) : new Date();
    const currentPeriodStart = startOfMonthUtc(baseDate, 0);
    const nextPeriodStart = startOfMonthUtc(baseDate, 1);
    const previousPeriodStart = startOfMonthUtc(baseDate, -1);
    const monthKey = mes ?? formatMonth(currentPeriodStart);
    try {
        const details = await buildComplianceDetails({
            monthKey,
            currentPeriodStart,
            nextPeriodStart,
            previousPeriodStart,
            flex: flexValue,
        });
        res.json({ details });
    }
    catch (error) {
        console.error("[compliance] detalhes failed", error);
        res.status(500).json({ message: "Failed to fetch compliance details." });
    }
});
const getFirstValue = (record, keys) => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            const value = record[key];
            if (value !== undefined && value !== null && String(value).trim() !== "") {
                return value;
            }
        }
    }
    return undefined;
};
const toStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
            .filter((item) => item.length > 0);
    }
    if (value === undefined || value === null) {
        return [];
    }
    if (typeof value === "string") {
        return value
            .split(/[,;]+/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
    return [String(value).trim()].filter((item) => item.length > 0);
};
const toBooleanOrNull = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value === 1;
    }
    const normalized = String(value).trim().toLowerCase();
    const normalizedAscii = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (["true", "1", "yes", "sim"].includes(normalized) || ["true", "1", "yes", "sim"].includes(normalizedAscii)) {
        return true;
    }
    if (["false", "0", "no", "nao"].includes(normalized) || ["false", "0", "no", "nao"].includes(normalizedAscii)) {
        return false;
    }
    return null;
};
const processScdeRecords = async (records) => {
    const scdeLogs = [];
    const energyLogs = [];
    for (const [index, record] of records.entries()) {
        const rowLabel = `linha ${index + 1}`;
        const recordId = getFirstValue(record, ["recordId", "record_id", "RecordId"]);
        const createdAt = getFirstValue(record, ["created_at", "createdAt", "Created At"]);
        const periodRef = getFirstValue(record, ["periodRef", "period_ref", "Period Ref", "Data - Base mensal", "Data - Base Mensal"]);
        const originValues = toStringArray(getFirstValue(record, ["origin", "origins", "Origin", "ORIGIN", "Origem"]));
        const originText = originValues.join(", ");
        const groupValue = getFirstValue(record, ["group", "Group", "groupName", "group_name", "Ponto / Grupo"]);
        const referenceBaseValue = getFirstValue(record, ["reference_base", "referenceBase", "Reference Base", "Data - Base mensal", "Data - Base Mensal"]) ?? periodRef;
        const missingScdeFields = [];
        if (periodRef === undefined)
            missingScdeFields.push("periodRef (Data - Base mensal)");
        if (groupValue === undefined)
            missingScdeFields.push("group (Ponto / Grupo)");
        if (originText.length === 0)
            missingScdeFields.push("origin (Origem)");
        let scdePayload = null;
        if (missingScdeFields.length === 0) {
            scdePayload = {
                recordId: recordId,
                created_at: (createdAt ?? referenceBaseValue ?? null),
                clientName: getFirstValue(record, ["clientName", "client_name", "Client Name", "Agente", "agente"]) ?? null,
                periodRef: String(periodRef),
                consumed: getFirstValue(record, [
                    "consumed",
                    "consumed_kwh",
                    "Consumption (kWh)",
                    "Ativa C (kWh)",
                    "ativa_c_kwh",
                    "ativaCKwh",
                ]),
                statusMeasurement: getFirstValue(record, [
                    "statusMeasurement",
                    "status_measurement",
                    "Status Measurement",
                    "Qualidade",
                ]) ?? null,
                origin: originText,
                group: String(groupValue),
            };
        }
        if (!scdePayload) {
            scdeLogs.push({
                success: false,
                message: `${rowLabel}: campos obrigatorios de SCDE ausentes (${missingScdeFields.join(", ") || "desconhecido"}).`,
            });
            energyLogs.push({
                success: false,
                message: `${rowLabel}: atualizacao de energy_balance ignorada (SCDE invalido).`,
            });
            continue;
        }
        const scdeResult = await (0, scdeController_1.upsertSCDE)(scdePayload);
        scdeLogs.push({ ...scdeResult, row: rowLabel });
        const scdeClientId = scdeResult.success ? scdeResult.data.client_id ?? null : null;
        const meterValue = getFirstValue(record, [
            "meter",
            "Meter",
            "group",
            "Group",
            "groupName",
            "group_name",
            "Ponto / Grupo",
        ]) ?? scdePayload.group;
        const consumptionValue = getFirstValue(record, ["Ativa C (kWh)", "ativa_c_kwh", "ativaCKwh"]);
        const clientNameValue = getFirstValue(record, ["client_name", "clientName", "Client Name", "Agente", "agente"]) ??
            scdePayload.clientName ??
            undefined;
        const clientIdValue = getFirstValue(record, ["client_id", "clientId"]) ??
            (scdeClientId ?? undefined);
        const missingEnergyFields = [];
        if (!meterValue)
            missingEnergyFields.push("meter");
        if (!consumptionValue)
            missingEnergyFields.push("Ativa C (kWh)");
        if (!referenceBaseValue)
            missingEnergyFields.push("reference_base (Data - Base mensal)");
        if (!clientNameValue)
            missingEnergyFields.push("clientName");
        if (!clientIdValue)
            missingEnergyFields.push("clientId");
        if (missingEnergyFields.length > 0) {
            energyLogs.push({
                success: false,
                message: `${rowLabel}: atualizacao de energy_balance ignorada (faltando: ${missingEnergyFields.join(", ")}).`,
            });
            continue;
        }
        const energyPayload = {
            meter: String(meterValue),
            clientName: String(clientNameValue),
            referenceBase: referenceBaseValue,
            price: getFirstValue(record, ["price", "Price"]),
            reajutedPrice: getFirstValue(record, ["reajuted_price", "reajutedPrice", "Reajuted Price"]),
            supplier: getFirstValue(record, ["supplier", "Supplier"]) ?? null,
            email: getFirstValue(record, ["email", "Email"]) ?? null,
            ativaCKwh: consumptionValue,
            statusMeasurement: getFirstValue(record, [
                "statusMeasurement",
                "status_measurement",
                "Status Measurement",
                "Qualidade",
            ]) ?? scdePayload.statusMeasurement ?? null,
            proinfaContribution: getFirstValue(record, ["proinfa_contribution", "proinfaContribution", "Proinfa Contribution"]),
            contract: getFirstValue(record, ["contract", "Contract"]),
            adjusted: getFirstValue(record, ["adjusted", "Adjusted"]),
            contactActive: toBooleanOrNull(getFirstValue(record, ["contact_active", "contactActive", "Contact Active"])),
            sentOk: toBooleanOrNull(getFirstValue(record, ["sent_ok", "sentOk", "Sent Ok"])),
            sendDate: getFirstValue(record, ["send_date", "sendDate", "Send Date"]),
            billsDate: getFirstValue(record, ["bills_date", "billsDate", "Bills Date"]),
            clientId: clientIdValue,
            contractId: getFirstValue(record, ["contract_id", "contractId"]),
            createdAt: (createdAt ?? referenceBaseValue ?? null),
            updatedAt: getFirstValue(record, ["updated_at", "updatedAt", "Updated At"]),
        };
        const energyResult = await (0, energyBalanceController_1.updateEnergyBalance)(energyPayload);
        energyLogs.push({ ...energyResult, row: rowLabel });
    }
    return { scdeLogs, energyLogs };
};
exports.app.post("/api/upload-base64", async (req, res) => {
    const { data } = req.body ?? {};
    if (typeof data !== "string" || data.trim().length === 0) {
        return res.status(400).json({ message: "Body precisa conter o campo 'data' com CSV em base64." });
    }
    let decodedCsv;
    try {
        decodedCsv = Buffer.from(data, "base64").toString("utf-8");
    }
    catch (error) {
        return res.status(400).json({
            message: "Nao foi possivel decodificar base64 fornecido.",
            error: error instanceof Error ? error.message : String(error),
        });
    }
    if (decodedCsv.trim().length === 0) {
        return res.status(400).json({ message: "Conteudo CSV decodificado esta vazio." });
    }
    let records;
    try {
        records = (0, sync_1.parse)(decodedCsv, {
            columns: true,
            bom: true,
            skip_empty_lines: true,
            trim: true,
        });
    }
    catch (error) {
        return res.status(400).json({
            message: "Falha ao converter CSV.",
            error: error instanceof Error ? error.message : String(error),
        });
    }
    if (records.length === 0) {
        return res.status(200).json({ message: "Nenhuma linha para processar.", logs: { scde: [], energyBalance: [] } });
    }
    const { scdeLogs, energyLogs } = await processScdeRecords(records);
    return res.status(200).json({
        message: `Processamento concluido (${records.length} linha(s)).`,
        logs: {
            scde: scdeLogs,
            energyBalance: energyLogs,
        },
    });
});
exports.app.post("/api/scde", async (req, res) => {
    const payload = req.body;
    const records = [];
    const pushRecord = (value) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            records.push(value);
        }
    };
    if (Array.isArray(payload)) {
        payload.forEach(pushRecord);
    }
    else if (payload && typeof payload === "object") {
        const maybeRecords = payload.records;
        if (Array.isArray(maybeRecords)) {
            maybeRecords.forEach(pushRecord);
        }
        else {
            pushRecord(payload);
        }
    }
    if (records.length === 0) {
        return res.status(400).json({ message: "Payload deve ser um objeto ou array com registros SCDE." });
    }
    const { scdeLogs, energyLogs } = await processScdeRecords(records);
    return res.status(200).json({
        message: `Processamento concluido (${records.length} linha(s)).`,
        logs: {
            scde: scdeLogs,
            energyBalance: energyLogs,
        },
    });
});
if (require.main === module) {
    const server = exports.app.listen(port, () => {
        console.log(`HTTP server listening on port ${port}`);
    });
    const shutdownSignals = ["SIGINT", "SIGTERM"];
    shutdownSignals.forEach((signal) => {
        process.on(signal, async () => {
            try {
                await db_1.prisma.$disconnect();
            }
            finally {
                server.close(() => {
                    process.exit(0);
                });
            }
        });
    });
}
