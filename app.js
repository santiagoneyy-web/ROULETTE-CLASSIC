// ============================================================
// app.js — UI logic for Roulette Predictor v2
// ============================================================

const history      = [];
const stats        = {};
const topHitHistory = []; 
const iaSignalsHistory = [ [], [], [], [], [] ]; 
const lastIaHits = [null, null, null, null, null];
const iaWins = [0, 0, 0, 0, 0];
const iaLosses = [0, 0, 0, 0, 0];
let recommendedWin = 0;
let recommendedLoss = 0;
let lastIaSignals = [null, null, null, null, null]; 
let activeIaTab    = 0; 
let latestAgent5Top = null; 
let activeTab      = '-'; 

const API_BASE = '/api';
let currentTableId = null;
let pollingTimer   = null;
let lastKnownSpinId = null;

const auditStats = {
    'N9': { w: 0, l: 0 },
    'N4_S': { w: 0, l: 0 },
    'N4_B': { w: 0, l: 0 }
};

const numInput    = document.getElementById('num-input');
const submitBtn   = document.getElementById('submit-btn');
const clearBtn    = document.getElementById('clear-btn');
const historyEl   = document.getElementById('history-strip');
const statusMsg   = document.getElementById('status-msg');
const stratTabs   = document.getElementById('strat-tabs');
const targetPanel = document.getElementById('target-content');
const nextPanel   = document.getElementById('next-content');
const topPanel    = document.getElementById('top-content');
const travelPanel = document.getElementById('travel-content');

const tableSelect      = document.getElementById('table-select');
const tableSpinCount   = document.getElementById('table-spin-count');
const addTableBtn      = document.getElementById('add-table-btn');
const clearTableBtn    = document.getElementById('clear-table-btn');
const modalOverlay     = document.getElementById('modal-overlay');
const modalName        = document.getElementById('modal-name');
const modalProvider    = document.getElementById('modal-provider');
const modalUrl         = document.getElementById('modal-url');
const modalCancel      = document.getElementById('modal-cancel');
const modalSave        = document.getElementById('modal-save');

async function apiFetchTables() { const r = await fetch(`${API_BASE}/tables`); return r.json(); }
async function apiAddTable(name, provider, url) { const r = await fetch(`${API_BASE}/tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, provider, url }) }); return r.json(); }
async function apiFetchHistory(tableId) { const r = await fetch(`${API_BASE}/history/${tableId}`); return r.json(); }
async function apiPostSpin(tableId, number) { const r = await fetch(`${API_BASE}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: tableId, number, source: 'manual' }) }); return r.json(); }
async function apiClearHistory(tableId) { const r = await fetch(`${API_BASE}/history/${tableId}`, { method: 'DELETE' }); return r.json(); }
async function apiFetchPredict(tableId) { const r = await fetch(`${API_BASE}/predict/${tableId}`); return r.json(); }

const RED_NUMS   = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numColor(n) { if (n === 0) return 'green'; if (RED_NUMS.has(n)) return 'red'; return 'black'; }

function wheelDistance(a, b) {
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const iA = WHEEL_ORDER.indexOf(a), iB = WHEEL_ORDER.indexOf(b);
    let dist = Math.abs(iA - iB);
    return dist > 18 ? 37 - dist : dist;
}

function renderHistory() {
    historyEl.innerHTML = '';
    history.slice(-20).reverse().forEach(n => {
        const div = document.createElement('div');
        div.className = `ball ball-${numColor(n)}`;
        div.textContent = n;
        historyEl.appendChild(div);
    });
}

function renderSignalsPanel(signals, sig, lastNum) {
    if (!topPanel) return;
    try {
        const tabButtons = signals.map((s, idx) => {
            const isActive = idx === activeIaTab;
            const names = ['n16','n17','1717','N18','Célula'];
            return `<button class="ia-tab ${isActive ? 'active' : ''}" onclick="setActiveIaTab(${idx})">${names[idx] || 'IA'}</button>`;
        }).join('');

        const s = signals[activeIaTab] || signals[0];
        if (!s) { topPanel.innerHTML = `<div class="ia-tabs-strip">${tabButtons}</div><p class="muted">Sin señal.</p>`; return; }

        const sConf = s.confidence || '0%';
        const sRule = s.rule || 'ANALIZANDO';
        const sReason = s.reason || 'SINCRO...';
        const isPausa = sConf === '0%' || sRule === 'STOP';

        let content = '';
        if (activeIaTab === 0) { // n16
            content = `<div class="ia-active-slot slot-math">
                <div class="ia-slot-header"><span class="ia-slot-name">🤖 Android n16</span><span class="ia-slot-conf">${sConf}</span></div>
                <div class="ia-main-val"><span class="tp-num">${isPausa ? '...' : s.tp}</span></div>
                <div class="ia-slot-footer"><div>W:${iaWins[0]} L:${iaLosses[0]}</div><div class="ia-reason">${sReason}</div></div>
            </div>`;
        } else if (activeIaTab === 1) { // n17
            content = `<div class="ia-active-slot slot-escudo">
                <div class="ia-slot-header"><span class="ia-slot-name">🎯 Android n17</span><span class="ia-slot-conf">${sConf}</span></div>
                <div class="ia-main-num">${isPausa ? '...' : s.number + '<sup>n9</sup>'}</div>
                <div class="ia-slot-footer"><div>W:${iaWins[1]} L:${iaLosses[1]}</div></div>
            </div>`;
        } else if (activeIaTab === 2) { // 1717
            content = `<div class="ia-active-slot slot-lanza">
                <div class="ia-slot-header"><span class="ia-slot-name">🤖 Android 1717</span><span class="ia-slot-conf">${sConf}</span></div>
                <div class="ia-main-num">${isPausa ? '...' : s.number + '<sup>n4</sup>'}</div>
                <div class="ia-slot-footer"><div>W:${iaWins[2]} L:${iaLosses[2]}</div></div>
            </div>`;
        } else if (activeIaTab === 3) { // N18
            content = `<div class="ia-active-slot slot-escudo">
                <div class="ia-slot-header"><span class="ia-slot-name">🛡️ N18</span><span class="ia-slot-conf">${sConf}</span></div>
                <div class="ia-main-num">${isPausa ? '...' : s.number + '<sup>n9</sup>'}</div>
                <div class="ia-slot-footer"><div>W:${iaWins[3]} L:${iaLosses[3]} | SESIÓN: ${recommendedWin}/${recommendedLoss}</div></div>
            </div>`;
        } else if (activeIaTab === 4) { // Célula
            content = `<div class="ia-active-slot slot-escudo" style="border-color:var(--gold)">
                <div class="ia-slot-header"><span class="ia-slot-name">🧬 Célula</span><span class="ia-slot-conf">${sConf}</span></div>
                <div class="ia-main-num" style="color:var(--gold)">${s.number ? s.number : '...'}<sup>n9</sup></div>
            </div>`;
        }

        const histDots = (iaSignalsHistory[activeIaTab] || []).slice(-10).map(h => `<span class="m-hist-badge ${h === 'win' ? 'm-hist-w' : 'm-hist-l'}">${h === 'win' ? 'W' : 'L'}</span>`).join('');
        topPanel.innerHTML = `<div class="ia-tabs-strip">${tabButtons}</div>${content}<div class="ia-pattern-strip">${histDots}</div>`;
    } catch (e) { console.error(e); }
}

async function submitNumber(val, silent = false, batchProcessing = false) {
    let n = parseInt(val || numInput.value);
    if (isNaN(n) || n < 0 || n > 36) return;
    if (!silent && !currentTableId) return alert('Selecciona una mesa primero.');
    
    if (!silent) {
        try { await apiPostSpin(currentTableId, n); } catch(e) { console.error(e); }
    }

    // 1. Evaluar señales anteriores
    lastIaSignals.forEach((s, idx) => {
        if (!s || s.confidence === '0%' || s.rule === 'STOP') return;
        let win = false;
        if (s.betZone && s.betZone.length > 0) win = s.betZone.includes(n);
        else if (s.number !== null) win = wheelDistance(n, s.number) <= (idx === 2 ? 4 : 9);
        
        if (win) iaWins[idx]++; else iaLosses[idx]++;
        iaSignalsHistory[idx].push(win ? 'win' : 'loss');
        if (activeIaTab === idx) { if (win) recommendedWin++; else recommendedLoss++; }
    });

    history.push(n);
    const sig = computeDealerSignature(history);
    const results = analyzeSpin(history, stats);
    const prox = projectNextRound(history, stats);
    const signals = getIAMasterSignals(prox, sig, history) || [];
    
    if (activeIaTab === 4 && latestAgent5Top !== null) {
        signals.push({ name: 'Célula', number: latestAgent5Top, confidence: 'MAX', rule: 'DB', reason: 'IA' });
    } else {
        while (signals.length < 5) signals.push(null);
    }
    
    lastIaSignals = signals;
    if (!batchProcessing) {
        renderHistory();
        renderSignalsPanel(signals, sig, n);
        numInput.value = '';
        numInput.focus();
    }
}

function wipeData() {
    history.length = 0;
    iaWins.fill(0); iaLosses.fill(0);
    recommendedWin = 0; recommendedLoss = 0;
    iaSignalsHistory.forEach(h => h.length = 0);
    renderHistory();
}

window.setActiveIaTab = (idx) => { activeIaTab = idx; submitNumber(null, true, false); };

submitBtn.addEventListener('click', () => submitNumber());
numInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNumber(); });
clearBtn.addEventListener('click', wipeData);
tableSelect.addEventListener('change', async () => {
    currentTableId = tableSelect.value;
    if (!currentTableId) return;
    const spins = await apiFetchHistory(currentTableId);
    wipeData();
    for (const s of spins) await submitNumber(s.number, true, true);
    const sig = computeDealerSignature(history);
    const prox = projectNextRound(history, stats);
    renderSignalsPanel(lastIaSignals, sig, history[history.length-1]);
});

async function loadTables() {
    const tables = await apiFetchTables();
    tableSelect.innerHTML = '<option value="">-- Seleccionar Mesa --</option>' + tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

document.addEventListener('DOMContentLoaded', loadTables);
