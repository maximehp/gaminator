// src/domain/character/characterActions.test.ts
import { describe, it, expect } from "vitest";
import { createCharacter, type LoadedPack } from "./characterFactory";
import { createPackEvaluator } from "./characterEvaluator";
import { summarizeEquipmentVars, equip, addItemToInventory, recompute } from "./characterActions";

const pack: LoadedPack = {
    metadata: { id: "sys" },
    schema: {
        attributes: [{ id: "dex", default: 16, min: 1, max: 30 }],
        resources: [],
        derived: [
            { id: "dex_mod", formula: "mod(attr.dex)" },
            { id: "ac", formula: "10 + cap(dex_mod, 'ac.dex') + bonus('ac.shield')" }
        ],
        inventory: {
            mode: "weight_limit",
            maxSlots: 36,
            weightLimitFormula: "0",
            slotTypes: [
                { id: "armor", label: "Armor", maxEquipped: 1 },
                { id: "off_hand", label: "Off Hand", maxEquipped: 1 }
            ]
        }
    },
    rules: {
        tagCaps: {
            armor_heavy: { "ac.dex": 0 },
            armor_medium: { "ac.dex": 2 },
            armor_light: { "ac.dex": Infinity }
        },
        tagBonuses: { shield: { "ac.shield": 2 } },
        stacking: { caps: { default: "min" }, bonuses: { default: "sum", "ac.shield": "max" } }
    }
} as any;

describe("characterActions aggregation", () => {
    const evaluator = createPackEvaluator(pack as any);

    it("derives caps and bonuses from tag rules", () => {
        const c = createCharacter(pack, evaluator, {});
        addItemToInventory(c, {
            instanceId: "arm1",
            contentId: "chain_mail",
            label: "Chain Mail",
            slot: "armor",
            tags: ["armor_heavy"],
            weight: 55
        });
        addItemToInventory(c, {
            instanceId: "shield1",
            contentId: "shield",
            label: "Shield",
            slot: "off_hand",
            tags: ["shield"],
            weight: 6
        });
        equip(c, pack, evaluator, "arm1", "armor");
        equip(c, pack, evaluator, "shield1", "off_hand");

        const vars = summarizeEquipmentVars(c, pack) as any;
        expect(vars.caps["ac.dex"]).toBe(0);
        expect(vars.bonuses["ac.shield"]).toBe(2);

        const after = recompute(c, pack, evaluator);
        expect(after.derived.ac).toBe(12); // 10 + min(+3,0) + 2
    });

    it("uses explicit item metadata over tag defaults", () => {
        const c = createCharacter(pack, evaluator, {});
        addItemToInventory(c, {
            instanceId: "arm2",
            contentId: "weird_armor",
            label: "Weird Armor",
            slot: "armor",
            tags: ["armor_medium"],
            weight: 10,
            // @ts-ignore allow dynamic fields in test
            caps: { "ac.dex": 1 }
        });
        equip(c, pack, evaluator, "arm2", "armor");
        const vars = summarizeEquipmentVars(c, pack) as any;
        expect(vars.caps["ac.dex"]).toBe(1);
    });
});
