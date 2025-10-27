// src/domain/character/characterActions.ts

import type { Character, LoadedPack } from "./characterFactory";
import { recalcCharacter } from "./characterFactory";
import type { Evaluator } from "./characterEvaluator";

// -------------------------
// Small helpers and types
// -------------------------

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function findItemByInstance(character: Character, instanceId: string) {
    return character.inventory.items.find(i => i.instanceId === instanceId) || null;
}

type StackingMode = "min" | "max" | "sum";

function mergeCap(existing: number | undefined, incoming: number, mode: StackingMode): number {
    const inc = Number(incoming);
    if (!Number.isFinite(inc)) return existing ?? Infinity;
    if (existing === undefined) return inc;
    switch (mode) {
        case "min": return Math.min(existing, inc);
        case "max": return Math.max(existing, inc);
        case "sum": return existing + inc;
    }
}

function mergeBonus(existing: number | undefined, incoming: number, mode: StackingMode): number {
    const inc = Number(incoming);
    if (!Number.isFinite(inc)) return existing ?? 0;
    if (existing === undefined) return inc;
    switch (mode) {
        case "sum": return existing + inc;
        case "max": return Math.max(existing, inc);
        case "min": return Math.min(existing, inc);
    }
}

/**
 * Resolve stacking policy for a given key from the pack.
 * Falls back to defaults:
 *   caps.default = "min"
 *   bonuses.default = "sum"
 */
function getStackingMode(pack: LoadedPack, group: "caps" | "bonuses", key: string): StackingMode {
    const rules: any = pack.rules || {};
    const stacking: any = rules.stacking || {};
    const table: Record<string, string> = stacking[group] || {};
    const perKey = table[key] as StackingMode | undefined;
    const def = (table.default as StackingMode | undefined)
        ?? (group === "caps" ? "min" : "sum");
    return perKey ?? def;
}

/**
 * Collect instance ids for currently equipped items.
 */
function getEquippedIds(character: Character): Set<string> {
    const ids = new Set<string>();
    for (const slot of Object.values(character.slots)) {
        for (const inst of slot.equipped) if (inst) ids.add(inst);
    }
    return ids;
}

/**
 * Merge a mapping of key->number into target using the appropriate policy.
 */
function mergeKeyedNumbers(
    target: Record<string, number>,
    incoming: Record<string, number>,
    policyFor: (key: string) => StackingMode,
    isCap: boolean
) {
    for (const [k, v] of Object.entries(incoming)) {
        if (!Number.isFinite(Number(v))) continue;
        const mode = policyFor(k);
        if (isCap) {
            target[k] = mergeCap(target[k], Number(v), mode);
        } else {
            target[k] = mergeBonus(target[k], Number(v), mode);
        }
    }
}

/**
 * Summarize currently equipped gear into generic vars the evaluator understands:
 *   { caps: { "<key>": number }, bonuses: { "<key>": number } }
 *
 * Sources of truth, in precedence order:
 *   1) Per-item metadata on equipped items: item.caps, item.bonuses
 *   2) Tag-based rules defined by the pack: rules.tagCaps[tag], rules.tagBonuses[tag]
 *
 * Stacking behavior:
 *   - For caps: default "min" across sources (configurable per key under rules.stacking.caps)
 *   - For bonuses: default "sum" across sources (configurable per key under rules.stacking.bonuses)
 */
export function summarizeEquipmentVars(character: Character, pack: LoadedPack): Record<string, unknown> {
    const caps: Record<string, number> = {};
    const bonuses: Record<string, number> = {};

    const equippedIds = getEquippedIds(character);

    // Optional pack-level tag tables
    const tagCaps = (pack.rules as any)?.tagCaps as Record<string, Record<string, number>> | undefined;
    const tagBonuses = (pack.rules as any)?.tagBonuses as Record<string, Record<string, number>> | undefined;

    for (const it of character.inventory.items) {
        if (!equippedIds.has(it.instanceId)) continue;

        // 1) Per-item explicit metadata takes precedence
        const itemCaps = (it as any).caps as Record<string, number> | undefined;
        if (itemCaps) {
            mergeKeyedNumbers(
                caps,
                itemCaps,
                (key) => getStackingMode(pack, "caps", key),
                true
            );
        }

        const itemBonuses = (it as any).bonuses as Record<string, number> | undefined;
        if (itemBonuses) {
            mergeKeyedNumbers(
                bonuses,
                itemBonuses,
                (key) => getStackingMode(pack, "bonuses", key),
                false
            );
        }

        // 2) Tag-driven rules from the pack (optional, for convenience)
        const tags = it.tags || [];
        if (tagCaps && tags.length) {
            for (const tag of tags) {
                const rule = tagCaps[tag];
                if (rule) {
                    mergeKeyedNumbers(
                        caps,
                        rule,
                        (key) => getStackingMode(pack, "caps", key),
                        true
                    );
                }
            }
        }
        if (tagBonuses && tags.length) {
            for (const tag of tags) {
                const rule = tagBonuses[tag];
                if (rule) {
                    mergeKeyedNumbers(
                        bonuses,
                        rule,
                        (key) => getStackingMode(pack, "bonuses", key),
                        false
                    );
                }
            }
        }
    }

    return { caps, bonuses };
}

/**
 * Recompute all formula-driven values using the pack and evaluator.
 * This is the one function to call after any meaningful mutation.
 */
export function recompute(character: Character, pack: LoadedPack, evaluator: Evaluator): Character {
    const vars = summarizeEquipmentVars(character, pack);
    return recalcCharacter(character, pack, evaluator, vars);
}

// --------------------
// Attribute operations
// --------------------

export function setAttribute(character: Character, pack: LoadedPack, evaluator: Evaluator, id: string, value: number): Character {
    if (!(id in character.attr)) return character;
    character.attr[id] = value;
    return recompute(character, pack, evaluator);
}

export function deltaAttribute(character: Character, pack: LoadedPack, evaluator: Evaluator, id: string, delta: number): Character {
    if (!(id in character.attr)) return character;
    character.attr[id] = character.attr[id] + delta;
    return recompute(character, pack, evaluator);
}

// -------------------
// Level and XP hooks
// -------------------

export function setLevel(character: Character, pack: LoadedPack, evaluator: Evaluator, level: number): Character {
    character.level = Math.max(1, Math.floor(level));
    return recompute(character, pack, evaluator);
}

export function addLevels(character: Character, pack: LoadedPack, evaluator: Evaluator, delta: number): Character {
    return setLevel(character, pack, evaluator, character.level + delta);
}

// ------------------
// Resource handling
// ------------------

export function setResourceCurrent(character: Character, pack: LoadedPack, evaluator: Evaluator, id: string, value: number): Character {
    const r = character.res[id];
    if (!r) return character;
    character.res[id].current = clamp(value, 0, r.max);
    return recompute(character, pack, evaluator);
}

export function damage(character: Character, pack: LoadedPack, evaluator: Evaluator, resourceId: string, amount: number): Character {
    const r = character.res[resourceId];
    if (!r) return character;
    character.res[resourceId].current = clamp(r.current - Math.max(0, amount), 0, r.max);
    return recompute(character, pack, evaluator);
}

export function heal(character: Character, pack: LoadedPack, evaluator: Evaluator, resourceId: string, amount: number): Character {
    const r = character.res[resourceId];
    if (!r) return character;
    character.res[resourceId].current = clamp(r.current + Math.max(0, amount), 0, r.max);
    return recompute(character, pack, evaluator);
}

export function spend(character: Character, pack: LoadedPack, evaluator: Evaluator, resourceId: string, amount: number): Character {
    return damage(character, pack, evaluator, resourceId, amount);
}

export function gain(character: Character, pack: LoadedPack, evaluator: Evaluator, resourceId: string, amount: number): Character {
    return heal(character, pack, evaluator, resourceId, amount);
}

// -------------
// Rest actions
// -------------

export function longRest(character: Character, pack: LoadedPack, evaluator: Evaluator): Character {
    for (const id of Object.keys(character.res)) {
        character.res[id].current = character.res[id].max;
    }
    return recompute(character, pack, evaluator);
}

export function shortRest(character: Character, pack: LoadedPack, evaluator: Evaluator): Character {
    return recompute(character, pack, evaluator);
}

// ---------------------
// Inventory and equip
// ---------------------

export function addItemToInventory(character: Character, item: Character["inventory"]["items"][number]): void {
    character.inventory.items.push(item);
    character.inventory.carriedWeight = character.inventory.items.reduce((s, it) => s + Math.max(0, it.weight ?? 0), 0);
}

export function equip(character: Character, pack: LoadedPack, evaluator: Evaluator, instanceId: string, slotId: string): Character {
    const item = findItemByInstance(character, instanceId);
    if (!item) return character;
    const slot = character.slots[slotId];
    if (!slot) return character;

    const idx = slot.equipped.findIndex(e => e === null);
    if (idx === -1) return character;

    slot.equipped[idx] = instanceId;
    return recompute(character, pack, evaluator);
}

export function unequip(character: Character, pack: LoadedPack, evaluator: Evaluator, instanceId: string): Character {
    for (const slotId of Object.keys(character.slots)) {
        const slot = character.slots[slotId];
        for (let i = 0; i < slot.equipped.length; i++) {
            if (slot.equipped[i] === instanceId) {
                slot.equipped[i] = null;
            }
        }
    }
    return recompute(character, pack, evaluator);
}
