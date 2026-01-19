# 🍈 Melon Bot - AI & Combat Bot

A modular, AI-powered Minecraft bot capable of combat, social interaction, and survival logic.

## 🏗️ Architecture & Flow

The bot uses a **Event-Driven Modular Architecture**. Modules do not call each other directly; instead, they communicate through a central **Event Bus**.

### Core Flow
```plantuml
[Game Events] → [Events Bus] → [Modules] → [Actions]
```

1.  **Game Events**: Mineflayer emits raw events (chat, spawn, physics).
2.  **Modules**: Listen for events and process logic (e.g., AI logic, combat calculations).
3.  **Event Bus**: Modules share high-level events (e.g., `ai:request`, `social:lonely`).
4.  **Actions**: Modules perform actions (move, attack, chat).

### Folder Structure
```
melon_bot/
├── core/
│   ├── events.js    # 📡 Central Event Bus (EventEmitter)
│   └── bot.js       # 🤖 Bot Factory (Loads all modules)
├── modules/
│   ├── ai/          # 🧠 AI Brain (NVIDIA/OpenAI)
│   ├── social/      # 🤝 Social behaviors (AFK, Follow)
│   ├── combat/      # ⚔️ Combat & Protection
│   └── inventory/   # 🎒 Auto-equip & Food
└── index.js         # 🚀 Entry Point
```

---

## 🧩 Modules Explained

### 1. 🧠 AI Module (`modules/ai`)
- **How it works**: Listens for `ai:request` events.
- **Robustness**: Uses `try/catch` around API calls. If the API fails, the bot continues working (just silent).
- **Persona**: Defined in `persona.js` (Mochi: 15yo Filipina gamer girl).
- **Flow**:
  - `ai:request` received → Check cooldown → Call API → Emit `ai:responded` → `bot.chat()`

### 2. 🤝 Social Module (`modules/social`)
- **AFK**: Goes to spawn if alone for too long.
- **Follow**: Follows players who ask (`follow me`).
- **Emotions**: Thanks players for items, dances when happy.
- **Flow**:
  - Player nearby? → No → Emit `social:lonely` → Go Home.
  - "Follow me" chat? → Emit `ai:request` (ask AI to reply) → Start following.

### 3. ⚔️ Combat Module (`modules/combat`)
- **AltoClef Logic**: Waits for attack cooldown (1.9+ combat).
- **Guard Mode**: Protects players from mobs.
- **Defense**: Auto-shield, jump over obstacles, scan 360°.
- **Flow**:
  - `entityHurt` or `physicsTick` → Scan threats → `smartAttack(target)`.
  - Low Health? → Run away + Eat food.

### 4. 🎒 Inventory Module (`modules/inventory`)
- **Auto-Equip**: Always wears best armor and holds best weapon.
- **Emergency**:
  - HP < 6: `/spawn`
  - HP < 3: Drop **ALL** items (to save loot before death).
- **Flow**:
  - `health` update → Check HP → Eat/Run/Drop.
  - `playerCollect` → Check inventory → Upgrade gear.

---

## 🚀 Installation & Usage

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env`
Create a `.env` file with your API key:
```env
NVIDIA_API_KEY=nvapi-your-key-here
```

### 3. Run the Bot
Edit `index.js` to set your server details, then:
```bash
npm start
```
