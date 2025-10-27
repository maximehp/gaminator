/* Expression utilities: interpolation {{ ... }} and evaluator binding */

import type { ExprString } from "./types";

export type EvalCtx = {
    evaluate: (expr: string, locals?: Record<string, unknown>) => unknown;
    locals: Record<string, unknown>;
};

const INTERP = /\{\{\s*([^}]+)\s*\}\}/g;

export function interpolate(expr: ExprString, ctx: EvalCtx): string {
    if (!expr) return "";
    return expr.replace(INTERP, (_, inner) => {
        try {
            const val = ctx.evaluate(String(inner), ctx.locals);
            return val == null ? "" : String(val);
        } catch {
            return "";
        }
    });
}

export function evaluateNumber(expr: ExprString, ctx: EvalCtx): number {
    try {
        const v = ctx.evaluate(expr, ctx.locals);
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

export function evaluateBoolean(expr: ExprString, ctx: EvalCtx): boolean {
    try {
        const v = ctx.evaluate(expr, ctx.locals);
        return Boolean(v);
    } catch {
        return false;
    }
}

export function evaluateAny<T = unknown>(expr: ExprString, ctx: EvalCtx): T | undefined {
    try {
        return ctx.evaluate(expr, ctx.locals) as T;
    } catch {
        return undefined;
    }
}
