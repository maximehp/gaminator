// src/ui/PanelRenderer.tsx
import React from "react";
import type { PanelConfig, PanelElement, ListEl, ButtonEl } from "./dsl/types";
import { interpolate, evaluateNumber, evaluateBoolean, evaluateAny } from "./dsl/expr";
import { useCharacter } from "./state/CharacterContext";
import type { EvalContext } from "../domain/character/characterEvaluator";

/**
 * Build the exact EvalContext the evaluator expects.
 */
function makeEvalCtx(character: any, vars: Record<string, unknown>): EvalContext {
    return {
        level: character.level,
        attr: character.attr,
        res: character.res,
        prof: character.prof,
        derived: character.derived,
        vars
    };
}

/**
 * Interpolate a params object. Each leaf can be:
 *   - a raw value
 *   - a string with {{ expr }} to evaluate in scope
 */
function materializeParams(
    raw: Record<string, unknown> | undefined,
    evalApi: { evaluate: (expr: string, locals?: Record<string, unknown>) => unknown; locals: EvalContext }
): Record<string, unknown> | undefined {
    if (!raw) return undefined;

    const walk = (v: unknown): unknown => {
        if (typeof v === "string") {
            const s = v.trim();
            if (s.startsWith("{{") && s.endsWith("}}")) {
                const inner = s.slice(2, -2).trim();
                return evalApi.evaluate(inner);
            }
            return v;
        } else if (v && typeof v === "object" && !Array.isArray(v)) {
            const out: Record<string, unknown> = {};
            for (const [k, vv] of Object.entries(v)) out[k] = walk(vv);
            return out;
        } else if (Array.isArray(v)) {
            return v.map(walk);
        }
        return v;
    };

    return walk(raw) as Record<string, unknown>;
}

export function PanelRenderer(props: { panel: PanelConfig }) {
    const { panel } = props;
    const { character, evaluator, vars } = useCharacter();

    const evalCtx = React.useMemo(() => {
        const base = makeEvalCtx(character, vars);
        return {
            evaluate: (expr: string, locals?: Record<string, unknown>) => {
                const merged = ({ ...base, ...(locals || {}) }) as EvalContext;
                return evaluator.evaluate(expr, merged);
            },
            locals: base as unknown as Record<string, unknown>   // 👈 add this cast
        };
    }, [character, evaluator, vars]);

    return (
        <div className={panel.className}>
            {panel.title ? <h3 className="panel-title">{interpolate(panel.title, evalCtx)}</h3> : null}
            <div className="panel-body">
                {panel.elements.map((el, i) => (
                    <ElementView key={(el as any).id || i} el={el} evalCtx={evalCtx} />
                ))}
            </div>
        </div>
    );
}

function ElementView(props: { el: PanelElement; evalCtx: any }) {
    const { el, evalCtx } = props;
    const { dispatch, actions } = useCharacter();

    switch (el.kind) {
        case "text":
            return <p className={el.className}>{interpolate(el.text, evalCtx)}</p>;

        case "image":
            return (
                <img
                    className={el.className}
                    src={interpolate(el.src, evalCtx)}
                    alt={interpolate(el.alt || "", evalCtx)}
                    width={el.width}
                    height={el.height}
                />
            );

        case "value": {
            const value = interpolate(el.value, evalCtx);
            return (
                <div className={el.className}>
                    {el.label ? <label>{interpolate(el.label, evalCtx)}</label> : null}
                    <span className="value">{value}</span>
                </div>
            );
        }

        case "bar": {
            const curr = Math.max(0, evaluateNumber(el.current, evalCtx));
            const max = Math.max(1, evaluateNumber(el.max, evalCtx));
            const pct = Math.min(100, Math.round((curr / max) * 100));
            return (
                <div className={`bar ${el.className || ""}`}>
                    {el.label ? <div className="bar-label">{interpolate(el.label, evalCtx)}</div> : null}
                    <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    {el.showNumbers ? <div className="bar-numbers">{curr} / {max}</div> : null}
                </div>
            );
        }

        case "numberInput": {
            const v = evaluateNumber(el.value, evalCtx);
            const onChange = (next: number) => {
                // New generic path: onChange = { kind: "action", id: "someActionId", params?: {...} }
                const oc: any = (el as any).onChange;
                if (oc?.kind === "action" && typeof oc.id === "string") {
                    const params = materializeParams(
                        { ...(oc.params || {}), value: next },
                        evalCtx
                    );
                    dispatch(oc.id, params);
                    return;
                }

                // Legacy fallbacks for older panel DSLs
                if (oc?.action === "setAttribute" && oc.key) {
                    dispatch("setAttribute", { key: String(oc.key), value: next });
                } else if (oc?.action === "setResource" && oc.key) {
                    dispatch("setResourceCurrent", { key: String(oc.key), value: next });
                } else if (oc?.action === "setLevel") {
                    dispatch("setLevel", { value: next });
                }
            };
            return (
                <div className={el.className}>
                    {el.label ? <label htmlFor={(el as any).id}>{interpolate(el.label, evalCtx)}</label> : null}
                    <input
                        id={(el as any).id}
                        type="number"
                        value={v}
                        min={(el as any).min}
                        max={(el as any).max}
                        step={(el as any).step ?? 1}
                        onChange={e => onChange(Number(e.target.value))}
                    />
                </div>
            );
        }

        case "toggle": {
            const checked = evaluateBoolean(el.value, evalCtx);
            const onChange = () => {
                const oc: any = (el as any).onChange;

                // New generic path
                if (oc?.kind === "action" && typeof oc.id === "string") {
                    const params = materializeParams(oc.params, evalCtx);
                    dispatch(oc.id, params);
                    return;
                }

                // Generic convenience: toggleVar
                if (oc?.action === "toggleVar" && oc.key) {
                    actions.toggleVar(oc.key);
                }
            };
            return (
                <label className={`toggle ${el.className || ""}`}>
                    <input
                        id={(el as any).id}
                        type="checkbox"
                        checked={checked}
                        onChange={onChange}
                    />
                    {el.label ? <span>{interpolate(el.label, evalCtx)}</span> : null}
                </label>
            );
        }

        case "button": {
            const click = (cfg: ButtonEl["onClick"]) => {
                const c = cfg as any;

                // New generic path: onClick = { kind: "action", id, params? }
                if (c?.kind === "action" && typeof c.id === "string") {
                    const params = materializeParams(c.params, evalCtx);
                    dispatch(c.id, params);
                    return;
                }

                // Generic conveniences only
                if (c?.action === "recompute") {
                    actions.recompute();
                } else if (c?.action === "roll") {
                    actions.roll(String(c.expr ?? ""));
                } else if (c?.action === "toggleVar" && c.key) {
                    actions.toggleVar(String(c.key));
                } else if (c?.action === "setResource") {
                    const to = evaluateNumber(c.to, evalCtx);
                    dispatch("setResourceCurrent", { key: String(c.key), value: to });
                }
                // Note: no shortRest or longRest here; packs should define actions and dispatch them
            };

            return (
                <button className={el.className} onClick={() => click(el.onClick)}>
                    {interpolate(el.label, evalCtx)}
                </button>
            );
        }

        case "list":
            return <ListView el={el} evalCtx={evalCtx} />;

        default:
            return null;
    }
}

function ListView(props: { el: ListEl; evalCtx: any }) {
    const { el, evalCtx } = props;
    const rows = resolveListRows(el, evalCtx);
    if (!rows.length) {
        return <div className={el.className}>{interpolate(el.emptyText || "Nothing to show", evalCtx)}</div>;
    }
    return (
        <div className={`list ${el.className || ""}`}>
            {rows.map((row, idx) => {
                const localCtx = {
                    evaluate: evalCtx.evaluate,
                    locals: { ...evalCtx.locals, item: row, index: idx }
                };
                return (
                    <div key={(row as any).id ?? idx} className="list-row">
                        {el.row.map((child, i) => (
                            <ElementView key={(child as any).id || i} el={child} evalCtx={localCtx} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

function resolveListRows(el: ListEl, evalCtx: any): any[] {
    const src = (el as any).of;
    if (typeof src === "string") {
        const root = evalCtx.locals;
        if (src === "attributes") return objectToRows(root.attr);
        if (src === "resources") return objectToRows(root.res);
        if (src === "derived") return objectToRows(root.derived);
        if (src === "inventory") {
            // Support both legacy array and current { items: [...] } shape
            if (Array.isArray(root.inventory)) return root.inventory;
            if (root.inventory && Array.isArray(root.inventory.items)) return root.inventory.items;
            return [];
        }
        return [];
    } else {
        const v = evaluateAny<any[]>(src.expr, evalCtx);
        return Array.isArray(v) ? v : [];
    }
}

function objectToRows(obj: Record<string, unknown> | undefined): any[] {
    if (!obj) return [];
    return Object.entries(obj).map(([key, value]) => ({
        id: key,
        key,
        value
    }));
}
