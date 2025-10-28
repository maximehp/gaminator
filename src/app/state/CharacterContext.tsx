import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { ValidPack } from "../../engine/packValidate";
import { recalcCharacter, type Character } from "../../domain/character/characterFactory";
import * as DomainActions from "../../domain/character/characterActions";
import type { EvalContext, Evaluator } from "../../domain/character/characterEvaluator";
import { summarizeEquipmentVars } from "../../domain/character/characterActions";

export type UIAction =
    | { id: string; kind: "domain"; fn: string; args?: unknown[] }   // any domain fn name, pack-chosen
    | { id: string; kind: "recompute" }
    | { id: string; kind: "roll"; expr: string }
    | { id: string; kind: "toggleVar"; key: string }
    | { id: string; kind: "script"; expr: string };

export type ActionRegistry = Map<string, UIAction>;

type CharacterCtx = {
    pack: ValidPack;
    character: Character;
    evaluator: Evaluator;
    uiActions: ActionRegistry;
    updateCharacter: (next: Character) => void;

    dispatch: (id: string, params?: Record<string, unknown>) => unknown;

    // light, generic conveniences (not system-specific)
    actions: {
        recompute: () => void;
        roll: (expr: string) => unknown;
        toggleVar: (key: string) => void;
    };

    vars: Record<string, unknown>;
    setVar: (key: string, value: unknown) => void;
};

const Ctx = createContext<CharacterCtx | null>(null);

export function CharacterProvider(props: {
    pack: ValidPack;
    evaluator: Evaluator;
    initialCharacter: Character;
    uiActions?: ActionRegistry;
    children: React.ReactNode;
}) {
    const { pack, evaluator } = props;

    const [character, setCharacter] = useState<Character>(props.initialCharacter);
    const [vars, setVars] = useState<Record<string, unknown>>({});

    const equipmentVars = useMemo(() => summarizeEquipmentVars(character, pack), [character, pack]);

    const mergedVars = useMemo(() => ({ ...equipmentVars, ...vars }), [equipmentVars, vars]);

    const updateCharacter = useCallback((next: Character) => {
        setCharacter(next);
    }, []);

    const recompute = useCallback(() => {
        const next = recalcCharacter(character, pack, evaluator, mergedVars);
        setCharacter(next);
    }, [character, pack, evaluator, mergedVars]);

    const setVar = useCallback((key: string, value: unknown) => {
        setVars(v => ({ ...v, [key]: value }));
    }, []);

    // empty registry by default; packs define everything in actions.yaml
    const uiActions = useMemo<ActionRegistry>(() => props.uiActions ?? new Map(), [props.uiActions]);

    const buildScope = useCallback((): EvalContext => {
        return {
            level: character.level,
            attr: character.attr,
            res: character.res,
            prof: character.prof,
            derived: character.derived,
            vars: mergedVars
        };
    }, [character, mergedVars]);

    // Dynamic bridge to ANY exported domain action with the signature
    // (character, pack, evaluator, ...args) => Character
    const domainApi = useMemo(() => {
        const api: Record<string, (...args: any[]) => Character> = {};
        for (const [name, fn] of Object.entries(DomainActions)) {
            if (typeof fn !== "function") continue;
            api[name] = (...args: any[]) => (fn as any)(character, pack, evaluator, ...args);
        }
        return api;
    }, [character, pack, evaluator]);

    const dispatch = useCallback((id: string, params?: Record<string, unknown>) => {
        const spec = uiActions.get(id);
        if (!spec) return;

        switch (spec.kind) {
            case "domain": {
                const fn = domainApi[spec.fn];
                if (!fn) return;

                let next: Character | undefined;

                if (Array.isArray(spec.args)) {
                    const scope = buildScope();
                    const resolved = spec.args.map(a => resolveArg(a, evaluator, scope, params));
                    next = fn(...resolved);
                } else {
                    // no implied fallback; packs must provide args via actions.yaml
                    return;
                }

                if (next) setCharacter(next);
                return;
            }

            case "recompute": {
                recompute();
                return;
            }

            case "roll": {
                return evaluator.evaluate(String(spec.expr || ""), buildScope());
            }

            case "toggleVar": {
                if (!spec.key) return;
                setVars(v => ({ ...v, [spec.key]: !v[spec.key] }));
                return;
            }

            case "script": {
                return evaluator.evaluate(String(spec.expr || ""), buildScope());
            }
        }
    }, [uiActions, domainApi, evaluator, buildScope, recompute, setVars]);

    const actions = useMemo(() => {
        return {
            recompute: () => dispatch("recompute"),
            roll: (expr: string) => evaluator.evaluate(expr, buildScope()),
            toggleVar: (key: string) => setVars(v => ({ ...v, [key]: !v[key] }))
        };
    }, [dispatch, evaluator, buildScope]);

    const value: CharacterCtx = {
        pack,
        character,
        evaluator,
        uiActions,
        updateCharacter,
        dispatch,
        actions,
        vars: mergedVars,
        setVar
    };

    return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useCharacter() {
    const v = useContext(Ctx);
    if (!v) throw new Error("CharacterContext missing");
    return v;
}

function resolveArg(
    raw: unknown,
    evaluator: Evaluator,
    scope: EvalContext,
    params?: Record<string, unknown>
): unknown {
    if (typeof raw === "string") {
        const s = raw.trim();
        if (s.startsWith("{{") && s.endsWith("}}")) {
            const inner = s.slice(2, -2).trim();
            return evaluator.evaluate(inner, scope);
        }
        if (s.startsWith("$param.") && params) {
            const key = s.slice("$param.".length);
            return (params as any)[key];
        }
        return raw;
    }
    return raw;
}
