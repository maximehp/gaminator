// src/domain/character/characterEvaluator.ts

import { Parser } from "expr-eval";
import { DiceRoller } from "@dice-roller/rpg-dice-roller";

let _varsRef: any = null;

export interface EvalContext {
    level: number;
    attr: Record<string, number>;
    res: Record<string, { current: number; max: number }>;
    prof: Record<string, string>;
    derived: Record<string, number>;
    vars?: Record<string, any>;
}

export interface LoadedPackLike {
    rules?: { lookups?: Record<string, Record<string, number>> };
    content?: { lookups?: Record<string, Record<string, number>> };
}

/**
 * Minimal LRU (no external types) to cache compiled expressions.
 */
class TinyLRU<V> {
    private readonly cap: number;
    private readonly map = new Map<string, V>();
    constructor(capacity = 256) { this.cap = Math.max(8, capacity); }
    get(k: string): V | undefined {
        const hit = this.map.get(k);
        if (hit !== undefined) {
            this.map.delete(k);
            this.map.set(k, hit);
        }
        return hit;
    }
    set(k: string, v: V): void {
        if (this.map.has(k)) this.map.delete(k);
        this.map.set(k, v);
        if (this.map.size > this.cap) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) this.map.delete(oldest);
        }
    }
}

/**
 * expr-eval setup. We cache compiled expression objects and call .evaluate(scope).
 * We purposely avoid importing the library’s Expression type to dodge versioned type mismatches.
 */
type CompiledExpr = { evaluate: (scope: any) => unknown };

const parser = new Parser();
const cache = new TinyLRU<CompiledExpr>(256);
const dice = new DiceRoller();

function compile(expr: string): CompiledExpr {
    const key = expr.trim();
    const hit = cache.get(key);
    if (hit) return hit;
    const compiled = parser.parse(key) as unknown as CompiledExpr;
    cache.set(key, compiled);
    return compiled;
}

export function createPackEvaluator(pack: LoadedPackLike) {
    const tables: Record<string, Record<string, number>> = {
        ...(pack.rules?.lookups ?? {}),
        ...(pack.content?.lookups ?? {})
    };

    function lookup(table: string, key: unknown): number {
        const t = tables[table];
        if (!t) return 0;
        const k = String(key);
        if (k in t) return Number(t[k]) || 0;

        const n = Number(k);
        if (!Number.isNaN(n)) {
            let best = -Infinity;
            let val = 0;
            for (const tk of Object.keys(t)) {
                const tn = Number(tk);
                if (!Number.isNaN(tn) && tn <= n && tn > best) {
                    best = tn;
                    val = Number(t[tk]) || 0;
                }
            }
            return val;
        }
        return 0;
    }

    function roll(notation: string): number {
        try {
            const r: any = dice.roll(notation);
            const total = Number((r && (r.total ?? r.value)) ?? 0);
            return Number.isFinite(total) ? total : 0;
        } catch {
            return 0;
        }
    }

    function mod(score: number): number {
        if (typeof score !== "number") return 0;
        return Math.floor((score - 10) / 2);
    }

    function take_higher_of(a: number, b: number): number {
        return Math.max(Number(a) || 0, Number(b) || 0);
    }

    function take_lower_of(a: number, b: number): number {
        return Math.min(Number(a) || 0, Number(b) || 0);
    }


    function cap_value(key: string): number {
        const v = _varsRef?.caps?.[key];
        if (v === undefined) return Number.POSITIVE_INFINITY; // no cap by default
        if (v === Infinity) return Number.POSITIVE_INFINITY;
        const n = Number(v);
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    }

    function cap(value: number, key: string): number {
        const v = Number(value) || 0;
        const c = cap_value(key);
        return Math.min(v, c);
    }

    function bonus(key: string): number {
        const v = _varsRef?.bonuses?.[key];
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }


    return {
        evaluate(expr: string, ctx: EvalContext): number {
            if (!expr || typeof expr !== "string") return 0;

            const scope = {
                level: ctx.level,
                attr: ctx.attr,
                res: ctx.res,
                prof: ctx.prof,
                derived: ctx.derived,
                vars: { base_hp: 0, ...(ctx.vars ?? {}) },

                floor: Math.floor,
                ceil: Math.ceil,
                round: Math.round,
                min: Math.min,
                max: Math.max,
                clamp: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),

                mod,
                lookup,
                roll,
                take_higher_of,
                take_lower_of,

                cap,
                cap_value,
                bonus
            };

            try {
                const fn = compile(expr);
                _varsRef = scope.vars;
                const out = fn.evaluate(scope);
                _varsRef = null;
                return Number.isFinite(out as number) ? Number(out) : 0;
            } catch {
                _varsRef = null;
                return 0;
            }
        }
    };
}

export type Evaluator = ReturnType<typeof createPackEvaluator>;
