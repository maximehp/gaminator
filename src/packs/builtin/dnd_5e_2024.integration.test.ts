import { describe, it, expect } from "vitest";
// @ts-ignore
import fs from "node:fs/promises";
// @ts-ignore
import path from "node:path";
import YAML from "yaml";

import { validatePack, normalizePack } from "../../engine/packValidate";
import { createPackEvaluator } from "../../domain/character/characterEvaluator";
import { createCharacter } from "../../domain/character/characterFactory";
import { summarizeEquipmentVars, recompute } from "../../domain/character/characterActions";

function projectPath(...p: string[]) {
    // @ts-ignore
    return path.resolve(process.cwd(), ...p);
}

describe("dnd_5e_2024 pack integration", async () => {
    const rootYaml = await fs.readFile(
        projectPath("src/packs/builtin/dnd_5e_2024.yaml"),
        "utf8"
    );
    // parse and validate
    const raw = YAML.parse(rootYaml) || {};
    // inject minimal lookups so evaluator can compute proficiency if needed
    raw.rules = raw.rules || {};
    raw.rules.lookups = raw.rules.lookups || {};
    raw.rules.lookups.prof_by_level = raw.rules.lookups.prof_by_level || { "1": 2 };

    const validated = validatePack(raw);
    const pack = normalizePack(validated);

    const evaluator = createPackEvaluator(pack as any);

    it("creates a character and evaluates derived values", () => {
        const c = createCharacter(
            pack as any,
            evaluator,
            { seedAttributes: { str: 16, dex: 14, con: 12 }, vars: { base_hp: 10 } }
        );

        // basic sanity
        expect(c.systemId).toBe("dnd_5e_2024");
        expect(c.attr["str"]).toBe(16);
        expect(c.attr["dex"]).toBe(14);
        expect(c.attr["con"]).toBe(12);
        expect(c.attr["str"] ?? 0).toBe(16);

        // carry capacity formula in YAML: attr.str * 15
        const carry = c.derived["carry_capacity"];
        expect(carry).toBe(16 * 15);

        // now simulate armor + shield via action summarizer
        // add fake items with tags to drive caps/bonuses
        c.inventory.items.push({ instanceId: "arm", contentId: "chain", label: "Chain", slot: "armor", tags: ["armor_heavy"] });
        c.inventory.items.push({ instanceId: "sh", contentId: "shield", label: "Shield", slot: "off_hand", tags: ["shield"] });
        c.slots["armor"] = { max: 1, equipped: ["arm"] };
        c.slots["off_hand"] = { max: 1, equipped: ["sh"] };

        const vars = summarizeEquipmentVars(c, pack as any) as any;
        expect(vars.caps["ac.dex"]).toBe(0);
        expect(vars.bonuses["ac.shield"]).toBe(2);

        const after = recompute(c, pack as any, evaluator);
        // dex 14 -> +2, capped to 0 by heavy armor; +2 shield; base 10
        expect(after.derived["armor_class"]).toBe(12);
    });
});
