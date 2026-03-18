// ============================================================
// app.js — UI logic for Roulette Predictor v2
// ============================================================

const history      = [];
const stats        = {};
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

const auditStats = { 'N9': { w: 0, l: 0 }, 'N4_S': { w: 0, l: 0 }, 'N4_B': { w: 0, l: 0 } };

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

async function apiFetchTables() { const r = await fetch(`${API_BASE}/tables`); return r.json(); }
async function apiFetchHistory(tableId) { const r = await fetch(`${API_BASE}/history/${tableId}`); return r.json(); }
async function apiPostSpin(tableId, number) { const r = await fetch(`${API_BASE}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: tableId, number, source: 'manual' }) }); return r.json(); }
async function apiFetchPredict(tableId) { const r = await fetch(`${API_BASE}/predict/${tableId}`); return r.json(); }

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numColor(n) { if (n === 0) return 'green'; if (RED_NUMS.has(n)) return 'red'; return 'black'; }

function wheelDistance(a, b) {
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const iA = WHEEL_ORDER.indexOf(a), iB = WHEEL_ORDER.indexOf(b);
    let dist = Math.abs(iA - iB);
    return dist > 18 ? 37 - dist : dist;
}

function drawWheel(highlightNum = null) {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), cx = canvas.width / 2, cy = canvas.height / 2;
    const outerR = cx - 4, innerR = outerR * 0.52, slice = (2 * Math.PI) / 37;
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    WHEEL_ORDER.forEach((n, i) => {
        const ang = i * slice - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, outerR, ang, ang + slice);
        ctx.fillStyle = n === 0 ? '#00c77a' : (RED_NUMS.has(n) ? '#ff3b5c' : '#1a1a1a');
        ctx.fill();
        if (highlightNum === n) { ctx.lineWidth = 4; ctx.strokeStyle = '#f5c842'; ctx.stroke(); }
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang + slice/2);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
        ctx.fillText(n, outerR * 0.82, 4); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, 2*Math.PI); ctx.fillStyle = '#070c2a'; ctx.fill();
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

function buildStratTabs(results) {
    if (!stratTabs) return;
    if (!results) { stratTabs.innerHTML = ''; return; }
    stratTabs.innerHTML = results.map(r => {
        const isActive = r.strategy === activeTab;
        return `<button class="strat-tab ${isActive ? 'active' : ''}" onclick="activeTab='${r.strategy}'; submitNumber(null,true,false)">${r.strategy}</button>`;
    }).join('');
}

function renderTargetPanel(results) {
    if (!targetPanel) return;
    if (!results) { targetPanel.innerHTML = '<p class="muted">Ingresa datos...</p>'; return; }
    const r = results.find(x => x.strategy === activeTab) || results[0];
    targetPanel.innerHTML = `<div class="target-card"><h3>Estrategia ${r.strategy}</h3><div class="bet-zone">${r.betZone.join(', ')}</div></div>`;
}

function renderNextPanel(prox) {
    if (!nextPanel) return;
    nextPanel.innerHTML = prox.slice(0, 3).map(p => `<div>${p.strategy}: ${p.hitRate.toFixed(1)}%</div>`).join('');
}

function renderTravelPanel(sig) {
    if (!travelPanel) return;
    travelPanel.innerHTML = `<div>Tendencia: ${sig.directionState}</div><div>Rec: ${sig.recommendedPlay}</div>`;
}

function renderSignalsPanel(signals) {
    if (!topPanel) return;
    try {
        const names = ['n16','n17','1717','N18','Célula'];
        const tabButtons = names.map((name, idx) => `<button class="ia-tab ${idx === activeIaTab ? 'active' : ''}" onclick="setActiveIaTab(${idx})">${name}</button>`).join('');
        const s = signals[activeIaTab];
        let content = '<p class="muted">Sin señal.</p>';
        if (s) {
            content = `<div class="ia-active-slot">
                <div class="ia-slot-header"><span>${s.name}</span><span>${s.confidence || '0%'}</span></div>
                <div class="ia-main-num">${s.number !== null ? s.number : (s.tp || '...')}</div>
                <div class="ia-slot-footer">W:${iaWins[activeIaTab]} L:${iaLosses[activeIaTab]}</div>
            </div>`;
        }
        const dots = (iaSignalsHistory[activeIaTab] || []).slice(-10).map(h => `<span class="m-hist-badge ${h === 'win' ? 'm-hist-w' : 'm-hist-l'}">${h === 'win' ? 'W' : 'L'}</span>`).join('');
        topPanel.innerHTML = `<div class="ia-tabs-strip">${tabButtons}</div>${content}<div class="ia-pattern-strip">${dots}</div>`;
    } catch (e) { console.error(e); }
}

async function submitNumber(val, silent = false, batch = false) {
    let n = parseInt(val || numInput.value);
    if (isNaN(n) || n < 0 || n > 36) return;
    if (!silent) {
        history.push(n);
        try { const resp = await apiPostSpin(currentTableId, n); if (resp.predictions) latestAgent5Top = resp.predictions.agent5_top; } catch(e){}
    }
    const sig = computeDealerSignature(history), res = analyzeSpin(history, stats), prx = projectNextRound(history, stats), sigs = getIAMasterSignals(prx, sig, history) || [];
    sigs.push({ name: 'Célula', number: latestAgent5Top });
    lastIaSignals = sigs;
    if (!batch) {
        renderHistory(); drawWheel(n); buildStratTabs(res); renderTargetPanel(res); renderNextPanel(prx); renderTravelPanel(sig); renderSignalsPanel(sigs);
        numInput.value = ''; numInput.focus();
    }
}

function wipeData() { history.length = 0; iaWins.fill(0); iaLosses.fill(0); iaSignalsHistory.forEach(h => h.length = 0); renderHistory(); drawWheel(null); }
window.setActiveIaTab = (idx) => { activeIaTab = idx; submitNumber(null, true, false); };
submitBtn.addEventListener('click', () => submitNumber());
numInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNumber(); });
clearBtn.addEventListener('click', wipeData);
tableSelect.addEventListener('change', async () => {
    currentTableId = tableSelect.value; if (!currentTableId) return;
    const spins = await apiFetchHistory(currentTableId); wipeData();
    for (const s of spins) await submitNumber(s.number, true, true);
    submitNumber(null, true, false);
});
async function loadTables() { const ts = await apiFetchTables(); tableSelect.innerHTML = '<option value="">-- Mesa --</option>' + ts.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); }
document.addEventListener('DOMContentLoaded', () => { loadTables(); drawWheel(null); });
