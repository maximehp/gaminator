// src/domain/character/characterFactory.ts

import merge from "lodash.merge";
import { nanoid } from "nanoid";
import type { Evaluator } from "./characterEvaluator";

type AnyObj = Record<string, any>;

/**
 * Interfaces that mirror the pack surface used by the factory.
 * Kept permissive to avoid churn when packs grow.
 */
export interface PackSchemaAttribute {
    id: string;
    label?: string;
    description?: string;
    min?: number;
    max?: number;
    default?: number;
}

export interface PackSchemaResource {
    id: string;
    label?: string;
    description?: string;
    defaultMaxFormula?: string;
    die?: string;
}

export interface PackSchemaProficiencyCategory {
    id: string;
    label?: string;
    ranks: string[];
}

export interface PackSchemaItemSlot {
    id: string;
    label?: string;
    maxEquipped: number;
}

export interface PackSchemaDerived {
    id: string;
    label?: string;
    formula: string;
}

export interface PackSchemaInventory {
    mode?: "slot_limit" | "weight_limit" | "hybrid";
    maxSlots?: number;
    weightLimitFormula?: string;
    slotTypes?: PackSchemaItemSlot[]; // aligns with your YAML
}

export interface PackSchema {
    attributes?: PackSchemaAttribute[];
    resources?: PackSchemaResource[];
    proficiencyCategories?: PackSchemaProficiencyCategory[];
    itemSlots?: PackSchemaItemSlot[]; // legacy path, kept for compatibility
    inventory?: PackSchemaInventory;  // new path per your YAML
    tags?: string[];
    derived?: PackSchemaDerived[];
    health?: AnyObj; // not used here, but allowed by your YAML
}

export interface PackMechanicsInventory {
    mode?: "slot_limit" | "weight_limit" | "hybrid";
    maxSlots?: number;
    weightLimitFormula?: string;
}

export interface PackMechanics {
    inventory?: PackMechanicsInventory; // legacy location; factory will also read schema.inventory
}

export interface PackMetadata {
    id: string;
    name?: string;
    version?: string;
    author?: string;
    license?: string;
    homepage?: string;
}

export interface LoadedPack {
    metadata?: PackMetadata;
    schema?: PackSchema;
    mechanics?: PackMechanics;  // optional legacy
    rules?: AnyObj;
    content?: AnyObj;
    uiPreset?: AnyObj;
}

/**
 * Evaluator context shape expected by characterEvaluator.evaluate
 */
export interface EvaluatorContext {
    level: number;
    attr: Record<string, number>;
    res: Record<string, { current: number; max: number }>;
    prof: Record<string, string>;
    derived: Record<string, number>;
    vars?: Record<string, number>;
}

/**
 * Character model produced by the factory. Simple for UI and actions.
 */
export interface Character {
    id: string;
    name: string;
    systemId: string;
    level: number;
    createdAt: string;
    updatedAt: string;

    attr: Record<string, number>;
    res: Record<string, { current: number; max: number }>;
    prof: Record<string, string>;
    derived: Record<string, number>;

    inventory: {
        mode: "slot_limit" | "weight_limit" | "hybrid";
        maxSlots: number;
        weightLimit: number;
        items: InventoryItem[];
        carriedWeight: number;
    };
    slots: Record<string, { max: number; equipped: (string | null)[] }>;

    tags: string[];
    notes?: string;
}

export interface InventoryItem {
    instanceId: string;
    contentId: string;
    label: string;
    weight?: number;
    tags?: string[];
    slot?: string | null;
}

export interface CreateCharacterOptions {
    name?: string;
    level?: number;
    seedAttributes?: Record<string, number>;
    seedResources?: Record<string, { current?: number; max?: number }>;
    seedProficiencies?: Record<string, string>;
    tags?: string[];
    notes?: string;
    vars?: Record<string, number>;
}

/**
 * Clamp a value inside optional bounds.
 */
function clamp(value: number, min?: number, max?: number): number {
    let v = value;
    if (typeof min === "number") v = Math.max(min, v);
    if (typeof max === "number") v = Math.min(max, v);
    return v;
}

/**
 * Build the slot containers from either schema.itemSlots or schema.inventory.slotTypes.
 */
function buildSlots(schema: PackSchema | undefined): Record<string, { max: number; equipped: (string | null)[] }> {
    const out: Record<string, { max: number; equipped: (string | null)[] }> = {};

    const fromLegacy = schema?.itemSlots ?? [];
    const fromInventory = schema?.inventory?.slotTypes ?? [];

    const all = [...fromLegacy, ...fromInventory];

    for (const s of all) {
        const m = Math.max(1, s.maxEquipped ?? 1);
        out[s.id] = { max: m, equipped: Array.from({ length: m }, () => null) };
    }
    return out;
}

/**
 * Initialize proficiencies to first rank unless overridden by seeds.
 */
function buildProficiencies(schema: PackSchema | undefined, seeds?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of schema?.proficiencyCategories ?? []) {
        out[c.id] = seeds?.[c.id] ?? c.ranks?.[0] ?? "untrained";
    }
    if (seeds) merge(out, seeds);
    return out;
}

/**
 * Compute inventory capacity from either schema.inventory (preferred) or mechanics.inventory (legacy).
 */
function computeInventoryCaps(
    pack: LoadedPack,
    evaluator: Evaluator,
    ctx: EvaluatorContext
): { mode: "slot_limit" | "weight_limit" | "hybrid"; maxSlots: number; weightLimit: number } {
    // preferred location
    const invSchema = pack.schema?.inventory ?? {};
    // legacy fallback
    const invMech = pack.mechanics?.inventory ?? {};

    const mode = (invSchema.mode ?? invMech.mode ?? "weight_limit") as "slot_limit" | "weight_limit" | "hybrid";
    const maxSlots = typeof invSchema.maxSlots === "number"
        ? invSchema.maxSlots
        : typeof invMech.maxSlots === "number"
            ? invMech.maxSlots
            : 36;

    const weightLimitExpr = invSchema.weightLimitFormula ?? invMech.weightLimitFormula ?? "0";
    const weightLimit = Math.max(0, Math.floor(evaluator.evaluate(weightLimitExpr, ctx)));

    return { mode, maxSlots, weightLimit };
}

/**
 * Public API: build a character from a loaded pack using the shared evaluator.
 */
export function createCharacter(
    pack: LoadedPack,
    evaluator: Evaluator,
    options: CreateCharacterOptions = {}
): Character {
    if (!pack?.metadata?.id) {
        throw new Error("createCharacter: pack.metadata.id is required");
    }

    const now = new Date().toISOString();
    const level = Math.max(1, Math.floor(options.level ?? 1));

    // attributes
    const attr: Record<string, number> = {};
    for (const a of pack.schema?.attributes ?? []) {
        const base = options.seedAttributes?.[a.id] ?? a.default ?? 10;
        attr[a.id] = clamp(base, a.min, a.max);
    }
    if (options.seedAttributes) merge(attr, options.seedAttributes);

    // provisional res so resource max formulas can reference res.*
    const res: Record<string, { current: number; max: number }> = {};

    // proficiencies
    const prof = buildProficiencies(pack.schema, options.seedProficiencies);

    // context used for all formula evaluations
    const baseCtx: EvaluatorContext = { level, attr, res, prof, derived: {}, vars: options.vars ?? {} };

    // resources: evaluate max, set current
    for (const r of pack.schema?.resources ?? []) {
        const max = Math.max(0, Math.floor(evaluator.evaluate(r.defaultMaxFormula ?? "0", baseCtx)));
        const seed = options.seedResources?.[r.id];
        const finalMax = typeof seed?.max === "number" ? seed.max : max;
        const current = typeof seed?.current === "number" ? seed.current : finalMax;
        res[r.id] = { current: Math.max(0, current), max: Math.max(0, finalMax) };
    }
    if (options.seedResources) {
        // allow seeds for resources that are not declared in schema
        for (const k of Object.keys(options.seedResources)) {
            if (!(k in res)) {
                const s = options.seedResources[k];
                const m = Math.max(0, Math.floor(s.max ?? 0));
                const c = Math.max(0, Math.floor(s.current ?? m));
                res[k] = { current: c, max: m };
            }
        }
    }

    // inventory caps and slots
    const caps = computeInventoryCaps(pack, evaluator, baseCtx);
    const slots = buildSlots(pack.schema);

    // derived values
    const derived: Record<string, number> = {};
    for (const d of pack.schema?.derived ?? []) {
        const dctx: EvaluatorContext = { ...baseCtx, derived };
        const val = evaluator.evaluate(d.formula ?? "0", dctx);
        derived[d.id] = Number.isFinite(val) ? val : 0;
    }

    return {
        id: nanoid(),
        name: options.name ?? "Test Character",
        systemId: pack.metadata.id,
        level,
        createdAt: now,
        updatedAt: now,

        attr,
        res,
        prof,
        derived,

        inventory: {
            mode: caps.mode,
            maxSlots: caps.maxSlots,
            weightLimit: caps.weightLimit,
            items: [],
            carriedWeight: 0
        },
        slots,

        tags: options.tags ?? (pack.schema?.tags ?? []),
        notes: options.notes
    };
}

/**
 * Recalculate fields after mutations that affect formulas.
 */
export function recalcCharacter(
    character: Character,
    pack: LoadedPack,
    evaluator: Evaluator,
    vars?: Record<string, unknown>
): Character {
    const now = new Date().toISOString();

    const ctx: EvaluatorContext = {
        level: character.level,
        attr: character.attr,
        res: character.res,
        prof: character.prof,
        derived: character.derived,
        vars: (vars as Record<string, number>) || {}
    };

    for (const r of pack.schema?.resources ?? []) {
        const expr = r.defaultMaxFormula ?? "0";
        const newMax = Math.max(0, Math.floor(evaluator.evaluate(expr, ctx)));
        const current = Math.min(character.res[r.id]?.current ?? newMax, newMax);
        character.res[r.id] = { current, max: newMax };
    }

    const caps = computeInventoryCaps(pack, evaluator, ctx);
    character.inventory.mode = caps.mode;
    character.inventory.maxSlots = caps.maxSlots;
    character.inventory.weightLimit = caps.weightLimit;

    const derived: Record<string, number> = {};
    for (const d of pack.schema?.derived ?? []) {
        const dctx: EvaluatorContext = { ...ctx, derived };
        const val = evaluator.evaluate(d.formula ?? "0", dctx);
        derived[d.id] = Number.isFinite(val) ? val : 0;
    }
    character.derived = derived;

    character.updatedAt = now;
    return character;
}

/**
 * Add an item and optionally auto-equip if a compatible slot exists.
 */
export function addItem(
    character: Character,
    item: Omit<InventoryItem, "instanceId">,
    autoEquip = false
): string {
    const instanceId = nanoid();
    const full: InventoryItem = { instanceId, ...item };
    character.inventory.items.push(full);
    character.inventory.carriedWeight = computeCarriedWeight(character);

    if (autoEquip && item.slot) {
        const slot = character.slots[item.slot];
        if (slot) {
            const idx = slot.equipped.findIndex(e => e === null);
            if (idx >= 0) slot.equipped[idx] = instanceId;
        }
    }
    character.updatedAt = new Date().toISOString();
    return instanceId;
}

/**
 * Recompute carried weight from inventory contents.
 */
export function computeCarriedWeight(character: Character): number {
    let total = 0;
    for (const it of character.inventory.items) {
        total += Math.max(0, it.weight ?? 0);
    }
    return Math.round(total * 100) / 100;
}
