# 🎲 Gaminator

**Gaminator** is an open-source, browser-based **modular RPG character sheet engine**.  
It loads complete game systems from human-readable YAML files, automatically builds dynamic character sheets, and (eventually) will let DMs and players connect for synchronized sessions.

The design goal is *absurd flexibility:* any RPG (D&D, Pathfinder, WoW, or entirely homebrew) can define its own rules, stats, inventory logic, and UI layout through “packs”.

---

## 🚀 Features (Current & Planned)

### ✅ Core
- YAML-based **pack system** (stats, inventory, progression, etc.)
- Modular **SRD content** loader (items, spells, monsters, classes)
- Fully **schema-driven UI**
- Lightweight **formula engine** supporting `mod()`, `roll()`, and math operators
- Configurable **economy and carry rules**
- Built-in **D&D 5e 2024** ruleset

### 🔧 In development
- Character factory + evaluator
- Attribute and inventory panels
- Local character save/load
- Layout persistence using GoldenLayout
- JSON import/export
- Automatic Open5e SRD importer

### 🧩 Planned
- Real-time networked sessions (DM + players)
- Dice rolling + chat
- Custom “pack marketplace” for community systems
- Plugin system for derived mechanics and visuals

---

## Core Concepts

### 🎮 Packs
A **pack** defines:
- **Schema:** attributes, resources, inventory, dice, currencies
- **Rules:** operators, stacking, formulas, lookups
- **Content:** items, spells, classes, monsters
- **UI Preset:** default layout and theme

Packs live under `src/packs/builtin/<pack_id>/` and are composed of multiple YAML files merged at runtime.

### 🧱 Characters
Characters are generated dynamically using the pack schema.  
They store:
- Attributes & resources
- Inventory & currencies
- Levels, classes, and experience
- Derived values (calculated by evaluator)
- Known spells, features, and traits
- Active conditions and temporary effects

### 🧮 Formulas
Formulas use a safe, sandboxed evaluator.  
Example syntax:  
```
attr.str * 2 + lookup("prof_by_level", level)
```

They can reference attributes, resources, lookups, and derived stats.

---

## ⚙️ Development Setup

```
# Clone the repository
git clone https://github.com/<yourname>/gaminator.git
cd gaminator

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

If the setup is correct, the console should display:
```
Loaded pack: Dungeons & Dragons 5e (2024)
```

---

## 🧰 Adding a New Game System

1. Copy `src/packs/builtin/template.yaml` → `src/packs/builtin/my_game.yaml`
2. Create a folder `src/packs/builtin/my_game/`
    - `content/` → items, spells, monsters, etc.
    - `lookups/` → tables and numerical data
3. Edit the YAML to define attributes, mechanics, and UI
4. Run `pnpm dev` and the engine will load your pack automatically

For more, see `docs/pack_format.md` *(coming soon)*

---

## 🧪 Example: D&D 5e 2024
This built-in pack demonstrates:
- Six ability scores (`str`, `dex`, `con`, `int`, `wis`, `cha`)
- Level-based proficiency and spell slots
- HP, Hit Dice, and resource-based health model
- Currency with weight and carrying capacity
- Derived values for AC, initiative, and modifiers

Files:
```
src/packs/builtin/dnd_5e_2024.yaml
src/packs/builtin/dnd_5e_2024/content/
src/packs/builtin/dnd_5e_2024/lookups/
```

---

## 📜 License

Open source under the **MIT License**.  
D&D 5e SRD portions © Wizards of the Coast, distributed under  
the [Open Gaming License 1.0a](https://www.5esrd.com/ogl/)  
and/or [CC BY 4.0](https://open5e.com/license.html).

---

## 💡 Credits

Created by **Maxime Hendryx-Parker**  
Pull requests and pack contributions welcome!
