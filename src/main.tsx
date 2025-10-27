import React from "react";
import { createRoot } from "react-dom/client";
import { loadPack } from "./engine/packLoader";
import { createCharacter } from "./domain/character/characterFactory";
import { CharacterProvider } from "./ui/state/CharacterContext";
import { loadPackUi } from "./ui/packUI.ts";
import { LayoutManager } from "./ui/layout/LayoutManager";
import "./ui/global.css";

// minimal evaluator adapter that matches your characterEvaluator API
import { makeCharacterEvaluator } from "./domain/character/characterEvaluator";

async function boot() {
    const params = new URLSearchParams(location.search);
    const packId = params.get("pack") || "dnd_5e_2024";

    const pack = await loadPack(packId);
    const evaluator = makeCharacterEvaluator();

    const character = createCharacter(pack, evaluator, {});

    const ui = await loadPackUi(packId);

    const App = () => (
        <CharacterProvider pack={pack} evaluator={evaluator} initialCharacter={character}>
            <LayoutManager panels={ui.panels} layout={ui.layout} />
        </CharacterProvider>
    );

    const el = document.getElementById("root")!;
    createRoot(el).render(<App />);
}

boot();
