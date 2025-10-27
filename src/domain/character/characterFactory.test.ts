// src/domain/character/characterEvaluator.test.ts
import { describe, it, expect } from "vitest";
import { createPackEvaluator } from "./characterEvaluator";

describe("createPackEvaluator", () => {
    const pack = {
        rules: {
            lookups: {
                prof_by_level: { "1": 2, "5": 3, "9": 4 }
            }
        }
    };

    const evaluator = createPackEvaluator(pack);

    it("evaluates arithmetic and mod()", () => {
        const out = evaluator.evaluate("mod(attr.str) + mod(attr.dex)", {
            level: 1,
            attr: { str: 16, dex: 14 },
            res: {},
            prof: {},
            derived: {},
            vars: {}
        });
        expect(out).toBe(5);
    });

    it("reads lookup() with nearest-lower fallback", () => {
        const v1 = evaluator.evaluate("lookup('prof_by_level', level)", {
            level: 1, attr: {}, res: {}, prof: {}, derived: {}, vars: {}
        });
        const v2 = evaluator.evaluate("lookup('prof_by_level', level)", {
            level: 7, attr: {}, res: {}, prof: {}, derived: {}, vars: {}
        });
        expect(v1).toBe(2);
        expect(v2).toBe(3);
    });

    it("applies cap() and bonus() from vars", () => {
        const out = evaluator.evaluate("cap(5, 'ac.dex') + bonus('ac.shield')", {
            level: 1,
            attr: {},
            res: {},
            prof: {},
            derived: {},
            vars: { caps: { "ac.dex": 2 }, bonuses: { "ac.shield": 1 } }
        });
        expect(out).toBe(3);
    });

    it("treats missing caps as Infinity and bonuses as 0", () => {
        const out = evaluator.evaluate("cap(7, 'nope') + bonus('nope')", {
            level: 1, attr: {}, res: {}, prof: {}, derived: {}, vars: {}
        });
        expect(out).toBe(7);
    });
});
