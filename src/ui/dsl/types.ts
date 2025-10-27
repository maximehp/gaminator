/* Element and panel type definitions for the pack UI DSL */

export type ExprString = string; // may contain {{ ... }} interpolations

export type TextEl = {
    kind: "text";
    id?: string;
    text: ExprString;
    className?: string;
};

export type ImageEl = {
    kind: "image";
    id?: string;
    src: ExprString;
    alt?: ExprString;
    width?: number;
    height?: number;
    className?: string;
};

export type ValueEl = {
    kind: "value";
    id?: string;
    label?: ExprString;
    value: ExprString;
    className?: string;
};

export type BarEl = {
    kind: "bar";
    id?: string;
    label?: ExprString;
    current: ExprString;
    max: ExprString;
    showNumbers?: boolean;
    className?: string;
};

export type NumberInputEl = {
    kind: "numberInput";
    id: string;
    label?: ExprString;
    value: ExprString; // bound expression, should resolve to a number
    onChange: { action: "setAttribute" | "setResource" | "setLevel"; key?: string };
    min?: number;
    max?: number;
    step?: number;
    className?: string;
};

export type ToggleEl = {
    kind: "toggle";
    id: string;
    label?: ExprString;
    value: ExprString; // boolean expression
    onChange: { action: "toggleVar"; key: string };
    className?: string;
};

export type ButtonEl = {
    kind: "button";
    id: string;
    label: ExprString;
    onClick:
        | { action: "recompute" }
        | { action: "longRest" }
        | { action: "shortRest" }
        | { action: "roll"; expr: ExprString }
        | { action: "setResource"; key: string; to: ExprString };
    className?: string;
};

export type ListEl = {
    kind: "list";
    id: string;
    of: "attributes" | "resources" | "derived" | "inventory" | { expr: ExprString };
    row: Array<TextEl | ValueEl | NumberInputEl | ToggleEl | ButtonEl>;
    emptyText?: ExprString;
    className?: string;
};

export type PanelElement =
    | TextEl
    | ImageEl
    | ValueEl
    | BarEl
    | NumberInputEl
    | ToggleEl
    | ButtonEl
    | ListEl;

export type PanelConfig = {
    id: string;
    title?: string;
    elements: PanelElement[];
    className?: string;
};

export type PanelsFile = {
    panels: PanelConfig[];
};

export type PanelRegistry = Map<string, PanelConfig>;

export type LayoutConfig = unknown; // pass through GoldenLayout JSON
