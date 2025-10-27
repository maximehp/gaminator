import React from "react";
import type { PanelConfig, PanelElement, ListEl, NumberInputEl, ButtonEl, ToggleEl } from "./dsl/types";
import { interpolate, evaluateNumber, evaluateBoolean, evaluateAny } from "./dsl/expr";
import { useCharacter } from "./state/CharacterContext";

export function PanelRenderer(props: { panel: PanelConfig }) {
    const { panel } = props;
    const { character, evaluator, actions, vars } = useCharacter();

    const evalCtx = React.useMemo(() => {
        return {
            evaluate: (expr: string, locals?: Record<string, unknown>) =>
                evaluator.evaluate(expr, { ...buildCtx(character, vars), ...(locals || {}) }),
            locals: buildCtx(character, vars)
        };
    }, [character, evaluator, vars]);

    return (
        <div className={panel.className}>
            {panel.title ? <h3 className="panel-title">{interpolate(panel.title, evalCtx)}</h3> : null}
            <div className="panel-body">
                {panel.elements.map((el, i) => (
                    <ElementView key={el["id"] || i} el={el} evalCtx={evalCtx} />
                ))}
            </div>
        </div>
    );
}

function ElementView(props: { el: PanelElement; evalCtx: any }) {
    const { el, evalCtx } = props;
    const { actions } = useCharacter();

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
                if (el.onChange.action === "setAttribute" && el.onChange.key) {
                    actions.setAttribute(el.onChange.key, next);
                } else if (el.onChange.action === "setResource" && el.onChange.key) {
                    actions.setResource(el.onChange.key, next);
                } else if (el.onChange.action === "setLevel") {
                    actions.setLevel(next);
                }
            };
            return (
                <div className={el.className}>
                    {el.label ? <label htmlFor={el.id}>{interpolate(el.label, evalCtx)}</label> : null}
                    <input
                        id={el.id}
                        type="number"
                        value={v}
                        min={el.min}
                        max={el.max}
                        step={el.step ?? 1}
                        onChange={e => onChange(Number(e.target.value))}
                    />
                </div>
            );
        }

        case "toggle": {
            const checked = evaluateBoolean(el.value, evalCtx);
            const onChange = (next: boolean) => {
                if (el.onChange.action === "toggleVar" && el.onChange.key) {
                    // CharacterContext handles toggle and recompute
                    actions.toggleVar(el.onChange.key);
                }
            };
            return (
                <label className={`toggle ${el.className || ""}`}>
                    <input
                        id={el.id}
                        type="checkbox"
                        checked={checked}
                        onChange={e => onChange(e.target.checked)}
                    />
                    {el.label ? <span>{interpolate(el.label, evalCtx)}</span> : null}
                </label>
            );
        }

        case "button": {
            const click = (cfg: ButtonEl["onClick"]) => {
                if (cfg.action === "recompute") actions.recompute();
                else if (cfg.action === "shortRest") actions.shortRest();
                else if (cfg.action === "longRest") actions.longRest();
                else if (cfg.action === "roll") actions.roll(cfg.expr as string);
                else if (cfg.action === "setResource") {
                    const to = evaluateNumber(cfg.to, evalCtx);
                    actions.setResource(cfg.key, to);
                }
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
                    <div key={row.id ?? idx} className="list-row">
                        {el.row.map((child, i) => (
                            <ElementView key={child["id"] || i} el={child} evalCtx={localCtx} />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

function resolveListRows(el: ListEl, evalCtx: any): any[] {
    const src = el.of;
    if (typeof src === "string") {
        const root = evalCtx.locals;
        if (src === "attributes") return objectToRows(root.attr);
        if (src === "resources") return objectToRows(root.res);
        if (src === "derived") return objectToRows(root.derived);
        if (src === "inventory") return Array.isArray(root.inventory) ? root.inventory : [];
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

function buildCtx(character: any, vars: Record<string, unknown>) {
    // mirror your evaluator ctx fields
    return {
        ...character,
        level: character.level,
        attr: character.attributes,
        res: character.resources,
        derived: character.derived,
        prof: character.proficiency,
        vars
    };
}
