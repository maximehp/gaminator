import { loadPack } from "./engine/packLoader";

async function init() {
    const pack = await loadPack("dnd_5e_2024");
    console.log("Loaded pack:", pack);
}

init();
