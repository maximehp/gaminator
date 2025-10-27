// src/engine/packLoader.ts
import YAML from "yaml";
import { validatePack, normalizePack, type ValidPack } from "./packValidate";

type AnyObj = Record<string, any>;

// Vite bundles these YAML files at build time and gives us the raw text.
const ALL_YAML: Record<string, string> = import.meta.glob(
    "/src/packs/builtin/**/*.{yaml,yml}",
    { as: "raw", eager: true }
) as Record<string, string>;

function deepMerge(target: AnyObj, source: AnyObj): AnyObj {
    for (const key of Object.keys(source)) {
        const sv = source[key];
        if (Array.isArray(sv)) {
            target[key] = (target[key] || []).concat(sv);
        } else if (sv && typeof sv === "object") {
            target[key] = deepMerge(target[key] || {}, sv);
        } else {
            target[key] = sv;
        }
    }
    return target;
}

/**
 * Load a builtin pack by id (e.g., "dnd_5e_2024").
 * Reads:
 *   /src/packs/builtin/<id>.yaml
 *   /src/packs/builtin/<id>/content/*.yaml
 *   /src/packs/builtin/<id>/lookups/*.yaml
 * Validates and normalizes the merged result.
 */
export async function loadPack(id: string): Promise<ValidPack> {
    const rulesPath = `/src/packs/builtin/${id}.yaml`;
    const folderPrefix = `/src/packs/builtin/${id}/`;

    const rulesText = ALL_YAML[rulesPath];
    if (!rulesText) throw new Error(`Pack rules file not found: ${rulesPath}`);

    // 1) Parse the root YAML
    const packRaw: AnyObj = YAML.parse(rulesText) || {};

    // Ensure expected containers exist before merging children
    if (!packRaw.content) packRaw.content = {};
    if (!packRaw.rules) packRaw.rules = {};
    if (!packRaw.rules.lookups) packRaw.rules.lookups = {};

    // 2) Merge content/*.yaml
    for (const p in ALL_YAML) {
        if (p.startsWith(folderPrefix + "content/")) {
            const data = YAML.parse(ALL_YAML[p]) || {};
            deepMerge(packRaw.content, data);
        }
    }

    // 3) Merge lookups/*.yaml into rules.lookups
    for (const p in ALL_YAML) {
        if (p.startsWith(folderPrefix + "lookups/")) {
            const data = YAML.parse(ALL_YAML[p]) || {};
            deepMerge(packRaw.rules.lookups, data);
        }
    }

    // 4) Validate structure
    let validated: ValidPack;
    try {
        validated = validatePack(packRaw);
    } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Validation failed for pack "${id}": ${msg}`);
    }

    // 5) Normalize for engine convenience (slotTypes back-compat, number coercion, stacking defaults)
    const pack = normalizePack(validated);

    return pack;
}
