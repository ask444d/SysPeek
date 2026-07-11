let pid = null, name = '', mon = null;
let cpuH = [], ramH = [], netRxH = [], netTxH = [], diskH = [];
let cCpu, cRam, cNetRx, cNetTx, cDisk;
const MAX = 60;
let favorites = [];
let lastAlert = 0;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('input', loadList);
    document.getElementById('btnBack').addEventListener('click', goBack);
    document.getElementById('btnExportLog').addEventListener('click', showLogModal);
    document.getElementById('btnExportPng').addEventListener('click', doPng);
    document.getElementById('btnCopy').addEventListener('click', doCopy);
    document.getElementById('btnKill').addEventListener('click', doKill);
    document.getElementById('btnDetails').addEventListener('click', toggleDetails);
    document.getElementById('alertDismiss').addEventListener('click', () => {
        document.getElementById('alertBar').classList.add('hidden');
    });
    document.getElementById('modalClose').addEventListener('click', hideModal);
    document.getElementById('exportModal').addEventListener('click', e => { if (e.target.id === 'exportModal') hideModal(); });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeys);

    loadList();
    loadFavorites();
    setInterval(loadList, 3000);
});

function handleKeys(e) {
    // Cmd+F — focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (document.getElementById('monitorView').classList.contains('hidden')) {
            document.getElementById('searchInput').focus();
        }
    }
    // Esc — go back from monitor
    if (e.key === 'Escape') {
        if (!document.getElementById('monitorView').classList.contains('hidden')) {
            if (!document.getElementById('exportModal').classList.contains('hidden')) {
                hideModal();
            } else {
                goBack();
            }
        }
    }
    // Cmd+Shift+C — copy metrics
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (!document.getElementById('monitorView').classList.contains('hidden')) doCopy();
    }
}

async function loadFavorites() {
    favorites = await window.api.getFavorites();
    renderList();
}

function isFavorite(p) {
    return favorites.some(f => f.pid === p.pid);
}

function renderList(procs) {
    if (!procs) return;
    const ul = document.getElementById('processList');
    const st = ul.scrollTop;
    ul.innerHTML = '';

    // Favorites first
    const favProcs = procs.filter(p => isFavorite(p));
    const otherProcs = procs.filter(p => !isFavorite(p));
    const sorted = [...favProcs, ...otherProcs];

    sorted.forEach(p => {
        const li = document.createElement('li');
        li.className = 'proc-item' + (isFavorite(p) ? ' fav' : '');
        const c = p.cpu > 80 ? 'var(--red)' : p.cpu > 50 ? 'var(--orange)' : p.cpu > 20 ? 'var(--yellow)' : 'var(--green)';
        li.innerHTML = `
            <span class="star ${isFavorite(p) ? 'active' : ''}" data-pid="${p.pid}">${isFavorite(p) ? '\u2605' : '\u2606'}</span>
            <span class="dot" style="background:${c}"></span>
            <span class="name">${p.name}</span>
            <span class="cpu-badge">${p.cpu.toFixed(1)}%</span>
            <span class="pid">${p.pid}</span>`;
        li.onclick = (e) => {
            if (e.target.classList.contains('star')) {
                e.stopPropagation();
                toggleFavorite(p);
                return;
            }
            goMonitor(p);
        };
        ul.appendChild(li);
    });
    ul.scrollTop = st;
}

async function toggleFavorite(p) {
    if (isFavorite(p)) {
        await window.api.removeFavorite(p.pid);
    } else {
        await window.api.addFavorite(p);
    }
    await loadFavorites();
}

async function loadList() {
    const q = document.getElementById('searchInput').value;
    const procs = q ? await window.api.searchProcesses(q) : await window.api.getProcesses();
    procs.sort((a, b) => b.cpu - a.cpu);
    renderList(procs);
}

function goMonitor(p) {
    pid = p.pid; name = p.name;
    cpuH = []; ramH = []; netRxH = []; netTxH = []; diskH = [];
    document.getElementById('pickerView').classList.add('hidden');
    document.getElementById('monitorView').classList.remove('hidden');
    document.getElementById('monitorName').textContent = p.name;
    document.getElementById('monitorPid').textContent = 'PID ' + p.pid;
    document.getElementById('alertBar').classList.add('hidden');
    window.api.startMonitoring(pid, name);
    initCharts();
    mon = setInterval(tick, 1000);
}

function goBack() {
    if (mon) { clearInterval(mon); mon = null; }
    window.api.stopMonitoring();
    document.getElementById('monitorView').classList.add('hidden');
    document.getElementById('pickerView').classList.remove('hidden');
    killCharts();
    detailsOpen = false;
    document.getElementById('detailsBody').classList.add('hidden');
    document.querySelector('.details-chevron').style.transform = '';
    loadFavorites();
}

// Charts
const co = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
    elements: { point: { radius: 0 }, line: { borderWidth: 1.2, tension: 0.4 } },
    layout: { padding: 0 }
};

function mc(id, col) {
    const ctx = document.getElementById(id);
    if (!ctx) return null;
    return new Chart(ctx, { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: col, backgroundColor: col + '20', fill: true }] }, options: JSON.parse(JSON.stringify(co)) });
}

function initCharts() {
    cCpu = mc('chartCpu', '#0a84ff');
    cRam = mc('chartRam', '#bf5af2');
    cNetRx = mc('chartNetRx', '#64d2ff');
    cNetTx = mc('chartNetTx', '#ff9f0a');
    cDisk = mc('chartDisk', '#30d158');
}

function killCharts() {
    [cCpu, cRam, cNetRx, cNetTx, cDisk].forEach(c => { try { c?.destroy(); } catch {} });
    cCpu = cRam = cNetRx = cNetTx = cDisk = null;
}

function push(ch, v, arr) {
    arr.push(v);
    if (arr.length > MAX) arr.shift();
    if (!ch) return;
    ch.data.labels = arr.map(() => '');
    ch.data.datasets[0].data = arr.slice();
    ch.update('none');
}

function fmtBytes(bytes) {
    if (bytes < 1024) return bytes.toFixed(0) + ' B/s';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB/s';
    return (bytes / 1048576).toFixed(1) + ' MB/s';
}

async function tick() {
    if (!pid) return;
    try {
        const m = await window.api.getMetrics();
        if (!m) return;

        document.getElementById('valCpu').textContent = m.cpu.toFixed(1) + '%';
        document.getElementById('barCpu').style.width = Math.min(100, m.cpu) + '%';
        push(cCpu, m.cpu, cpuH);

        const mb = m.rss / 1048576;
        document.getElementById('valRam').textContent = mb.toFixed(0) + ' MB';
        document.getElementById('barRam').style.width = Math.min(100, mb / 50) + '%';
        push(cRam, mb, ramH);

        document.getElementById('valNet').textContent = '\u2193' + fmtBytes(m.netRx) + ' \u2191' + fmtBytes(m.netTx);
        push(cNetRx, m.netRx, netRxH);
        push(cNetTx, m.netTx, netTxH);

        document.getElementById('valDisk').textContent = m.files;
        push(cDisk, m.files, diskH);

        document.getElementById('valThreads').textContent = m.threads || 0;
        document.getElementById('valFiles').textContent = m.files;
        document.getElementById('valConns').textContent = m.conns;

        // Alert check (desktop notification)
        checkAlert(m);
    } catch {}
}

function checkAlert(m) {
    const now = Date.now();
    if (now - lastAlert < 30000) return;
    if (m.cpu > 90) {
        lastAlert = now;
        showAlert(`${name} CPU ${m.cpu.toFixed(1)}%`);
        if (Notification.isSupported()) {
            const n = new Notification({ title: 'SysPeek Alert', body: `${name} CPU: ${m.cpu.toFixed(1)}%` });
            n.show();
        }
    }
    if (m.rss > 1024 * 1024 * 1024) {
        lastAlert = now;
        showAlert(`${name} RAM ${(m.rss / 1048576).toFixed(0)} MB`);
        if (Notification.isSupported()) {
            const n = new Notification({ title: 'SysPeek Alert', body: `${name} RAM: ${(m.rss / 1048576).toFixed(0)} MB` });
            n.show();
        }
    }
}

function showAlert(text) {
    document.getElementById('alertText').textContent = text;
    document.getElementById('alertBar').classList.remove('hidden');
}

// Kill Process
async function doKill() {
    if (!pid) return;
    const ok = await window.api.killProcess(pid);
    if (ok) goBack();
}

// Modal
function showModal(t, h) {
    document.getElementById('modalTitle').textContent = t;
    document.getElementById('modalBody').innerHTML = h;
    document.getElementById('exportModal').classList.remove('hidden');
}
function hideModal() { document.getElementById('exportModal').classList.add('hidden'); }

function showLogModal() {
    showModal('Export Log', `
        <div class="exp-row"><label>Format</label>
            <select id="expFmt"><option value="csv">CSV</option><option value="json">JSON</option><option value="txt">TXT</option></select>
        </div>
        <div class="exp-row"><label>Period</label>
            <select id="expPer"><option value="all">All</option><option value="60">1 min</option><option value="300">5 min</option></select>
        </div>
        <div class="exp-btns">
            <button class="exp-btn" onclick="window._cm()">Cancel</button>
            <button class="exp-btn primary" onclick="window._doExp()">Save</button>
        </div>
    `);
}

window._cm = hideModal;
window._doExp = async () => {
    try {
        const fmt = document.getElementById('expFmt').value;
        const perVal = document.getElementById('expPer').value;
        let data = await window.api.getHistory();
        if (perVal !== 'all' && data.timestamps) {
            const secs = parseInt(perVal);
            if (secs > 0) {
                const cut = Date.now() - secs * 1000;
                const idx = [];
                data.timestamps.forEach((t, i) => { if (t >= cut) idx.push(i); });
                const d = {};
                Object.keys(data).forEach(k => { d[k] = idx.map(i => data[k][i]); });
                data = d;
            }
        }
        await window.api.exportData({ format: fmt, data });
        hideModal();
    } catch {
        hideModal();
    }
};

// PNG Export
function drawSparkline(cx, arr, x, y, w, h, color) {
    if (!arr || arr.length < 2) return;
    const mn = Math.min(...arr);
    const mx = Math.max(...arr);
    const range = mx - mn || 1;
    const step = w / (arr.length - 1);

    cx.beginPath();
    cx.moveTo(x, y + h);
    arr.forEach((v, i) => {
        cx.lineTo(x + i * step, y + h - ((v - mn) / range) * h);
    });
    cx.lineTo(x + w, y + h);
    cx.closePath();
    cx.fillStyle = color + '30';
    cx.fill();

    cx.beginPath();
    arr.forEach((v, i) => {
        const px = x + i * step;
        const py = y + h - ((v - mn) / range) * h;
        i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
    });
    cx.strokeStyle = color;
    cx.lineWidth = 1.2;
    cx.lineJoin = 'round';
    cx.stroke();
}

function doPng() {
    const charts = [
        { arr: cpuH, label: 'CPU', color: '#0a84ff' },
        { arr: ramH, label: 'RAM', color: '#bf5af2' },
        { arr: netRxH, label: 'NET RX', color: '#64d2ff' },
        { arr: netTxH, label: 'NET TX', color: '#ff9f0a' },
        { arr: diskH, label: 'DISK', color: '#30d158' },
    ].filter(x => x.arr && x.arr.length > 1);
    if (!charts.length) return;

    const W = 400, PAD = 14, ROW = 60, LBL = 14;
    const H = PAD + 30 + charts.length * (ROW + LBL) + PAD;
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const cx = cv.getContext('2d');
    cx.scale(2, 2);

    const dk = window.matchMedia('(prefers-color-scheme: dark)').matches;
    cx.fillStyle = dk ? '#1c1c1e' : '#f2f2f7';
    cx.fillRect(0, 0, W, H);

    cx.fillStyle = dk ? '#e5e5e5' : '#1c1c1e';
    cx.font = 'bold 13px -apple-system, sans-serif';
    cx.fillText(name, PAD, PAD + 12);
    cx.font = '10px -apple-system, sans-serif';
    cx.fillStyle = dk ? '#98989d' : '#636366';
    cx.fillText('PID ' + pid, PAD, PAD + 22);

    let y = PAD + 30;
    charts.forEach((item) => {
        cx.fillStyle = item.color;
        cx.font = 'bold 10px -apple-system, sans-serif';
        cx.fillText(item.label, PAD, y + 10);
        drawSparkline(cx, item.arr, PAD, y + 13, W - PAD * 2, ROW - 16, item.color);
        y += ROW + LBL;
    });

    savePNG(cv);
}

function savePNG(cv) {
    const dataUrl = cv.toDataURL('image/png');
    window.api.exportPng(dataUrl);
}

// Copy metrics
function doCopy() {
    const cpu = document.getElementById('valCpu').textContent;
    const ram = document.getElementById('valRam').textContent;
    const threads = document.getElementById('valThreads').textContent;
    const files = document.getElementById('valFiles').textContent;
    const conns = document.getElementById('valConns').textContent;
    const text = `${name} (PID ${pid})\nCPU: ${cpu} | RAM: ${ram} | Threads: ${threads} | Files: ${files} | Conns: ${conns}`;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btnCopy');
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 800);
    });
}

// Details panel
let detailsOpen = false;

function toggleDetails() {
    detailsOpen = !detailsOpen;
    const body = document.getElementById('detailsBody');
    const chevron = document.querySelector('.details-chevron');
    if (detailsOpen) {
        body.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
        loadDetails();
    } else {
        body.classList.add('hidden');
        chevron.style.transform = '';
    }
}

async function loadDetails() {
    if (!pid) return;
    const d = await window.api.getProcessDetails(pid);
    const body = document.getElementById('detailsBody');
    let html = '';

    if (d.path) {
        html += `<div class="det-section"><span class="det-label">Path</span><span class="det-val det-path">${esc(d.path)}</span></div>`;
    }
    if (d.ports.length) {
        html += `<div class="det-section"><span class="det-label">Ports (${d.ports.length})</span></div>`;
        html += '<div class="det-list">';
        d.ports.forEach(p => {
            html += `<div class="det-item"><span class="det-proto">${esc(p.proto)}</span><span class="det-val">${esc(p.addr)}</span></div>`;
        });
        html += '</div>';
    }
    if (d.threads.length) {
        html += `<div class="det-section"><span class="det-label">Threads (${d.threads.length})</span></div>`;
        html += '<div class="det-list">';
        d.threads.forEach(t => {
            html += `<div class="det-item"><span class="det-tid">${t.tid}</span><span class="det-stat">${esc(t.stat)}</span><span class="det-cpu">${t.cpu.toFixed(1)}%</span></div>`;
        });
        html += '</div>';
    }
    if (!html) html = '<div class="det-empty">No details available</div>';
    body.innerHTML = html;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
