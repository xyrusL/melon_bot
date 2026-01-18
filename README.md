# 🍈 MelonBot - Minecraft AFK Bot

A simple Minecraft bot that automatically goes AFK after connecting.

## ✨ Features

- Connects to any Minecraft server (Java Edition)
- Waits configurable time then sends `/afk` command
- Supports both offline and Microsoft authentication
- Auto-detects Minecraft version

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Edit `config.js` to customize (comments included to guide you!):

| Setting | Description | Example |
|---------|-------------|---------|
| `host` | Server IP address | `"mc.example.com"` |
| `port` | Server port | `25565` |
| `username` | Bot's username | `"_MelonPort"` |
| `version` | MC version (empty = auto) | `"1.21"` |
| `afkDelay` | Seconds before AFK | `10` |
| `afkCommand` | AFK command to send | `"/afk"` |
| `auth` | `"offline"` or `"microsoft"` | `"offline"` |

## 🚀 Usage

```bash
npm start
```

## 📝 Notes

- For **cracked/offline servers**: use `"auth": "offline"`
- For **premium servers**: use `"auth": "microsoft"` (will prompt login)
- Leave `version` empty to auto-detect server version
