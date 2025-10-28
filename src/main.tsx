// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { loadPack } from "./engine/packLoader";
import { createCharacter } from "./domain/character/characterFactory";
import { CharacterProvider } from "./app/state/CharacterContext";
import { loadPackUi } from "./app/packUI";
import { LayoutManager } from "./app/layout/LayoutManager";
import "./app/global.css";
import { createPackEvaluator } from "./domain/character/characterEvaluator";

async function boot() {
    const params = new URLSearchParams(location.search);
    const packId = params.get("pack") || "dnd_5e_2024";

    const pack = await loadPack(packId);
    const evaluator = createPackEvaluator(pack);

    const character = createCharacter(pack, evaluator, {});
    const ui = await loadPackUi(packId);

    const App = () => (
        <CharacterProvider
            pack={pack}
            evaluator={evaluator}
            initialCharacter={character}
            uiActions={ui.actions}
        >
            <LayoutManager panels={ui.panels} layout={ui.layout} />
        </CharacterProvider>
    );

    const el = document.getElementById("root");
    if (!el) {
        throw new Error("Root element #root not found");
    }
    createRoot(el).render(<App />);
}

boot();
