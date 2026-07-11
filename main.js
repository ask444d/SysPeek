const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SettingsManager = require('./src/settings/settingsManager');

let mainWindow = null, settingsManager = null;
let currentPid = null, currentName = 'process';
let lastNetBytes = null;

let history = { cpu: [], ram: [], netRx: [], netTx: [], disk: [], timestamps: [] };
const HMAX = 600;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 320, height: 480, minWidth: 280, minHeight: 300,
        titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 8 },
        backgroundColor: '#1c1c1e',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
        show: false
    });
    mainWindow.loadFile('src/index.html');
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
    settingsManager = new SettingsManager();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else mainWindow?.show(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── Process list ────────────────────────────────────────────
function getProcessList(query) {
    try {
        const out = execSync('ps -eo pid,pcpu,pmem,rss,comm -r', { encoding: 'utf-8', timeout: 3000 });
        const lines = out.trim().split('\n').slice(1);
        const ql = query ? query.toLowerCase() : '';
        return lines.map(l => {
            const p = l.trim().split(/\s+/);
            const full = p[4] || '';
            const name = full.split('/').pop() || full;
            return { pid: +p[0], name, cpu: +p[1], mem: +p[2], rss: +p[3] * 1024 };
        }).filter(p => p.name && p.pid > 0 && (!ql || p.name.toLowerCase().includes(ql)));
    } catch { return []; }
}

ipcMain.handle('get-processes', () => getProcessList(''));
ipcMain.handle('search-processes', (_e, q) => getProcessList(q));

// ─── Monitoring ──────────────────────────────────────────────
ipcMain.handle('start-monitoring', (_e, pid, name) => {
    currentPid = pid;
    currentName = name || 'process';
    lastNetBytes = null;
    history = { cpu: [], ram: [], netRx: [], netTx: [], disk: [], timestamps: [] };
    return { ok: true };
});

ipcMain.handle('stop-monitoring', () => {
    currentPid = null;
    return { ok: true };
});

ipcMain.handle('get-metrics', () => {
    if (!currentPid) return null;
    const pid = currentPid;
    const m = { timestamp: Date.now() };

    // CPU + RAM — one ps call
    try {
        const out = execSync(`ps -p ${pid} -o %cpu=,rss= -w`, { encoding: 'utf-8', timeout: 1000 });
        const p = out.trim().split(/\s+/);
        m.cpu = parseFloat(p[0]) || 0;
        m.rss = (parseInt(p[1]) || 0) * 1024;
    } catch { m.cpu = 0; m.rss = 0; }

    // Open files + connections — one lsof call
    let files = 0, conns = 0;
    try {
        const out = execSync(`lsof -p ${pid} -Fn 2>/dev/null | head -200`, { encoding: 'utf-8', timeout: 800 });
        for (const l of out.split('\n')) {
            if (l.startsWith('f')) files++;
            if (l.startsWith('n') && (l.includes(':') || l.includes('->'))) conns++;
        }
    } catch {}
    m.files = files; m.conns = conns;

    // Network bytes via netstat
    let netRx = 0, netTx = 0;
    try {
        const out = execSync(`netstat -ib -I en0 2>/dev/null | tail -n +2 | awk '{print $7, $10}'`, { encoding: 'utf-8', timeout: 500 });
        if (out.trim()) {
            const p = out.trim().split(/\s+/);
            const rx = parseInt(p[0]) || 0;
            const tx = parseInt(p[1]) || 0;
            if (lastNetBytes) {
                netRx = Math.max(0, rx - lastNetBytes.rx);
                netTx = Math.max(0, tx - lastNetBytes.tx);
            }
            lastNetBytes = { rx, tx };
        }
    } catch {}
    m.netRx = netRx; m.netTx = netTx;

    m.threads = 0;
    try {
        const out = execSync(`ps -p ${pid} -L -o pid= 2>/dev/null`, { encoding: 'utf-8', timeout: 500 });
        m.threads = out.trim().split('\n').length;
    } catch {}

    // Store history
    history.cpu.push(m.cpu);
    history.ram.push(m.rss);
    history.netRx.push(m.netRx);
    history.netTx.push(m.netTx);
    history.disk.push(m.files);
    history.timestamps.push(m.timestamp);
    while (history.cpu.length > HMAX) {
        history.cpu.shift(); history.ram.shift();
        history.netRx.shift(); history.netTx.shift();
        history.disk.shift(); history.timestamps.shift();
    }

    return m;
});

// ─── History ─────────────────────────────────────────────────
ipcMain.handle('get-history', () => history);

// ─── Process Details ────────────────────────────────────────
ipcMain.handle('get-process-details', (_e, pid) => {
    const details = { path: '', args: '', ports: [], threads: [] };

    // Path + args
    try {
        const out = execSync(`ps -p ${pid} -o comm=,args=`, { encoding: 'utf-8', timeout: 1000 });
        const lines = out.trim().split('\n');
        details.path = lines[0] || '';
        details.args = lines[1] || lines[0] || '';
    } catch {}

    // Open ports via lsof
    try {
        const out = execSync(`lsof -p ${pid} -i -P -n 2>/dev/null | tail -n +2`, { encoding: 'utf-8', timeout: 1000 });
        for (const l of out.split('\n')) {
            const parts = l.trim().split(/\s+/);
            if (parts.length >= 9) {
                const proto = parts[7] || '';
                const addr = parts[8] || '';
                if (addr.includes(':') || addr.includes('*')) {
                    details.ports.push({ proto, addr });
                }
            }
        }
    } catch {}

    // Threads
    try {
        const out = execSync(`ps -p ${pid} -L -o tid=,stat=,pcpu=,comm=`, { encoding: 'utf-8', timeout: 1000 });
        for (const l of out.split('\n')) {
            const p = l.trim().split(/\s+/);
            if (p.length >= 3) {
                details.threads.push({ tid: +p[0], stat: p[1], cpu: +p[2], name: p.slice(3).join(' ') || '' });
            }
        }
    } catch {}

    return details;
});

// ─── Export ──────────────────────────────────────────────────
ipcMain.handle('export-data', async (_e, { format, data }) => {
    try {
        if (!data || !data.timestamps || data.timestamps.length === 0) return null;
        const safeName = currentName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const defaultName = `${safeName}_${ts}.${format}`;

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export', defaultPath: defaultName,
            filters: [{ name: format.toUpperCase(), extensions: [format] }]
        });
        if (result.canceled || !result.filePath) return null;

        let content = '';
        if (format === 'csv') {
            const rows = (data.timestamps || []).map((ts, i) =>
                `${new Date(ts).toISOString()},${(data.cpu[i]||0).toFixed(1)},${data.ram[i]||0},${data.disk[i]||0},${data.netRx[i]||0},${data.netTx[i]||0}`
            );
            content = ['Time,CPU%,RAM,OpenFiles,NetRX,NetTX', ...rows].join('\n');
        } else if (format === 'json') {
            content = JSON.stringify(data, null, 2);
        } else {
            content = (data.timestamps || []).map((ts, i) =>
                `[${new Date(ts).toLocaleString()}] CPU:${(data.cpu[i]||0).toFixed(1)}% RAM:${((data.ram[i]||0)/1048576).toFixed(1)}MB Files:${data.disk[i]||0} RX:${data.netRx[i]||0} TX:${data.netTx[i]||0}`
            ).join('\n');
        }
        fs.writeFileSync(result.filePath, content, 'utf-8');
        shell.showItemInFolder(result.filePath);
        return result.filePath;
    } catch {
        return null;
    }
});

// ─── PNG Export ───────────────────────────────────────────────
ipcMain.handle('export-png', async (_e, dataUrl) => {
    const safeName = currentName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const defaultName = `${safeName}_${ts}.png`;

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Chart', defaultPath: defaultName,
        filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return null;

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    shell.showItemInFolder(result.filePath);
    return result.filePath;
});

// ─── Settings ────────────────────────────────────────────────
ipcMain.handle('get-settings', () => settingsManager?.getAll() || {});
ipcMain.handle('save-settings', (_e, s) => { settingsManager?.save(s); return true; });

// ─── Kill Process ────────────────────────────────────────────
ipcMain.handle('kill-process', async (_e, pid) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning', buttons: ['Cancel', 'Kill'], defaultId: 0,
        title: 'Kill Process', message: `Kill PID ${pid}?`, detail: 'This will terminate the process immediately.'
    });
    if (result.response === 0) return false;
    try {
        execSync(`kill -9 ${pid}`, { timeout: 2000 });
        return true;
    } catch { return false; }
});

// ─── Favorites ───────────────────────────────────────────────
ipcMain.handle('get-favorites', () => settingsManager?.getFavorites() || []);
ipcMain.handle('add-favorite', (_e, proc) => { settingsManager?.addFavorite(proc); return true; });
ipcMain.handle('remove-favorite', (_e, pid) => { settingsManager?.removeFavorite(pid); return true; });
