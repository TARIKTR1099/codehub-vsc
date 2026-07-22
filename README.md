# CodeHub

**Terminal & AI Agent Manager for VS Code**

CodeHub is a powerful VS Code extension that centralizes your terminal, AI coding agents, and developer tools into one unified interface. Stop switching between multiple terminals — manage everything from CodeHub's activity bar panel.

---

## ✨ Features

### 🚀 OpenCode Integration
- **OpenCode CLI** — Official SDK integration: opens a terminal beside your editor with `opencode --port <port>`, automatically adds active file references
- **OpenCode Desktop** — OpenCode web panel as an iframe (requires `opencode` CLI)
- **OpenCode VSCode** — OpenCode in VS Code's integrated terminal panel

### 🤖 AI Agent Library
14 pre-configured AI coding agents ready to launch:

| Agent | Command | Description |
|-------|---------|-------------|
| **Claude Code** | `claude` | Anthropic AI coding agent |
| **OpenCode CLI** | `opencode --port` | Multi-provider AI agent (official) |
| **OpenCode Desktop** | `opencode` | OpenCode web panel |
| **Codex CLI** | `codex` | OpenAI coding agent CLI |
| **Kilo CLI** | `kilo` | 500+ model AI agent |
| **Gemini CLI** | `gemini` | Google Gemini CLI |
| **Aider** | `aider --model sonnet` | AI pair programming |
| **GitHub Copilot CLI** | `copilot` | GitHub Copilot in terminal |
| **Amazon Q** | `q` | AWS AI coding agent |
| **Goose** | `goose` | Block AI coding agent |
| **Kiro CLI** | `kiro-cli chat` | Kiro interactive AI CLI |
| **Cline** | `cline` | VS Code AI coding agent |
| **Roo Code** | `roo` | VS Code AI coding agent |

### 📋 Session Manager
- **Save sessions** — Save your currently open terminals as named sessions
- **Restore sessions** — Reopen any saved session with all terminals restored
- **Persist across restarts** — Sessions survive VS Code restarts
- **Per-session metadata** — Timestamp, workspace, terminal count

### 📁 Recent Projects
- **Auto-track** — Every folder you open is automatically tracked
- **Quick open** — Click any recent project to reopen it
- **History management** — Remove individual projects or clear all history

### 🔌 OmniRoute Integration
- **Auto-detect** — Checks if OmniRoute is running on `localhost:20128`
- **Auto-start** — If enabled, starts OmniRoute in a hidden terminal automatically
- **Status indicator** — Green/grey badge in side panel shows OmniRoute status

### ⚡ Terminal Profiles
- **Custom profiles** — Create profiles with custom shell, executable, arguments, working directory
- **3 launch modes** — Fullscreen (`ViewColumn.One`), VSCode Panel, Side Panel (`ViewColumn.Two`)
- **Drag-free ordering** — Use up/down buttons or type order number directly
- **Duplicate, edit, delete** — Full profile management
- **Default profile** — Set any profile as default with one click (★)

### 🎨 Smart UI
- **Status bar integration** — Shows running terminal count, click to run default
- **Keyboard shortcuts** — `Ctrl+Alt+C` to run default profile
- **Export/Import** — Share profiles as JSON files
- **Turkish / English** — Full i18n support
- **Profile icons** — Choose from 100+ VS Code codicons
- **Install detection** — Automatically detects if CLI tools are installed

---

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for "CodeHub"
4. Click Install

### From VSIX File
1. Download `codehub-1.0.0.vsix` from the [latest release](https://github.com/TARIKTR1099/codehub-vsc/releases/tag/v1.0.0)
2. In VS Code, press `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded file

---

## 🚀 Quick Start

1. Click the **CodeHub icon** in the **Activity Bar** (left sidebar)
2. Click **+ Profil Ekle** or **📋 Kütüphaneden Ekle** to add profiles
3. Click any profile to launch it
4. Use ▶ to open OpenCode, 📄 to add files to OpenCode
5. Create sessions with 💾 Session Kaydet

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+C` | Run default profile |
| Click Status Bar | Run default profile |
| ▶ (Panel) | OpenCode launcher |

---

## ⚙️ Settings

All settings are in VS Code settings under the `ch.` prefix.

| Setting | Default | Description |
|---------|---------|-------------|
| `ch.lang` | `"tr"` | Language (`"tr"` / `"en"`) |
| `ch.def` | `""` | Default profile ID (empty = first profile) |
| `ch.startupMode` | `"default"` | Auto-start on VS Code launch |
| `ch.startupDelay` | `1200` | Delay before auto-start (ms) |
| `ch.reuse` | `true` | Reuse existing terminal if available |
| `ch.omniRoute` | `false` | Enable OmniRoute integration |
| `ch.ocPath` | `"opencode"` | OpenCode CLI path |

### Profile Settings

Profiles are stored in `ch.profiles` as an array. Each profile has:

```json
{
  "id": "unique-id",
  "name": "Claude Code",
  "icon": "comment-discussion",
  "executable": "claude",
  "arguments": "",
  "shell": "cmd",
  "shellPath": "cmd.exe",
  "cwd": "C:\\Projects",
  "category": "ai",
  "checkCommand": "claude --version"
}
```

---

## 📂 Project Structure

```
├── src/extension.ts          # Main extension code (~480 lines)
├── media/                    # Icons and assets
│   ├── icon.png              # Extension icon
│   ├── activity-icon-dark.svg  # Activity bar icon (dark theme)
│   ├── activity-icon-light.svg # Activity bar icon (light theme)
│   ├── mark-dark.svg         # Terminal icon (dark)
│   └── mark-light.svg        # Terminal icon (light)
├── out/extension.js          # Compiled output
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── .vscodeignore             # Package exclusion list
```

---

## 🧪 Development

```bash
# Install dependencies
npm install

# Watch mode
npm run dev

# Build
npm run build

# Package VSIX
npm run package
```

---

## 📝 License

MIT License — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Icons from [VS Code Codicons](https://microsoft.github.io/vscode-codicons/)
- Inspired by OpenCode SDK (`@opencode-ai/vscode`)
