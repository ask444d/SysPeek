# SysPeek

**Lightweight real-time per-process resource monitor for macOS.**

SysPeek is a compact Electron-based utility that gives you instant visibility into any process on your Mac — CPU, RAM, network throughput, open files, threads, and ports — all in a minimal 320×480 window.

## Features

- **Real-time monitoring** — CPU, RAM, network (RX/TX bytes), open files, connections
- **Sparkline charts** — live-updating graphs via Chart.js
- **Process search** — find any process by name instantly
- **Favorites** — pin frequently watched processes to the top
- **Kill process** — terminate unresponsive processes with confirmation dialog
- **Desktop alerts** — notifications when CPU > 90% or RAM > 1 GB
- **Process details** — expand to see file path, open ports, thread list
- **Export** — save data as CSV, JSON, TXT, or PNG chart snapshot
- **Keyboard shortcuts** — `Cmd+F` search, `Esc` back, `Cmd+Shift+C` copy metrics
- **Native macOS look** — dark/light theme, hidden title bar, compact layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Electron](https://www.electronjs.org/) 30 |
| UI | HTML + CSS + vanilla JS |
| Charts | [Chart.js](https://www.chartjs.org/) 4.4 |
| System data | `ps`, `lsof`, `netstat` via `child_process.execSync` |
| Packaging | [electron-builder](https://www.electron.build/) |

No third-party monitoring libraries. All metrics collected from native macOS commands.

## Installation

### Prerequisites

- macOS 11+
- Node.js 18+
- Xcode Command Line Tools (`xcode-select --install`)

### From source

```bash
git clone https://github.com/yourname/SysPeek.git
cd SysPeek
npm install
npm start
```

### Build .app

```bash
npm run build
open dist/mac/SysPeek.app
```

## Usage

1. Launch SysPeek
2. Browse the process list or search by name
3. Click **Start** to begin monitoring
4. Expand the details panel to see ports, threads, and file path
5. Export data via the menu (CSV / JSON / TXT / PNG)

## Project Structure

```
SysPeek/
├── main.js                      # Electron main process
├── preload.js                   # Context bridge (IPC)
├── src/
│   ├── index.html               # UI
│   ├── renderer.js              # Frontend logic
│   ├── styles/main.css          # Dark/light theme
│   ├── settings/settingsManager.js
│   └── vendor/chart.min.js      # Chart.js (bundled)
└── package.json
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+F` | Focus search |
| `Esc` | Back / close modal |
| `Cmd+Shift+C` | Copy current metrics |

## License

MIT
