// Import any character JSON under /src/characters
const ALL_CHARS: Record<string, string> = import.meta.glob(
    "/src/characters/**/*.json",
    { query: "?raw", import: "default", eager: true }
) as Record<string, string>;

export type CharacterFile = {
    id: string;                // stable id for selection
    name: string;
    systemId: string;          // must match pack.metadata.id
    // rest of the fields are your Character shape; partial is OK, recalc will fill
    [k: string]: any;
};

export function listCharacterIds(): string[] {
    return Object.keys(ALL_CHARS);
}

// Load by filename-like key or by simple slug
export function loadCharacterById(id: string): CharacterFile | null {
    // Accept either full path key or a simple slug like "sample_dnd_5e_2024"
    const match = Object.entries(ALL_CHARS).find(([k]) =>
        k.endsWith(`/${id}.json`) || k.endsWith(`/${id}/${id}.json`)
    );
    const text = match ? match[1] : ALL_CHARS[id];
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
