const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsManager {
    constructor() {
        this.dataPath = path.join(app.getPath('userData'), 'settings.json');
        this.data = this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.dataPath)) {
                return JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
            }
        } catch {}
        return this.defaults();
    }

    defaults() {
        return {
            favorites: [],
            alerts: [],
            settings: {
                menuBarDisplay: 'cpu',
                refreshRate: 1000,
                theme: 'system',
                showCpuPerCore: true,
                showSparklines: true,
                historyLength: 600,
                alwaysOnTop: false,
                startAtLogin: false
            }
        };
    }

    save(raw) {
        this.data.settings = { ...this.data.settings, ...raw };
        this.persist();
    }

    getAll() {
        return this.data.settings;
    }

    getFavorites() {
        return this.data.favorites || [];
    }

    addFavorite(proc) {
        if (!this.data.favorites) this.data.favorites = [];
        if (!this.data.favorites.find(f => f.pid === proc.pid)) {
            this.data.favorites.push(proc);
            this.persist();
        }
    }

    removeFavorite(pid) {
        this.data.favorites = (this.data.favorites || []).filter(f => f.pid !== pid);
        this.persist();
    }

    getAlerts() {
        return this.data.alerts || [];
    }

    saveAlerts(alerts) {
        this.data.alerts = alerts;
        this.persist();
    }

    persist() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch {}
    }
}

module.exports = SettingsManager;
