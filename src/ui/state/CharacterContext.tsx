import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { LoadedPack } from "../../engine/packLoader";
import { recalcCharacter } from "../../domain/character/characterFactory";
import {
    setAttribute,
    setLevel,
    setResourceCurrent,
    longRest,
    shortRest,
    summarizeEquipmentVars
} from "../../domain/character/characterActions";
import type { Character } from "../../domain/character/types";

type Evaluator = {
    evaluate: (expr: string, ctx: Record<string, unknown>) => unknown;
};

type CharacterCtx = {
    pack: LoadedPack;
    character: Character;
    evaluator: Evaluator;
    updateCharacter: (next: Character) => void;
    actions: {
        setAttribute: (key: string, value: number) => void;
        setResource: (key: string, value: number) => void;
        setLevel: (value: number) => void;
        shortRest: () => void;
        longRest: () => void;
        recompute: () => void;
        roll: (expr: string) => unknown;
        toggleVar: (key: string) => void;
    };
    vars: Record<string, unknown>;
    setVar: (key: string, value: unknown) => void;
};

const Ctx = createContext<CharacterCtx | null>(null);

export function CharacterProvider(props: {
    pack: LoadedPack;
    evaluator: Evaluator;
    initialCharacter: Character;
    children: React.ReactNode;
}) {
    const [character, setCharacter] = useState<Character>(props.initialCharacter);
    const [vars, setVars] = useState<Record<string, unknown>>({});

    const updateCharacter = useCallback((next: Character) => {
        setCharacter(next);
    }, []);

    const equipmentVars = useMemo(() => summarizeEquipmentVars(character, props.pack), [character, props.pack]);

    const recompute = useCallback(() => {
        const mergedVars = { ...equipmentVars, ...vars };
        const next = recalcCharacter(character, props.pack, props.evaluator, mergedVars);
        setCharacter(next);
    }, [character, equipmentVars, vars, props.pack, props.evaluator]);

    const setVar = useCallback((key: string, value: unknown) => {
        setVars(v => ({ ...v, [key]: value }));
    }, []);

    const actions = useMemo(() => {
        return {
            setAttribute: (key: string, value: number) => {
                const next = setAttribute(character, key, value);
                setCharacter(next);
                recompute();
            },
            setResource: (key: string, value: number) => {
                const next = setResourceCurrent(character, key, value);
                setCharacter(next);
                recompute();
            },
            setLevel: (value: number) => {
                const next = setLevel(character, value);
                setCharacter(next);
                recompute();
            },
            shortRest: () => {
                const next = shortRest(character);
                setCharacter(next);
                recompute();
            },
            longRest: () => {
                const next = longRest(character);
                setCharacter(next);
                recompute();
            },
            recompute: () => {
                recompute();
            },
            roll: (expr: string) => {
                // eval roll via evaluator so packs can call roll("2d6+1")
                return props.evaluator.evaluate(expr, { ...character, vars: { ...equipmentVars, ...vars } });
            },
            toggleVar: (key: string) => {
                setVars(v => {
                    const nv = { ...v, [key]: !v[key] };
                    return nv;
                });
                recompute();
            }
        };
    }, [character, recompute, props.evaluator, equipmentVars, vars]);

    const value: CharacterCtx = {
        pack: props.pack,
        character,
        evaluator: props.evaluator,
        updateCharacter,
        actions,
        vars: { ...equipmentVars, ...vars },
        setVar
    };

    return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useCharacter() {
    const v = useContext(Ctx);
    if (!v) throw new Error("CharacterContext missing");
    return v;
}
