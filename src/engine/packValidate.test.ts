// src/engine/packValidate.test.ts
import { describe, it, expect } from "vitest";
import { validatePack, normalizePack } from "./packValidate";

describe("packValidate + normalizePack", () => {
    it("coerces Infinity-like values in tagCaps", () => {
        const validated = validatePack({
            metadata: { id: "rainbow" },
            schema: { attributes: [{ id: "rainbows", default: 3 }] },
            rules: {
                tagCaps: { armor_light: { "ac.dex": "Infinity" } },
                stacking: { caps: { default: "min" }, bonuses: { default: "sum" } }
            }
        });
        const normalized = normalizePack(validated);
        expect(normalized.rules?.tagCaps?.armor_light?.["ac.dex"]).toBe(Infinity);
    });

    it("copies legacy itemSlots into inventory.slotTypes", () => {
        const normalized = normalizePack(validatePack({
            metadata: { id: "legacy" },
            schema: { itemSlots: [{ id: "head", label: "Head", maxEquipped: 1 }] }
        }));
        expect(normalized.schema?.inventory?.slotTypes?.[0]?.id).toBe("head");
    });
});
