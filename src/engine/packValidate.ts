// src/engine/packValidate.ts

import { z } from "zod";

/**
 * Convenience for z.record(z.string(), valueSchema)
 */
const Rec = <V extends z.ZodTypeAny>(v: V) => z.record(z.string(), v);

/**
 * Accept plain numbers, "Infinity", "-Infinity", and numeric strings like "12" or "-3.5".
 * We will coerce to a real number in normalizePack.
 */
const NumberLike = z.union([
    z.number(),
    z.literal("Infinity"),
    z.literal("-Infinity"),
    z.string().regex(/^[+-]?\d+(\.\d+)?$/)
]);

// ---------- Primitives ----------

const Id = z.string().min(1);
const Label = z.string().optional();
const Desc = z.string().optional();
const Expr = z.string().min(1);

// ---------- Schema blocks ----------

const Attribute = z.object({
    id: Id,
    label: Label,
    description: Desc,
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.number().optional()
}).passthrough();

const Resource = z.object({
    id: Id,
    label: Label,
    description: Desc,
    defaultMaxFormula: Expr.optional()
}).passthrough();

const ProfCategory = z.object({
    id: Id,
    label: Label,
    ranks: z.array(z.string()).default([])
}).passthrough();

const Slot = z.object({
    id: Id,
    label: Label,
    maxEquipped: z.number().int().positive().default(1)
}).passthrough();

const Inventory = z.object({
    mode: z.enum(["slot_limit", "weight_limit", "hybrid"]).optional(),
    maxSlots: z.number().int().positive().optional(),
    weightLimitFormula: Expr.optional(),
    slotTypes: z.array(Slot).optional()
}).passthrough();

const Schema = z.object({
    attributes: z.array(Attribute).optional(),
    resources: z.array(Resource).optional(),
    proficiencyCategories: z.array(ProfCategory).optional(),
    // legacy location for slots, still allowed
    itemSlots: z.array(Slot).optional(),
    // preferred container for slots and inventory model
    inventory: Inventory.optional(),
    tags: z.array(z.string()).optional(),
    derived: z.array(z.object({
        id: Id,
        label: Label,
        formula: Expr
    }).passthrough()).optional(),
    // health, spellcasting, etc can be arbitrary, we don't constrain
    health: Rec(z.any()).optional()
}).passthrough();

const Mechanics = Rec(z.any()).optional();

// ---------- Rules ----------

const Rules = z.object({
    operators: z.array(z.string()).optional(),
    stackingPolicies: z.array(z.string()).optional(),
    formulas: Rec(z.string()).optional(),
    // lookup tables: tableName -> key -> value (number or string)
    lookups: Rec(Rec(z.union([z.number(), z.string()]))).optional(),

    // Optional convenience tables that your actions layer can read
    // tag -> { key: NumberLike }
    tagCaps: Rec(Rec(NumberLike)).optional(),
    tagBonuses: Rec(Rec(NumberLike)).optional(),

    // Per-key stacking policies; allow extra keys and a "default" key
    stacking: z.object({
        caps: Rec(z.enum(["min", "max", "sum"] as const)).optional(),
        bonuses: Rec(z.enum(["min", "max", "sum"] as const)).optional()
    }).passthrough().optional()
}).passthrough();

// ---------- Metadata ----------

const Metadata = z.object({
    id: Id,
    name: z.string().optional(),
    version: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    homepage: z.string().optional()
}).passthrough();

// ---------- Pack root ----------

export const Pack = z.object({
    metadata: Metadata,
    schema: Schema.optional().default({}),
    mechanics: Mechanics,
    rules: Rules.optional().default({}),
    content: Rec(z.any()).optional().default({}),
    uiPreset: Rec(z.any()).optional()
}).passthrough();

export type ValidPack = z.infer<typeof Pack>;

// ---------- Validation + Normalization ----------

/**
 * Throw a compact, readable error if structure is invalid.
 */
export function validatePack(input: unknown): ValidPack {
    const res = Pack.safeParse(input);
    if (res.success) return res.data;
    const issue = res.error.issues[0];
    const path = issue.path.join(".") || "(root)";
    const msg = `${issue.code} at ${path}: ${issue.message}`;
    throw new Error(`Pack validation failed: ${msg}`);
}

/**
 * Coerce NumberLike to real numbers, supporting Infinity and numeric strings.
 */
function coerceNumberLike(v: unknown): number {
    if (typeof v === "number") return v;
    if (v === "Infinity" || v === Infinity) return Number.POSITIVE_INFINITY;
    if (v === "-Infinity" || v === -Infinity) return Number.NEGATIVE_INFINITY;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize a validated pack:
 *  - ensure schema.inventory.slotTypes exists when legacy schema.itemSlots is provided
 *  - coerce tagCaps/tagBonuses NumberLike values to numbers
 *  - ensure stacking defaults exist: caps.default="min", bonuses.default="sum"
 */
export function normalizePack(pack: ValidPack): ValidPack {
    // 1) back-compat for slotTypes
    const schemaAny: any = pack.schema ?? {};
    const inv: any = schemaAny.inventory ?? {};
    if (!inv.slotTypes && Array.isArray(schemaAny.itemSlots)) {
        inv.slotTypes = schemaAny.itemSlots;
        schemaAny.inventory = inv;
    }
    pack.schema = schemaAny;

    // 2) coerce tagCaps/tagBonuses values to numbers
    const rulesAny: any = pack.rules ?? {};
    for (const groupKey of ["tagCaps", "tagBonuses"] as const) {
        const group = rulesAny[groupKey];
        if (group && typeof group === "object") {
            for (const tag of Object.keys(group)) {
                const table = group[tag];
                if (table && typeof table === "object") {
                    for (const k of Object.keys(table)) {
                        table[k] = coerceNumberLike(table[k]);
                    }
                }
            }
        }
    }

    // 3) stacking defaults
    rulesAny.stacking = rulesAny.stacking || {};
    rulesAny.stacking.caps = rulesAny.stacking.caps || { default: "min" };
    rulesAny.stacking.bonuses = rulesAny.stacking.bonuses || { default: "sum" };
    pack.rules = rulesAny;

    return pack;
}
