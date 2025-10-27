import YAML from "yaml";
import type { PanelsFile, PanelRegistry, LayoutConfig } from "./dsl/types";

/* Vite will inline these as raw strings */
const panelsGlobs = import.meta.glob("/src/packs/builtin/**/ui/panels.@(yaml|yml|json)", { as: "raw" });
const layoutGlobs = import.meta.glob("/src/packs/builtin/**/ui/layout.json", { as: "raw" });
const themeGlobs = import.meta.glob("/src/packs/builtin/**/ui/theme.css", { as: "raw" });

export type PackUI = {
    panels: PanelRegistry;
    layout: LayoutConfig;
    theme: string | null;
};

export async function loadPackUi(packId: string): Promise<PackUI> {
    const panelsPath = `/src/packs/builtin/${packId}/ui/panels.yaml`;
    const panelsAltJson = `/src/packs/builtin/${packId}/ui/panels.json`;
    const layoutPath = `/src/packs/builtin/${packId}/ui/layout.json`;
    const themePath = `/src/packs/builtin/${packId}/ui/theme.css`;

    const panelsRaw = await readFirst([panelsPath, panelsAltJson], panelsGlobs);
    const layoutRaw = await readOne(layoutPath, layoutGlobs);
    const themeRaw = await readOptional(themePath, themeGlobs);

    const panelsFile = parsePanels(panelsRaw);
    const panels: PanelRegistry = new Map();
    for (const p of panelsFile.panels) panels.set(p.id, p);

    const layout = JSON.parse(layoutRaw) as LayoutConfig;
    const theme = themeRaw ?? null;

    if (theme) injectTheme(theme);

    return { panels, layout, theme };
}

function parsePanels(raw: string): PanelsFile {
    if (!raw) return { panels: [] };
    const text = raw.trim();
    if (!text) return { panels: [] };
    if (text.startsWith("{") || text.startsWith("[")) {
        return JSON.parse(text);
    }
    return YAML.parse(text);
}

async function readFirst(paths: string[], glob: Record<string, () => Promise<string>>): Promise<string> {
    for (const p of paths) {
        const loader = glob[p];
        if (loader) return await loader();
    }
    throw new Error(`Panels file not found at ${paths.join(", ")}`);
}

async function readOne(path: string, glob: Record<string, () => Promise<string>>): Promise<string> {
    const loader = glob[path];
    if (!loader) throw new Error(`File not found: ${path}`);
    return await loader();
}

async function readOptional(path: string, glob: Record<string, () => Promise<string>>): Promise<string | null> {
    const loader = glob[path];
    return loader ? await loader() : null;
}

function injectTheme(css: string) {
    const id = "pack-theme-style";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = id;
        document.head.appendChild(style);
    }
    style.textContent = css;
}
