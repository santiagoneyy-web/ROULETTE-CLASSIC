// Version bump 20240421

// app.js Ã¢ÂÂ SHADOW ROULETTE UI ENGINE
// ============================================================

const history = [];
const cwHistory = [];
const ccwHistory = [];
const cwN4History = [];
const ccwN4History = [];
const aiN9History = [];
const aiN4History = [];
let aiN9Stats = { wins: 0, losses: 0, total: 0, rate: 0 };
let aiN4Stats = { wins: 0, losses: 0, total: 0, rate: 0 };

let lastAiPredN9 = null;
let lastAiPredN4 = null;
let lastAiPredMode = 'SAFE';

function isResolvedAiOutcome(value) {
    return value === 'win' || value === 'loss';
}

window.currentAIMode = 'SAFE';
window.toggleAIMode = function() {
    const btn = document.getElementById('btn-ai-mode');
    const note = document.getElementById('auto-ai-mode-note');
    if (window.currentAIMode === 'SAFE') {
        window.currentAIMode = 'FULL';
        if(btn) { btn.innerText = 'FULL ACTIVO'; btn.style.background = 'rgba(255,100,100,0.15)'; btn.style.color = '#f55'; btn.style.borderColor = '#f55'; }
        if(note) note.innerText = 'FULL: siempre propone una jugada, incluso si la ventaja es corta o la mesa esta mixta.';
    } else {
        window.currentAIMode = 'SAFE';
        if(btn) { btn.innerText = 'SAFE FILTRA'; btn.style.background = 'rgba(240,192,64,0.15)'; btn.style.color = '#f0c040'; btn.style.borderColor = '#f0c040'; }
        if(note) note.innerText = 'SAFE: solo entra si la ventaja se ve clara. FULL: fuerza la mejor lectura disponible.';
    }
    if (typeof syncAiPredictionState === 'function') syncAiPredictionState();
};

let lastSignal  = null;
let currentTableId = null;

let lastOverHitCW  = false;
let lastUnderHitCW = false;
let lastOverHitCCW = false;
let lastUnderHitCCW = false;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ ZONE STATE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const zoneOverHistory = [];   
const zoneUnderHistory = [];
let lastZoneOverHit   = false;
let lastZoneUnderHit = false;

// Dynamic Reference Lines
let currentAvgCW = 9;
let currentAvgCCW = -9;
let predictorOffset = 0; // CALIBRACION MANUAL DEL PREDICTOR (+/- casillas)
let manualAvgOffset = 0; // CALIBRACION MANUAL DEL TRAVEL CHART

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ JUGADAS STATE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
let jugView = { magnitude: 'UNDER', direction: 'CW', confidence: 0 };
const jugHistory = [];
let lastJugHit = false;
let patternStatsCache = null;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ ANALYST STATE (V26) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const analystHistory = [];
let analystView = { signal: 'ANALIZANDO...', targetDir: null, size: null, reason: '-', type: 'neutral' };
let lastAnalystHit = false;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ MASTER SNIPER STATE (CONFLUENCE) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const masterHistory = [];
let masterView = { signal: 'SYNCHRONIZING...', target: null, confidence: 0, reasons: '-', type: 'neutral' };
let lastMasterHit = false;

// Pattern memory fetcher
async function fetchPatternMemory(historyArr) {
    if (historyArr.length < 5) return;
    
    const tableIdInput = document.getElementById('table-select');
    let tableId = 1;
    if (tableIdInput && tableIdInput.value) tableId = tableIdInput.value;
    
    // We need the sequence of 4 jumps (5 numbers)
    const last5 = historyArr.slice(-5);
    let seqMag = '';
    let seqDir = '';
    
    for (let i = 1; i < last5.length; i++) {
        const d = calcDist(last5[i-1], last5[i]);
        seqMag += Math.abs(d) >= 9 ? 'B' : 'S';
        seqDir += d >= 0 ? 'CW' : 'CCW';
    }
    
    try {
        const res = await fetch(`/api/patterns/${tableId}?seq_mag=${seqMag}&seq_dir=${seqDir}`);
        const data = await res.json();
        patternStatsCache = data;
        
        // Re-evaluate Sniper with new data
        if (typeof predictZonePattern === 'function') {
            jugView = predictZonePattern(historyArr, patternStatsCache);
            renderShadowPanel();
        }
    } catch (e) {
        console.error('Pattern fetch failed', e);
    }
}

const RED_NUMS  = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_NUMS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

function calcDist(from, to) {
    const i1 = WHEEL_NUMS.indexOf(from);
    const i2 = WHEEL_NUMS.indexOf(to);
    if (i1 === -1 || i2 === -1) return 0;
    let d = i2 - i1;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}


// HELPERS: WHEEL NEIGHBORS
const RED_NUMS_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numColorClass(n) { return n===0?'fn-zero':(RED_NUMS_SET.has(n)?'fn-red':'fn-black'); }
function getNeighbors(target, radius) {
    const idx = WHEEL_NUMS.indexOf(target);
    if (idx === -1) return [];
    const out = [];
    for (let i = -radius; i <= radius; i++) out.push(WHEEL_NUMS[(idx+i+37)%37]);
    return out;
}
function getFilteredNeighborsHTML(target, radius) {
    if (target===undefined||target===null||target==='--') return '';
    const all = getNeighbors(Number(target), radius);
    return all
        .map(n => `<span class="fn-ball ${numColorClass(n)}">${n}</span>`)
        .join('');
}
function renderShadowPanelNeighborsOnly() {
    try {
        if (lastSignal) {
            document.getElementById('dir-cw-c-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetCW, 9);
            document.getElementById('dir-cw-l-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetUnderCW, 4);
            document.getElementById('dir-cw-r-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetOverCW, 4);
            document.getElementById('dir-ccw-c-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetCCW, 9);
            document.getElementById('dir-ccw-l-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetUnderCCW, 4);
            document.getElementById('dir-ccw-r-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetOverCCW, 4);
        }
        if (history.length >= 2) {
            const idx = WHEEL_NUMS.indexOf(history[history.length-1]);
            const sT = WHEEL_NUMS[(idx+1+37)%37], bT = WHEEL_NUMS[(idx+19+37)%37];
            const sEl = document.getElementById('sup-s-c-balls');
            const bEl = document.getElementById('sup-b-c-balls');
            if (sEl) sEl.innerHTML = getFilteredNeighborsHTML(sT, 9);
            if (bEl) bEl.innerHTML = getFilteredNeighborsHTML(bT, 9);
        }
    } catch(e) { console.error('neighborsOnly:', e); }
}
function wipeData() {
    if (!confirm('\u{26A0} WIPE ALL DATA?')) return;
    fetch('/api/wipe-all', { method: 'DELETE' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(() => {
            history.length=0; cwHistory.length=0; ccwHistory.length=0;
            cwN4History.length=0; ccwN4History.length=0;
            aiN9History.length=0; aiN4History.length=0;
            aiN9Stats = { wins: 0, losses: 0, total: 0, rate: 0 };
            aiN4Stats = { wins: 0, losses: 0, total: 0, rate: 0 };
            lastAiPredN9 = null; lastAiPredN4 = null;
            zoneOverHistory.length=0; zoneUnderHistory.length=0;
            lastSignal=null;
            rawN9Wins=0; rawN9Losses=0; rawN4Wins=0; rawN4Losses=0;
            rawN9History.length=0; rawN4History.length=0;
            lastRawPredN9=null; lastRawPredN4=null;
            renderShadowPanel(); renderWheelAndHistory();
            alert('\u{2705} Base de datos operativa borrada.');
        }).catch(() => { history.length=0; cwHistory.length=0; ccwHistory.length=0; cwN4History.length=0; ccwN4History.length=0; aiN9History.length=0; aiN4History.length=0; aiN9Stats = { wins: 0, losses: 0, total: 0, rate: 0 }; aiN4Stats = { wins: 0, losses: 0, total: 0, rate: 0 }; lastAiPredN9 = null; lastAiPredN4 = null; lastSignal=null; rawN9Wins=0; rawN9Losses=0; rawN4Wins=0; rawN4Losses=0; rawN9History.length=0; rawN4History.length=0; lastRawPredN9=null; lastRawPredN4=null; renderShadowPanel(); renderWheelAndHistory(); });
}

function toggleAiHist(metricId, btn) {
    const panel = document.getElementById('ai-hist-' + metricId);
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    const opened = panel.style.display === 'block';
    if (btn) {
        btn.innerHTML = opened ? '&#9652;' : '&#9662;';
    }
}

function toggleDirMetricHistory(metricId, btn) {
    const panel = document.getElementById(`dir-${metricId}-hist-panel`);
    if (!panel) return;
    panel.classList.toggle('show');
    const opened = panel.classList.contains('show');
    if (btn) {
        const label = metricId.endsWith('n9') ? 'N9' : 'N4';
        btn.innerHTML = opened ? `${label} &#9652;` : `${label} &#9662;`;
        btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
    }
}

function getPerfHtml(items, limit = 12) {
    const recent = items.filter(isResolvedAiOutcome).slice(-limit);
    if (!recent.length) return '<span style="opacity:0.5">Sin datos</span>';
    return recent.map(r => {
        return `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`;
    }).join('');
}
function getAiModeStats(rows, metricKey) {
    const outcomes = rows
        .map(item => item[metricKey] || (isResolvedAiOutcome(item.result) ? item.result : null))
        .filter(isResolvedAiOutcome);
    const wins = outcomes.filter(item => item === 'win').length;
    const losses = outcomes.length - wins;
    const rate = outcomes.length ? Math.round((wins / outcomes.length) * 100) : 0;
    return { wins, losses, total: outcomes.length, records: outcomes.length, rate };
}
function getAiPerfHtml(items, stats, limit = 50) {
    const marks = getPerfHtml(items, limit);
    const summary = stats && stats.total > 0
        ? `<span style="margin-left:8px; color:var(--accent); font-weight:700;">${stats.rate}%</span><span style="margin-left:4px; color:var(--muted);">(${stats.wins}W/${stats.losses}L)</span>`
        : '<span style="margin-left:8px; color:var(--muted);">0%</span>';
    return marks + summary;
}

function getPerfText(items, limit = 8) {
    const recent = items.filter(isResolvedAiOutcome).slice(-limit);
    if (!recent.length) return 'Sin datos';
    return recent.map(r => r === 'win' ? 'W' : 'L').join('');
}

async function syncAiPredictionState() {
    if (!currentTableId) return;
    try {
        const mode = String(window.currentAIMode || 'SAFE').toUpperCase();
        const resp = await fetch(`/api/ai/predictions/${currentTableId}?limit=5000&mode=${mode}&basis=ai_analysis`);
        if (!resp.ok) return;
        const rows = await resp.json();
        const predictions = Array.isArray(rows) ? rows.slice().reverse() : [];

        aiN9History.length = 0;
        aiN4History.length = 0;
        aiN9Stats = getAiModeStats(predictions, 'n9_result');
        aiN4Stats = getAiModeStats(predictions, 'n4_result');
        lastAiPredN9 = null;
        lastAiPredN4 = null;

        predictions.forEach(item => {
            const n9Result = item.n9_result || (isResolvedAiOutcome(item.result) ? item.result : null);
            const n4Result = item.n4_result || (isResolvedAiOutcome(item.result) ? item.result : null);
            if (isResolvedAiOutcome(n9Result)) aiN9History.push(n9Result);
            if (isResolvedAiOutcome(n4Result)) aiN4History.push(n4Result);
        });
        if (aiN9History.length > 20) aiN9History.splice(0, aiN9History.length - 25);
        if (aiN4History.length > 20) aiN4History.splice(0, aiN4History.length - 25);

        const latestPending = predictions.slice().reverse().find(item => item.result === 'pending') || null;
        const latestAny = predictions.length ? predictions[predictions.length - 1] : null;
        const current = latestPending || latestAny;

        const n9El = document.getElementById('ai-pred-n9-text');
        const n4El = document.getElementById('ai-pred-n4-text');
        const statusEl = document.getElementById('ai-status');
        const analysisEl = document.getElementById('auto-ai-analysis');

        if (current) {
            lastAiPredN9 = current.n9 || null;
            lastAiPredN4 = current.n4 || null;
            lastAiPredMode = mode;
            if (n9El) n9El.innerText = current.n9 || 'Esperar';
            if (n4El) n4El.innerText = current.n4 || 'Esperar';
            if (analysisEl) analysisEl.innerText = current.analysis || 'Analisis AI sincronizado desde la base.';
            if (statusEl) statusEl.innerText = latestPending ? 'ONLINE' : 'STANDBY';
        } else {
            if (n9El) n9El.innerText = 'Sin datos';
            if (n4El) n4El.innerText = 'Sin datos';
            if (analysisEl) analysisEl.innerText = `${mode}: sin historial de aciertos todavia.`;
            if (statusEl) statusEl.innerText = 'STANDBY';
        }

        renderDirMetricHistories();
    } catch (e) {
        console.error('syncAiPredictionState:', e);
    }
}

async function syncRawPredictionState() {
    if (!currentTableId) return;
    try {
        const resp = await fetch(`/api/ai/predictions/${currentTableId}?limit=5000&mode=RAW&basis=ai_analysis`);
        if (!resp.ok) return;
        const rows = await resp.json();
        const predictions = Array.isArray(rows) ? rows.slice().reverse() : [];

        rawN9History.length = 0;
        rawN4History.length = 0;
        rawN9Wins = 0;
        rawN9Losses = 0;
        rawN4Wins = 0;
        rawN4Losses = 0;
        lastRawPredN9 = null;
        lastRawPredN4 = null;

        predictions.forEach(item => {
            const n9Result = item.n9_result || (isResolvedAiOutcome(item.result) ? item.result : null);
            const n4Result = item.n4_result || (isResolvedAiOutcome(item.result) ? item.result : null);
            if (isResolvedAiOutcome(n9Result)) {
                rawN9History.push(n9Result);
                if (n9Result === 'win') rawN9Wins++; else rawN9Losses++;
            }
            if (isResolvedAiOutcome(n4Result)) {
                rawN4History.push(n4Result);
                if (n4Result === 'win') rawN4Wins++; else rawN4Losses++;
            }
        });
        if (rawN9History.length > 20) rawN9History.splice(0, rawN9History.length - 25);
        if (rawN4History.length > 20) rawN4History.splice(0, rawN4History.length - 25);

        const latestPending = predictions.slice().reverse().find(item => item.result === 'pending') || null;
        const latestAny = predictions.length ? predictions[predictions.length - 1] : null;
        const current = latestPending || latestAny;

        const n9El = document.getElementById('raw-pred-n9-text');
        const n4El = document.getElementById('raw-pred-n4-text');
        const statusEl = document.getElementById('raw-status');
        const analysisEl = document.getElementById('raw-ai-analysis');

        if (current) {
            lastRawPredN9 = current.n9 || null;
            lastRawPredN4 = current.n4 || null;
            if (n9El) n9El.innerText = current.n9 || 'Esperar';
            if (n4El) n4El.innerText = current.n4 || 'Esperar';
            if (analysisEl) analysisEl.innerText = current.analysis || 'RAW: lectura desde la base.';
            if (statusEl) statusEl.innerText = latestPending ? 'ONLINE' : 'STANDBY';
        } else {
            if (n9El) n9El.innerText = 'Sin datos';
            if (n4El) n4El.innerText = 'Sin datos';
            if (analysisEl) analysisEl.innerText = 'RAW: sin historial todavia.';
            if (statusEl) statusEl.innerText = 'STANDBY';
        }

        updateRawStats();
    } catch (e) {
        console.error('syncRawPredictionState:', e);
    }
}

function renderDirMetricHistories() {
    const metrics = [
        { id: 'cw-n9', label: 'CW N9', items: cwHistory },
        { id: 'cw-n4', label: 'CW N4', items: cwN4History },
        { id: 'ccw-n9', label: 'CCW N9', items: ccwHistory },
        { id: 'ccw-n4', label: 'CCW N4', items: ccwN4History }
    ];

    const aiN9List = document.getElementById('ai-hist-list-n9');
    if (aiN9List) aiN9List.innerHTML = getAiPerfHtml(aiN9History, aiN9Stats, 20);
    const aiN4List = document.getElementById('ai-hist-list-n4');
    if (aiN4List) aiN4List.innerHTML = getAiPerfHtml(aiN4History, aiN4Stats, 20);

    metrics.forEach(metric => {
        const list = document.getElementById(`dir-${metric.id}-hist-list`);
        if (!list) return;
        const wins = metric.items.filter(x => x === 'win').length;
        const total = metric.items.length;
        const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
        list.innerHTML = `<div class="dir-hist-item"><span class="dir-hist-label">${metric.label}</span><span class="dir-hist-rate">${rate}%</span><span class="compact-perf">${getPerfHtml(metric.items)}</span></div>`;
    });
}


/// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ RENDER: UNIFIED PANEL Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function getZoneTargets(lastNum) {
    const idx = WHEEL_NUMS.indexOf(lastNum);
    if (idx === -1) return {};
    
    if (zoneView === 'OVER') {
        return {
            // OVER mode: Anchor is at +19 distance
            // Targets: Principal(+19), Soporte(+10), Inverso(-19)
            main:    WHEEL_NUMS[(idx + 19 + 37) % 37],
            support: WHEEL_NUMS[(idx + 10 + 37) % 37],
            inverse: WHEEL_NUMS[(idx - 19 + 37) % 37]
        };
    } else {
        // UNDER mode: Anchor is at 0/1/-1 distance
        // Targets: Principal(+1), Soporte(0), Inverso(-1)
        return {
            main:    WHEEL_NUMS[(idx + 1 + 37) % 37],
            support: lastNum,
            inverse: WHEEL_NUMS[(idx - 1 + 37) % 37]
        };
    }
}

function renderShadowPanel() {
    try {
    renderDirMetricHistories();
    // 1. DIR (ANDROID 1717)
    if (lastSignal) {
        // --- CW BLOCK ---
        document.getElementById('dir-cw-c-val').innerText = lastSignal.targetCW;
        document.getElementById('dir-cw-l-val').innerText = lastSignal.targetUnderCW;
        document.getElementById('dir-cw-r-val').innerText = lastSignal.targetOverCW;
        document.getElementById('dir-cw-l-hit').innerText = lastUnderHitCW ? 'Ã¢ÂÂ HIT' : '';
        document.getElementById('dir-cw-r-hit').innerText = lastOverHitCW ? 'Ã¢ÂÂ HIT' : '';

        // --- CCW BLOCK ---
        document.getElementById('dir-ccw-c-val').innerText = lastSignal.targetCCW;
        document.getElementById('dir-ccw-l-val').innerText = lastSignal.targetUnderCCW;
        document.getElementById('dir-ccw-r-val').innerText = lastSignal.targetOverCCW;
        document.getElementById('dir-ccw-l-hit').innerText = lastUnderHitCCW ? 'Ã¢ÂÂ HIT' : '';
        document.getElementById('dir-ccw-r-hit').innerText = lastOverHitCCW ? 'Ã¢ÂÂ HIT' : '';

        // Shared Tendency
        if (history.length >= 2) {
            const d = calcDist(history[history.length-2], history[history.length-1]);
            const trendTxt = `TEND: ${ d >= 0 ? 'DER Ã¢ÂÂº' : 'IZQ Ã¢ÂÂ»'}`;
            document.getElementById('dir-cw-trend').innerText = trendTxt;
            document.getElementById('dir-ccw-trend').innerText = trendTxt;
        }

        // CW Stats
        const last10cw = cwHistory.slice(-10);
        const winsCW   = last10cw.filter(x => x === 'win').length;
        document.getElementById('dir-cw-w').innerText = winsCW;
        document.getElementById('dir-cw-l').innerText = last10cw.length - winsCW;
        document.getElementById('dir-cw-rate').innerText = last10cw.length > 0 ? ((winsCW / last10cw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-cw-perf').innerHTML = last10cw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('') || '--';

        // CCW Stats
        const last10ccw = ccwHistory.slice(-10);
        const winsCCW   = last10ccw.filter(x => x === 'win').length;
        document.getElementById('dir-ccw-w').innerText = winsCCW;
        document.getElementById('dir-ccw-l').innerText = last10ccw.length - winsCCW;
        document.getElementById('dir-ccw-rate').innerText = last10ccw.length > 0 ? ((winsCCW / last10ccw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-ccw-perf').innerHTML = last10ccw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('') || '--';

        // --- NEIGHBOR BALLS: DISABLED (Per user request: remove "bolitas") ---
        document.getElementById('dir-cw-c-balls').innerHTML  = '';
        document.getElementById('dir-cw-l-balls').innerHTML  = '';
        document.getElementById('dir-cw-r-balls').innerHTML  = '';
        document.getElementById('dir-ccw-c-balls').innerHTML = '';
        document.getElementById('dir-ccw-l-balls').innerHTML = '';
        document.getElementById('dir-ccw-r-balls').innerHTML = '';
    }
    } catch (err) {
        document.body.innerHTML += `<div style="color:red;z-index:9999;position:fixed;top:50px">${err.stack}</div>`;
        console.error('Error in renderShadowPanel:', err); 
    }
}



// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ WHEEL DRAW Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function drawWheel(highlightNum = null) {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 65, cy = 65;
    ctx.clearRect(0, 0, 130, 130);
    const goldColor = '#f5c842';
    ctx.beginPath(); ctx.arc(cx, cy, 63, 0, Math.PI*2);
    ctx.fillStyle = '#1a1a1a'; ctx.fill();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.stroke();
    WHEEL_NUMS.forEach((n, i) => {
        const startAng = (i*(360/37)-90-(360/74))*(Math.PI/180);
        const endAng   = (i*(360/37)-90+(360/74))*(Math.PI/180);
        const midAng   = (i*(360/37)-90)*(Math.PI/180);
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(startAng)*35, cy+Math.sin(startAng)*35);
        ctx.arc(cx, cy, 60, startAng, endAng);
        ctx.lineTo(cx+Math.cos(endAng)*35, cy+Math.sin(endAng)*35);
        ctx.closePath();
        ctx.fillStyle = n===0 ? '#006600' : (RED_NUMS.has(n) ? '#c41e3a' : '#111');
        ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth=0.5; ctx.stroke();
        const rx = cx+Math.cos(midAng)*48, ry = cy+Math.sin(midAng)*48;
        ctx.save(); ctx.translate(rx,ry); ctx.rotate(midAng+Math.PI/2);
        ctx.fillStyle = n===highlightNum ? goldColor : '#fff';
        ctx.font = `bold ${n===highlightNum?9:7}px Inter`;
        ctx.textAlign = 'center'; ctx.fillText(n,0,3);
        ctx.restore();
        if (n === highlightNum) {
            ctx.beginPath(); ctx.arc(rx,ry,9,0,Math.PI*2);
            ctx.strokeStyle=goldColor; ctx.lineWidth=2;
            ctx.shadowBlur=12; ctx.shadowColor=goldColor;
            ctx.stroke(); ctx.shadowBlur=0;
        }
    });
    const gr = ctx.createRadialGradient(cx,cy,0,cx,cy,35);
    gr.addColorStop(0,'#3a3a3a'); gr.addColorStop(1,'#111');
    ctx.beginPath(); ctx.arc(cx,cy,35,0,Math.PI*2);
    ctx.fillStyle=gr; ctx.fill();
    ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.stroke();
}

function renderWheelAndHistory() {
    const strip = document.getElementById('history-strip-mini');
    if (!strip) return;
    const last10 = history.slice(-10).reverse();
    strip.innerHTML = last10.map(n => {
        const cls = n===0 ? 'ball-zero' : (RED_NUMS.has(n) ? 'ball-red' : 'ball-black');
        return `<div class="mini-ball ${cls}">${n}</div>`;
    }).join('');
    // drawWheel removed
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ TAB LISTENERS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
document.addEventListener('click', (e) => {
    const allTabs = ['tab-btn-dir', 'tab-btn-metricas', 'tab-btn-raw', 'tab-btn-scatter', 'tab-btn-auto', 'tab-btn-chat'];
    const allPanels = ['panel-dir', 'panel-metricas', 'panel-raw', 'panel-scatter', 'panel-auto', 'panel-chat'];
    const tabMap = { 'tab-btn-dir': 'panel-dir', 'tab-btn-metricas': 'panel-metricas', 'tab-btn-raw': 'panel-raw', 'tab-btn-scatter': 'panel-scatter', 'tab-btn-auto': 'panel-auto', 'tab-btn-chat': 'panel-chat' };
    
    if (e.target && tabMap[e.target.id]) {
        allTabs.forEach(t => { const el = document.getElementById(t); if(el) el.classList.remove('active'); });
        allPanels.forEach(p => { const el = document.getElementById(p); if(el) el.style.display = 'none'; });
        e.target.classList.add('active');
        const panel = document.getElementById(tabMap[e.target.id]);
        if (panel) panel.style.display = 'flex';
        renderShadowPanel();
        if (e.target.id === 'tab-btn-scatter') renderScatterChart();
        if (e.target.id === 'tab-btn-metricas') { renderMetricasPanel(); loadForestDiscoveries(); }
        if (e.target.id === 'tab-btn-raw') { updateRawStats(); renderRawHist(); requestRawAI(); }
        if (e.target.id === 'tab-btn-auto' && document.getElementById('ai-pred-n9-text')?.innerText.includes('Analizando')) { requestAutoAI(); }
    }
});

// ─── METRICAS PANEL ───────────────────────────────────────
const metricaScoresHistory = {}; // { metricId: [score, score, ...] }
let metricaLastScores = {}; // { metricId: lastScore }
const metricaHitCounts = {}; // { metricId: { wins: 0, losses: 0 } }
let lastEvalNumber = null;

function renderMetricasPanel() {
    if (!lastSignal || history.length < 2) {
        document.getElementById('metricas-stability').innerText = 'Sin datos';
        return;
    }
    
    const cw = lastSignal.targetCW;
    const ccw = lastSignal.targetCCW;
    const cwN4s = lastSignal.targetUnderCW;
    const cwN4b = lastSignal.targetOverCW;
    const ccwN4s = lastSignal.targetOverCCW;
    const ccwN4b = lastSignal.targetUnderCCW;
    
    const der = cwHistory.filter(x => x === 'win').length;
    const izq = ccwHistory.filter(x => x === 'win').length;
    const derTotal = cwHistory.length || 1;
    const izqTotal = ccwHistory.length || 1;
    const cwRate = Math.round((der / derTotal) * 100);
    const ccwRate = Math.round((izq / izqTotal) * 100);
    
    // DOM8 from recent history
    let domCW = 0, domCCW = 0, domBig = 0, domSmall = 0;
    for (let i = 1; i < Math.min(history.length, 9); i++) {
        const d = calcDist(history[i-1], history[i]);
        if (d >= 0) domCW++; else domCCW++;
        if (Math.abs(d) >= 9) domBig++; else domSmall++;
    }
    
    document.getElementById('met-dom-cw').innerText = domCW;
    document.getElementById('met-dom-ccw').innerText = domCCW;
    document.getElementById('met-dom-big').innerText = domBig;
    document.getElementById('met-dom-small').innerText = domSmall;
    
    // Stability
    const diff = Math.abs(domCW - domCCW);
    let stability, stabColor;
    if (diff >= 4) { stability = 'VERDE'; stabColor = '#00ff88'; }
    else if (diff >= 2) { stability = 'AMARILLA'; stabColor = '#f0c040'; }
    else { stability = 'ROJA'; stabColor = '#f55'; }
    document.getElementById('metricas-stability').innerText = stability;
    document.getElementById('metricas-stability').style.color = stabColor;
    
    // Score each metric
    const scores = {
        'cw_n9': (domCW * 3) + (der * 2) + cwRate / 10,
        'ccw_n9': (domCCW * 3) + (izq * 2) + ccwRate / 10,
        'cw_n4s': (domCW * 2) + (domSmall * 2) + cwRate / 10,
        'cw_n4b': (domCW * 2) + (domBig * 2) + cwRate / 10,
        'ccw_n4s': (domCCW * 2) + (domSmall * 2) + ccwRate / 10,
        'ccw_n4b': (domCCW * 2) + (domBig * 2) + ccwRate / 10
    };
    
    // Apply forest boosts
    if (typeof forestBoost !== 'undefined' && forestBoost) {
        Object.keys(forestBoost).forEach(k => {
            if (scores[k] !== undefined) scores[k] += forestBoost[k];
        });
    }
    
    // Track history for trends
    Object.keys(scores).forEach(k => {
        if (!metricaScoresHistory[k]) metricaScoresHistory[k] = [];
        metricaScoresHistory[k].push(scores[k]);
        if (metricaScoresHistory[k].length > 10) metricaScoresHistory[k].shift();
    });
    
    // Init hit counters
    Object.keys(scores).forEach(k => {
        if (!metricaHitCounts[k]) metricaHitCounts[k] = { wins: 0, losses: 0 };
    });
    
    // Check which metrics hit the last number
    const lastNum = history[history.length - 1];
    if (lastNum !== lastEvalNumber) {
        lastEvalNumber = lastNum;
        const targets = {
            'cw_n9': { target: cw, radius: 9 },
            'ccw_n9': { target: ccw, radius: 9 },
            'cw_n4s': { target: cwN4s, radius: 4 },
            'cw_n4b': { target: cwN4b, radius: 4 },
            'ccw_n4s': { target: ccwN4s, radius: 4 },
            'ccw_n4b': { target: ccwN4b, radius: 4 }
        };
        Object.entries(targets).forEach(([id, t]) => {
            if (t.target != null && typeof wheelNeighbors === 'function') {
                const hit = wheelNeighbors(t.target, t.radius).includes(lastNum);
                if (hit) metricaHitCounts[id].wins++;
                else metricaHitCounts[id].losses++;
            }
        });
    }
    
    // Update metric cards
    const cards = [
        { id: 'cw_n9', el: 'met-cw-n9-val', wl: 'met-cw-n9-wl', sc: 'met-cw-n9-score', str: 'met-cw-n9-streak', tr: 'met-cw-n9-trend', val: cw, wlData: cwHistory, color: '#00e5c8' },
        { id: 'ccw_n9', el: 'met-ccw-n9-val', wl: 'met-ccw-n9-wl', sc: 'met-ccw-n9-score', str: 'met-ccw-n9-streak', tr: 'met-ccw-n9-trend', val: ccw, wlData: ccwHistory, color: '#f55' },
        { id: 'cw_n4s', el: 'met-cw-n4s-val', wl: null, sc: 'met-cw-n4s-score', str: 'met-cw-n4s-streak', tr: 'met-cw-n4s-trend', val: cwN4s, wlData: null, color: '#8ff' },
        { id: 'cw_n4b', el: 'met-cw-n4b-val', wl: null, sc: 'met-cw-n4b-score', str: 'met-cw-n4b-streak', tr: 'met-cw-n4b-trend', val: cwN4b, wlData: null, color: '#8ff' },
        { id: 'ccw_n4s', el: 'met-ccw-n4s-val', wl: null, sc: 'met-ccw-n4s-score', str: 'met-ccw-n4s-streak', tr: 'met-ccw-n4s-trend', val: ccwN4s, wlData: null, color: '#f88' },
        { id: 'ccw_n4b', el: 'met-ccw-n4b-val', wl: null, sc: 'met-ccw-n4b-score', str: 'met-ccw-n4b-streak', tr: 'met-ccw-n4b-trend', val: ccwN4b, wlData: null, color: '#f88' }
    ];
    
    let bestScore = -1;
    let bestCard = null;
    let bestId = null;
    
    cards.forEach(c => {
        const el = document.getElementById(c.el);
        const scEl = document.getElementById(c.sc);
        const strEl = document.getElementById(c.str);
        const trEl = document.getElementById(c.tr);
        const score = scores[c.id] || 0;
        if (el) el.innerText = c.val != null ? c.val : '--';
        if (scEl) scEl.innerText = 's:' + score.toFixed(1);
        if (c.wl && document.getElementById(c.wl)) {
            document.getElementById(c.wl).innerText = getPerfText(c.wlData);
        }
        
        // Streak counter
        const hc = metricaHitCounts[c.id] || { wins: 0, losses: 0 };
        const hcTotal = hc.wins + hc.losses;
        if (strEl) strEl.innerText = hcTotal ? Math.round((hc.wins / hcTotal) * 100) + '%' : '--';
        if (strEl) strEl.style.color = hc.wins > hc.losses ? '#0f0' : hc.losses > hc.wins ? '#f55' : 'var(--text-dim)';
        
        // Trend arrow
        const prev = metricaLastScores[c.id] || 0;
        if (trEl) {
            if (score > prev + 0.5) trEl.innerText = '\u2191';
            else if (score < prev - 0.5) trEl.innerText = '\u2193';
            else trEl.innerText = '\u2192';
            trEl.style.color = score > prev + 0.5 ? '#0f0' : score < prev - 0.5 ? '#f55' : 'var(--text-dim)';
        }
        metricaLastScores[c.id] = score;
        
        // Highlight best
        const card = document.getElementById('met-' + c.id);
        if (card) {
            if (score > bestScore) { bestScore = score; bestCard = card; bestId = c.id; }
            card.style.borderColor = 'rgba(255,255,255,0.08)';
            card.style.boxShadow = 'none';
        }
    });
    
    // Best pick
    if (bestCard && bestId) {
        bestCard.style.borderColor = 'var(--gold)';
        bestCard.style.boxShadow = '0 0 8px rgba(240,192,64,0.2)';
        const bestMetric = cards.find(c => c.id === bestId);
        if (bestMetric) {
            const pickN9 = bestId.includes('n9') ? bestMetric.val : (bestId.includes('cw') ? cw : ccw);
            const pickN4 = bestId.includes('n4') ? bestMetric.val : (bestId.includes('cw') ? cwN4s : ccwN4s);
            document.getElementById('met-pick-text').innerText = 'N9: ' + pickN9 + ' | N4: ' + pickN4;
            document.getElementById('met-pick-reason').innerText = bestId.toUpperCase() + ' domina (s:' + bestScore.toFixed(1) + ')';
        }
    }
    
    // Confluence detector
    renderConfluence(scores, domCW, domCCW, domBig, domSmall, stability);
}

function renderConfluence(scores, domCW, domCCW, domBig, domSmall, stability) {
    const confDiv = document.getElementById('metricas-confluence');
    const confSignal = document.getElementById('met-confluence-signal');
    const confDetail = document.getElementById('met-confluence-detail');
    if (!confDiv || !confSignal || !confDetail) return;
    
    // Group metrics by direction
    const cwScore = (scores['cw_n9'] || 0) + (scores['cw_n4s'] || 0) + (scores['cw_n4b'] || 0);
    const ccwScore = (scores['ccw_n9'] || 0) + (scores['ccw_n4s'] || 0) + (scores['ccw_n4b'] || 0);
    const bigScore = (scores['cw_n4b'] || 0) + (scores['ccw_n4b'] || 0);
    const smallScore = (scores['cw_n4s'] || 0) + (scores['ccw_n4s'] || 0);
    
    const cwDom = domCW >= 5;
    const ccwDom = domCCW >= 5;
    const cwN9Hot = (scores['cw_n9'] || 0) > (scores['ccw_n9'] || 0) + 3;
    const ccwN9Hot = (scores['ccw_n9'] || 0) > (scores['cw_n9'] || 0) + 3;
    
    // Detect confluence types
    let confType = '', confColor = 'var(--text-dim)', confDesc = '';
    
    if (cwDom && cwN9Hot && cwScore > ccwScore * 1.5) {
        confType = 'FUERTE CW \u27A1';
        confColor = '#00e5c8';
        confDesc = 'DOM8 + Score + N9 coinciden en CW';
    } else if (ccwDom && ccwN9Hot && ccwScore > cwScore * 1.5) {
        confType = 'FUERTE CCW \u2B05';
        confColor = '#f55';
        confDesc = 'DOM8 + Score + N9 coinciden en CCW';
    } else if (cwScore > ccwScore * 1.3 && cwN9Hot) {
        confType = 'LEVE CW \u27A1';
        confColor = '#8ff';
        confDesc = 'Score CW domina con N9 caliente';
    } else if (ccwScore > cwScore * 1.3 && ccwN9Hot) {
        confType = 'LEVE CCW \u2B05';
        confColor = '#f88';
        confDesc = 'Score CCW domina con N9 caliente';
    } else if (stability === 'ROJA') {
        confType = 'SIN CONFLUENCIA';
        confColor = 'var(--text-dim)';
        confDesc = 'Mesa roja, esperar a que se defina';
    } else {
        confType = 'MIXTA';
        confColor = 'var(--gold)';
        confDesc = 'Metricas divididas. Observar.';
    }
    
    confDiv.style.display = 'block';
    confSignal.innerText = confType;
    confSignal.style.color = confColor;
    confDetail.innerText = confDesc + ' | CW:' + cwScore.toFixed(1) + ' vs CCW:' + ccwScore.toFixed(1);
    
    // Flash hit: highlight metric cards that just covered the last number
    const lastN = history[history.length - 1];
    cards.forEach(c => {
        const card = document.getElementById('met-' + c.id);
        if (!card || c.val == null) return;
        const radius = c.id.includes('n4') ? 4 : 9;
        if (typeof wheelNeighbors === 'function' && wheelNeighbors(c.val, radius).includes(lastN)) {
            card.style.transition = 'all 0.15s';
            card.style.boxShadow = '0 0 12px rgba(0,255,136,0.5)';
            card.style.borderColor = '#00ff88';
            setTimeout(() => {
                if (card.id !== bestId) {
                    card.style.boxShadow = 'none';
                    card.style.borderColor = 'rgba(255,255,255,0.08)';
                }
            }, 1200);
        }
    });
}

let forestBoost = {};

async function loadForestDiscoveries() {
    try {
        const resp = await fetch('/api/forest/discoveries');
        if (!resp.ok) return;
        const data = await resp.json();
        
        forestBoost = {};
        if (data.discoveries && data.discoveries.length > 0) {
            const discDiv = document.getElementById('metricas-discoveries');
            const listDiv = document.getElementById('metricas-discoveries-list');
            if (discDiv) discDiv.style.display = 'block';
            
            let html = '';
            data.discoveries.slice(0, 5).forEach(d => {
                forestBoost[d.metricId] = (forestBoost[d.metricId] || 0) + (d.score / 100) * 2;
                html += '<div style="margin:2px 0; font-size:8px;">' +
                    '<span style="color:var(--accent);">' + d.metricId.toUpperCase() + '</span> ' +
                    '<span style="color:var(--text-dim);">en</span> ' +
                    '<span style="color:var(--gold);">' + (d.context?.stability || '?').toUpperCase() + '</span>: ' +
                    '<strong>' + d.score + '%</strong> (' + d.wins + 'W/' + d.losses + 'L)' +
                    '</div>';
            });
            
            if (data.rlBestContexts && data.rlBestContexts.length > 0) {
                html += '<div style="margin-top:6px; font-size:9px; color:var(--accent);">RL: MEJORES CONTEXTOS</div>';
                data.rlBestContexts.forEach(c => {
                    html += '<div style="font-size:8px; color:var(--gold);">' +
                        c.winRate + '% en ' + c.total + ' spins → ' + c.topMetric.toUpperCase() +
                        '</div>';
                });
            }
            
            if (listDiv) listDiv.innerHTML = html || '--';
        }
        
        if (document.getElementById('panel-metricas')?.style.display !== 'none') {
            renderMetricasPanel();
        }
    } catch (e) { /* non-critical */ }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SUBMIT NUMBER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function submitNumber(val, silent = false, batch = false) {
    const raw = val !== undefined ? val : '';
    const n = parseInt(raw);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        // Evaluate previous predictions before pushing to history
        if (lastSignal && history.length > 0) {
            // Main CW prediction Ã¢ÂÂ evaluated at N9 (win radius 9, under/over radius 4)
            if (lastSignal.targetCW !== undefined) {
                const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
                cwHistory.push(distCW <= 9 ? 'win' : 'loss');
                
                // Dynamically evaluate hits against under/over targets at radius 4
                lastUnderHitCW = Math.abs(calcDist(n, lastSignal.targetUnderCW)) <= 4;
                lastOverHitCW  = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
                cwN4History.push((lastUnderHitCW || lastOverHitCW) ? 'win' : 'loss');
            }
            // Main CCW prediction Ã¢ÂÂ evaluated at N9 (9-ball neighborhood = radius 4)
            if (lastSignal.targetCCW !== undefined) {
                const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
                ccwHistory.push(distCCW <= 9 ? 'win' : 'loss');
                
                // Dynamically evaluate hits against under/over targets at radius 4
                lastUnderHitCCW = Math.abs(calcDist(n, lastSignal.targetUnderCCW)) <= 4;
                lastOverHitCCW  = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
                ccwN4History.push((lastUnderHitCCW || lastOverHitCCW) ? 'win' : 'loss');
            }
        }
        
        // Evaluate ZONE OVER prediction Ã¢ÂÂ Offset 14
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const overTarget = lastSignal ? lastSignal.targetOverCW : WHEEL_NUMS[(idxZ + 14 + 37) % 37];
                const distToT = Math.abs(calcDist(n, overTarget));
                lastZoneOverHit = (distToT <= 4);
                zoneOverHistory.push(lastZoneOverHit ? 'win' : 'loss');
            }
        }

        // Evaluate ZONE UNDER prediction Ã¢ÂÂ Offset 4
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const underTarget = lastSignal ? lastSignal.targetUnderCW : WHEEL_NUMS[(idxZ + 4 + 37) % 37];
                const distToT = Math.abs(calcDist(n, underTarget));
                lastZoneUnderHit = (distToT <= 4);
                zoneUnderHistory.push(lastZoneUnderHit ? 'win' : 'loss');
            }
        }

        // Evaluate JUGADAS prediction Ã¢ÂÂ only when ACTIVE (not charging)
        if (history.length >= 1 && jugView.isCharging === false) {
            const jump = calcDist(history[history.length - 1], n);
            const mag = Math.abs(jump);
            
            const hitMag = jugView.magnitude === 'UNDER' ? (mag <= 8 && mag >= 1) : (mag >= 9 && mag <= 18);
            const hitDir = jugView.direction === 'CW' ? (jump >= 0) : (jump < 0);
            
            lastJugHit = hitMag && hitDir;
            jugHistory.push(lastJugHit ? 'win' : 'loss');
        } else if (history.length >= 1) {
            lastJugHit = false; // Charging, no W/L recorded
        }

// Evaluate ANALYST prediction (TRADING)
        if (history.length >= 1 && analystView.targetDir) {
            const jump = calcDist(history[history.length - 1], n);
            const dirHit = (analystView.targetDir === 'CW' && jump >= 0) || (analystView.targetDir === 'CCW' && jump < 0);
            lastAnalystHit = dirHit;
            analystHistory.push(lastAnalystHit ? 'win' : 'loss');
        }

        // Evaluate MASTER SNIPER prediction
        if (history.length >= 1 && masterView.target) {
            const jump = calcDist(history[history.length - 1], n);
            const dirHit = (masterView.target === 'CW' && jump >= 0) || (masterView.target === 'CCW' && jump < 0);
            lastMasterHit = dirHit;
            masterHistory.push(lastMasterHit ? 'win' : 'loss');
        }

        history.push(n);

        // Compute new predictions (Se calculan siempre para que la historia de W/L se llene, incluso en lote)
        if (typeof computeDealerSignature === 'function' && history.length >= 3) {
            try {
                const sig  = computeDealerSignature(history);
                const prox = projectNextRound(history, {});
                const masterSignals = getIAMasterSignals(prox, sig, history, { cw: currentAvgCW, ccw: currentAvgCCW, offset: predictorOffset });
                if (masterSignals && masterSignals.length > 0) {
                    lastSignal = masterSignals[0];
                }
                
                // JUGADAS Sniper automatically reads the table
                if (typeof predictZonePattern === 'function') {
                    jugView = predictZonePattern(history, patternStatsCache);
                }

                // Analyst Agent calculation
                if (typeof analyzeTravelWave === 'function') {
                    const travels = [];
                    for (let i = 1; i < history.length; i++) travels.push(calcDist(history[i-1], history[i]));
                    analystView = analyzeTravelWave(travels);
                }

                // Master Sniper AI calculation (CONFLUENCE)
                if (typeof analyzeMasterConfluence === 'function') {
                    masterView = analyzeMasterConfluence(history, analystView, jugView, {});

                    // V5 Neural Overlay: If Agent 5 has Expert knowledge, it overrides
                    if (jugView.agent5_top_new && jugView.agent5_top_new.dnaMatch) {
                        masterView.signal = `Ã°ÂÂ§Â  NEURAL: ${jugView.agent5_top_new.direction}`;
                        masterView.reasons = jugView.agent5_top_new.reason;
                        masterView.confidence = Math.max(masterView.confidence, 90);
                        masterView.target = jugView.agent5_top_new.direction;
                    }

                    // Actualizar el motor de patrones del Travel Chart
                    updateTravelPatternUI();

                    if (typeof AIChat !== 'undefined' && masterView.reasons) {
                        AIChat.onNewSpin(n, { 
                            masterConfidence: masterView.confidence,
                            isRhythm: String(masterView.reasons).includes('RITMO'),
                            rhythmName: masterView.reasons
                        });
                    }
                }
            } catch(e) { console.error('Predict error:', e); }
        }

        // --- RENDER UPDATES (Always if not batch) ---
        if (!batch) {
            renderShadowPanel();
            renderWheelAndHistory();
            renderTravelPanel();
            renderAnalystUI();
            renderMasterUI();
            if (history.length > 0) fetchPatternMemory(history);
            
            // 🔥 Sync AI history to update W/L counters automatically
            if (typeof syncAiPredictionState === 'function') syncAiPredictionState();
            
            // Trigger new AI prediction (always, even in background)
            setTimeout(requestAutoAI, 800);
            
            // Update metricas panel if visible
            if (document.getElementById('panel-metricas')?.style.display !== 'none') {
                renderMetricasPanel();
                loadForestDiscoveries();
            }
            
            // Evaluate RAW predictions ALWAYS (even when panel hidden)
            evaluateRawPredictions(n);
            
            // Always generate new RAW prediction in background
            setTimeout(requestRawAI, 1000);
            
            // Update RAW panel if visible
            if (document.getElementById('panel-raw')?.style.display !== 'none') {
                updateRawStats();
            }
        }
    }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SCATTER CHART: DIRECTION DISPERSION (CUMULATIVE RANDOM WALK) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function renderScatterChart() {
    try {
        const canvas = document.getElementById('scatterChart');
        if (!canvas || history.length < 4) return;
        const ctx = canvas.getContext('2d');
        
        // Build cumulative direction data: CW=+1, CCW=-1
        const binaryDirs = [];
        const dirs = [];
        let cum = 0;
        for (let i = 1; i < history.length; i++) {
            const d = calcDist(history[i-1], history[i]);
            const dir = d >= 0 ? 1 : -1;
            binaryDirs.push(dir);
            cum += dir;
            dirs.push(cum);
        }
        if (dirs.length < 3) return;
        
        const numPoints = dirs.length;
        const pxPerPoint = 13;
        const totalW = Math.max(canvas.parentElement.offsetWidth || 400, numPoints * pxPerPoint + 60);
        canvas.width = totalW;
        canvas.style.width = totalW + 'px';
        const H = canvas.height;
        ctx.clearRect(0, 0, totalW, H);
        
        const padL = 35, padR = 40, padT = 20, padB = 20;
        const chartW = totalW - padL - padR;
        const chartH = H - padT - padB;
        
        // Dynamic symmetric Y scale for infinite bounds
        const maxAbs = Math.max(Math.abs(Math.max(...dirs)), Math.abs(Math.min(...dirs)), 3);
        const maxY = maxAbs + 1;
        const minY = -maxAbs - 1;
        const rangeY = maxY - minY;
        
        const scaleY = v => padT + chartH * ((maxY - v) / rangeY);
        const scaleX = i => padL + i * pxPerPoint;
        const midY = scaleY(0);
        
        // Background
        ctx.fillStyle = 'rgba(48, 224, 144, 0.03)'; ctx.fillRect(padL, padT, chartW, midY - padT);
        ctx.fillStyle = 'rgba(240, 64, 96, 0.03)'; ctx.fillRect(padL, midY, chartW, H - padB - midY);
        
        // Zero line
        ctx.strokeStyle = '#2a3a5d'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(totalW - padR, midY); ctx.stroke();
        ctx.fillStyle = '#4a6080'; ctx.font = '9px Inter'; ctx.textAlign = 'right';
        ctx.fillText(`+${maxAbs}`, padL - 5, padT + 6);
    ctx.fillText(`-${maxAbs}`, padL - 5, H - padB + 3);
        ctx.fillText('0', padL - 5, midY + 3);
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Moving Average (window=5) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        const maWindow = 5;
        const ma = [];
        for (let i = 0; i < dirs.length; i++) {
            const start = Math.max(0, i - maWindow + 1);
            const slice = dirs.slice(start, i + 1);
            ma.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Support / Resistance Detection Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        const maPeaks = [], maValleys = [];
        for (let i = 1; i < ma.length - 1; i++) {
            if (ma[i] > ma[i-1] && ma[i] > ma[i+1]) maPeaks.push(ma[i]);
            if (ma[i] < ma[i-1] && ma[i] < ma[i+1]) maValleys.push(ma[i]);
        }
        const resistance = maPeaks.length > 0 ? maPeaks[maPeaks.length - 1] : Math.max(0, ...dirs);
        const support = maValleys.length > 0 ? maValleys[maValleys.length - 1] : Math.min(0, ...dirs);
        
        // Draw latest support/resistance lines
        ctx.setLineDash([4, 4]);
        if (resistance > 0) {
            ctx.strokeStyle = 'rgba(48, 224, 144, 0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(padL, scaleY(resistance)); ctx.lineTo(totalW - padR + 5, scaleY(resistance)); ctx.stroke();
            ctx.fillStyle = 'rgba(48, 224, 144, 0.7)'; ctx.textAlign = 'left';
            ctx.fillText(`R:${resistance.toFixed(1)}`, totalW - padR + 8, scaleY(resistance) + 3);
        }
        if (support < 0) {
            ctx.strokeStyle = 'rgba(240, 64, 96, 0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(padL, scaleY(support)); ctx.lineTo(totalW - padR + 5, scaleY(support)); ctx.stroke();
            ctx.fillStyle = 'rgba(240, 64, 96, 0.7)'; ctx.textAlign = 'left';
            ctx.fillText(`S:${support.toFixed(1)}`, totalW - padR + 8, scaleY(support) + 3);
        }
        ctx.setLineDash([]);
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Moving Average Line (SUBTLE REFERENCE) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        ctx.strokeStyle = 'rgba(245, 200, 66, 0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
        ctx.beginPath();
        for (let i = 0; i < ma.length; i++) {
            const x = scaleX(i), y = scaleY(ma[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SHARP PEAKS LINE (ZIG-ZAG) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        ctx.strokeStyle = '#30e090'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (let i = 0; i < dirs.length; i++) {
            const x = scaleX(i), y = scaleY(dirs[i]);
            // Line color gradient simulation based on direction of segment
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke(); ctx.globalAlpha = 1.0;
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Scatter Points Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        for (let i = 0; i < numPoints; i++) {
            const x = scaleX(i), y = scaleY(dirs[i]);
            ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = binaryDirs[i] > 0 ? '#30e090' : '#f04060';
            ctx.fill();
            ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        
        // Last point highlight
        if (numPoints > 0) {
            const lx = scaleX(numPoints - 1), ly = scaleY(dirs[numPoints - 1]);
            ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.shadowBlur = 12; ctx.shadowColor = binaryDirs[numPoints - 1] > 0 ? '#30e090' : '#f04060';
            ctx.stroke(); ctx.shadowBlur = 0;
            
            // Value annotation on last point
            ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Inter'; ctx.textAlign = 'left';
            ctx.fillText(dirs[numPoints - 1] > 0 ? `+${dirs[numPoints - 1]}` : dirs[numPoints - 1], lx + 10, ly + 3);
        }
        
        // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Trend Detection Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
        const recent10 = binaryDirs.slice(-10);
        const cwRatio = recent10.filter(d => d > 0).length / recent10.length;
        let trendLabel = 'NEUTRAL';
        let trendColor = '#6a8aa8';
        if (cwRatio >= 0.7) { trendLabel = 'Ã°ÂÂÂ¼ TENDENCIA CW'; trendColor = '#30e090'; }
        else if (cwRatio <= 0.3) { trendLabel = 'Ã°ÂÂÂ½ TENDENCIA CCW'; trendColor = '#f04060'; }
        else if (cwRatio >= 0.55) { trendLabel = 'Ã¢ÂÂ SESGO CW LEVE'; trendColor = '#7ae0b0'; }
        else if (cwRatio <= 0.45) { trendLabel = 'Ã¢ÂÂ SESGO CCW LEVE'; trendColor = '#e07a90'; }
        
        const trendEl = document.getElementById('scatter-trend-label');
        if (trendEl) { trendEl.innerText = trendLabel; trendEl.style.color = trendColor; }
        
        const biasEl = document.getElementById('scatter-bias');
        if (biasEl) { biasEl.innerText = `${Math.round(cwRatio * 100)}% CW`; }
        
        // Scroll to rightmost point
        canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth;
        
    } catch(err) { console.error('Scatter chart error:', err); }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ TRAVEL PATTERN ANALYSIS (DOBLE EJE) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const travelPatternHistory = []; // ÃÂ­ÃÂ¡ltimos 8 episodios

// --- TRAVEL STABILITY COLORS ---
function detectSolidBlocks(events) {
    if (!events || events.length < 4) return false;
    var recent = events.slice(-10); var runs = []; var count = 1;
    for (var i = 1; i < recent.length; i++) {
        if (recent[i].dir === recent[i-1].dir && recent[i].zone === recent[i-1].zone) { count++; }
        else { runs.push(count); count = 1; }
    }
    runs.push(count);
    return runs.filter(function(r){return r>=2;}).length >= 2;
}
function getStabilityLevel(result, events) {
    if (!events || events.length === 0) return 'red';

    // Usar las ultimas 8 tiradas para el color de fondo
    var n8 = Math.min(events.length, 8);
    var last8 = events.slice(-n8);

    var derCount = 0, izqCount = 0, bigCount = 0, smallCount = 0;
    for (var i = 0; i < n8; i++) {
        if (last8[i].dir === 'DER') derCount++; else izqCount++;
        if (last8[i].zone === 'BIG') bigCount++; else smallCount++;
    }

    // Mayoria simple (mas de la mitad del total)
    var majDir = Math.max(derCount, izqCount) > (n8 / 2);
    var majZon = Math.max(bigCount, smallCount) > (n8 / 2);
    var domDirName = derCount >= izqCount ? 'DER' : 'IZQ';
    var domZonName = bigCount >= smallCount ? 'BIG' : 'SMALL';

    // Tendencia reciente: las ultimas 3 o 4 del mismo tipo
    var trend4 = last8.slice(-4);
    var trendDir = trend4.filter(function(e){ return e.dir === domDirName; }).length >= 3;
    var trendZon = trend4.filter(function(e){ return e.zone === domZonName; }).length >= 3;

    var doubleMaj = majDir && majZon;
    var strongDir = majDir && trendDir;
    var strongZon = majZon && trendZon;

    // VERDE: doble mayoria, o un eje fuerte con al menos mayoria en el otro
    if (doubleMaj) return 'green';
    if (strongDir && majZon) return 'green';
    if (strongZon && majDir) return 'green';
    if (detectSolidBlocks(last8)) return 'green';

    // AMARILLO: un eje con mayoria o tendencia emergente
    if (majDir || majZon || strongDir || strongZon) return 'yellow';

    return 'red';
}
function applyTravelStabilityColor(level) {
    // Ya no pintamos la columna ni el borde, solo el canvas
    var s = document.querySelector('.col-travel'); if (!s) return;
    s.style.background = 'transparent';
    s.style.borderLeft = 'none';
}

function analyzeTravelPattern(hist) {
    if (hist.length < 3) return { label: '-', tiradas: 0, emoji: '' };

    const events = [];
    for (let i = 1; i < hist.length; i++) {
        const d = calcDist(hist[i - 1], hist[i]);
        events.push({
            dir:  d >= 0 ? 'DER' : 'IZQ',
            zone: Math.abs(d) >= 9 ? 'BIG' : 'SMALL'
        });
    }

    const window = events.slice(-12);
    const N = window.length;
    if (N < 2) return { label: '-', tiradas: N, emoji: '' };

    const dirs  = window.map(e => e.dir);
    const zones = window.map(e => e.zone);

    // Helpers
    const getSolid = (arr) => N >= 3 && arr.slice(-N).every(x => x === arr[arr.length - 1]);
    const getZigzag = (arr) => {
        if (N < 4) return false;
        for (let i = 1; i < N; i++) if (arr[i] === arr[i - 1]) return false;
        return true;
    };
    const getPairs = (arr) => {
        if (N < 4) return false;
        let runs = [], c = 1;
        for(let i=1; i<N; i++) { if(arr[i]===arr[i-1]) c++; else { runs.push(c); c=1; } }
        runs.push(c);
        if (runs.length < 2 || runs[runs.length-1] > 2) return false;
        let prev = runs.slice(0, -1).slice(-3);
        if (prev.length === 0) return false;
        return prev.every(r => r === 2);
    };

    // DIR STATE
    const dirLast = dirs[dirs.length - 1];
    const derCount = dirs.filter(d => d === 'DER').length;
    const domDer = derCount / N >= 0.58;
    const domIzq = (N - derCount) / N >= 0.58;
    
    let dirState = 'INEST';
    if (getSolid(dirs)) dirState = `S:${dirLast}`;
    else if (getZigzag(dirs)) dirState = 'ZZ';
    else if (getPairs(dirs)) dirState = 'PARES';
    else if (domDer) dirState = 'DOM:DER';
    else if (domIzq) dirState = 'DOM:IZQ';

    // ZONE STATE
    const zoneLast = zones[zones.length - 1];
    const smallCount = zones.filter(z => z === 'SMALL').length;
    const domSmall = smallCount / N >= 0.58;
    const domBig = (N - smallCount) / N >= 0.58;

    let zoneState = 'INEST';
    if (getSolid(zones)) zoneState = `ZS:${zoneLast}`;
    else if (getZigzag(zones)) zoneState = 'ZZ';
    else if (getPairs(zones)) zoneState = 'PARES';
    else if (domSmall) zoneState = 'DOM:SMALL';
    else if (domBig) zoneState = 'DOM:BIG';

    // COMBINED LABEL
    let label = '';
    let emoji = '\\uD83D\\uDD39'; // Small blue diamond

    const getStr = (state, type) => {
        if (state.startsWith('S:')) return type === 'dir' ? `Dir ${state.split(':')[1]} SÃ³lida` : `Zona ${state.split(':')[1]} SÃ³lida`;
        if (state === 'ZZ') return 'Zigzag';
        if (state === 'PARES') return 'Pares';
        if (state.startsWith('DOM:')) return `Dom: ${state.split(':')[1]}`;
        return 'Inestable';
    };

    let dirStr = getStr(dirState, 'dir');
    let zonStr = getStr(zoneState, 'zon');

    if (dirState !== 'INEST' && zoneState !== 'INEST') {
        label = `${zonStr}, ${dirStr}`;
        emoji = '\\u2705'; // Check mark
    } else if (zoneState !== 'INEST') {
        label = `${zonStr}, Dir Inest.`;
        emoji = zoneState.includes('BIG') ? '\\uD83D\\uDD38' : '\\uD83D\\uDD39'; // Orange/Blue diamond
    } else if (dirState !== 'INEST') {
        label = `Zona Inest, ${dirStr}`;
        emoji = '\\uD83D\\uDD04'; // Refresh
    } else {
        label = 'Sin PatrÃ³n Claro';
        emoji = '\\u26A0'; // Warning
    }

    return { label, tiradas: N, emoji };
}

function updateTravelPatternUI() {
    if (history.length < 3) return;
    const result = analyzeTravelPattern(history);

    const labelEl = document.getElementById('travel-pattern-label');
    const tirasEl = document.getElementById('travel-pattern-count');
    const histEl  = document.getElementById('travel-pattern-hist');

    if (labelEl) labelEl.innerText = `Â· ${result.label}`;
    if (tirasEl) tirasEl.innerText = `${result.tiradas}t`;

    const current = travelPatternHistory[0];
    if (!current) {
        travelPatternHistory.unshift({ label: result.label, emoji: result.emoji, tiradas: result.tiradas });
    } else if (current.label !== result.label) {
        travelPatternHistory.unshift({ label: result.label, emoji: result.emoji, tiradas: result.tiradas });
        if (travelPatternHistory.length > 8) travelPatternHistory.length = 8;
    } else {
        current.tiradas = result.tiradas;
        current.emoji = result.emoji;
    }

    if (histEl) {
        histEl.innerHTML = travelPatternHistory.slice(0, 8).map(p =>
            `<div style="display:flex; justify-content:space-between; padding: 2px 0; font-size:10px; border-bottom:1px solid var(--border);">
                <span style="color:var(--text)">${p.emoji} ${p.label}</span>
                <span style="color:var(--muted); font-family:var(--mono);">${p.tiradas}t</span>
            </div>`
        ).join('') || `<div style="opacity:0.5; font-size:10px; text-align:center; padding:4px;">Sin historial todavia</div>`;
    }

    // Aplicar fondo de color segun estabilidad del Travel
    var evts = [];
    for (var _i = 1; _i < history.length; _i++) {
        var _d = calcDist(history[_i-1], history[_i]);
        evts.push({dir: _d >= 0 ? 'DER' : 'IZQ', zone: Math.abs(_d) >= 9 ? 'BIG' : 'SMALL'});
    }
    applyTravelStabilityColor(getStabilityLevel(result, evts));
}

function renderTravelChart() {
    try {
    const canvas = document.getElementById('travelChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const padL = isMobile ? 24 : 30, padR = isMobile ? 34 : 50, padT = 20, padB = 20;
    const H = canvas.height || 120;
    const parentW = (canvas.parentElement && canvas.parentElement.offsetWidth) || canvas.clientWidth || 420;
    const baseW = Math.max(120, Math.floor(parentW));
    
    // Build travel array
    const travels = [];
    for (let i = 1; i < history.length; i++) travels.push(calcDist(history[i-1], history[i]));
        if (history.length < 2 || travels.length < 1) {
            const W = baseW;
            canvas.width = W;
            canvas.style.width = W + 'px';
            ctx.clearRect(0, 0, W, H);
            // Draw placeholder axes
            ctx.strokeStyle = '#2a3a5d';
            ctx.lineWidth = 1;
            // X axis
            ctx.beginPath();
            ctx.moveTo(padL, H - padB);
            ctx.lineTo(W - padR, H - padB);
            ctx.stroke();
            // Y axis
            ctx.beginPath();
            ctx.moveTo(padL, padT);
            ctx.lineTo(padL, H - padB);
            ctx.stroke();
            // Text
            ctx.fillStyle = '#7a9bb8';
            ctx.font = '10px Inter';
            ctx.fillText('Sin datos', W/2, H/2);
            return;
        }
    
    // WINDOWED TRAVEL: fixed viewport (latest points only)
    const windowSize = isMobile ? 16 : 22;
    const dataStart = Math.max(0, travels.length - windowSize);
    const data = travels.slice(dataStart);
    const numPoints = data.length;

    const totalW = baseW;
    canvas.width = totalW;
    canvas.style.width = totalW + 'px';
    const W = totalW;
    ctx.clearRect(0, 0, W, H);

    // --- Fondo de color canvas segun estabilidad ---
    (function paintBg() {
        var _evts = [];
        for (var _ci = 1; _ci < history.length; _ci++) {
            var _cd = calcDist(history[_ci-1], history[_ci]);
            var _dir = _cd >= 0 ? 'DER' : 'IZQ';
            var _zon = Math.abs(_cd) >= 9 ? 'BIG' : 'SMALL';
            _evts.push({dir: _dir, zone: _zon});
        }
        var _pat = (typeof analyzeTravelPattern === "function") ? analyzeTravelPattern(history) : {label:"",tiradas:0};
        var _lvl = (typeof getStabilityLevel === "function") ? getStabilityLevel(_pat, _evts) : "red";
        var _bgMap = {
            green:  '#0C3824', // Puro verde atenuado (sin mezcla azul)
            yellow: '#3C3010',
            red:    '#3C1018'  // Puro rojo atenuado
        };
        ctx.fillStyle = _bgMap[_lvl] || _bgMap.red;
        ctx.fillRect(padL, padT, W - padL - padR, H - padT - padB);
    })();

    // Averages
    const cwVals = data.filter(d => d > 0);
    const ccwVals = data.filter(d => d < 0);
    let avgCW  = cwVals.length  > 0 ? cwVals.reduce((a,b)=>a+b,0)/cwVals.length   :  10;
    let avgCCW = ccwVals.length > 0 ? ccwVals.reduce((a,b)=>a+b,0)/ccwVals.length : -10;
    
    // APPLY MANUAL CALIBRATION (OFFSET)
    avgCW += manualAvgOffset;
    if (avgCCW < 0) avgCCW -= manualAvgOffset; // subtract expands the negative channel
    else avgCCW += manualAvgOffset;
    
    // Update Global References for logic classification
    currentAvgCW = avgCW;
    currentAvgCCW = avgCCW;

    const allAbs = data.map(d=>Math.abs(d));
    const avgAbs = allAbs.reduce((a,b)=>a+b,0)/allAbs.length;
    const stdDev = Math.sqrt(allAbs.reduce((a,b)=>a+Math.pow(b-avgAbs,2),0)/allAbs.length);
    const upperRange = avgCW  + stdDev;
    const lowerRange = avgCCW - stdDev;

    const chartW = W-padL-padR, chartH = H-padT-padB;
    const midY = padT + chartH/2;
    const maxVal = 18;
    const scaleY = v => midY - (v/maxVal)*(chartH/2);
    const pxPerPoint = (windowSize > 1) ? (chartW / (windowSize - 1)) : chartW;
    const scaleX = i => padL + i * pxPerPoint;

    // Update the offset UI badge
    const badgeCalib = document.getElementById('travel-avg-offset');
    if (badgeCalib) badgeCalib.innerText = `CALIB: ${manualAvgOffset >= 0 ? '+'+manualAvgOffset : manualAvgOffset}`;

    // Grid
    ctx.strokeStyle='rgba(255, 100, 0, 0.4)'; ctx.lineWidth=1; // Lineas limite en naranja
    [18, 10, -10, -18].forEach(v => {
        ctx.beginPath();ctx.moveTo(padL,scaleY(v));ctx.lineTo(W-padR,scaleY(v));ctx.stroke();
    });
    ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padL,midY); ctx.lineTo(W-padR,midY); ctx.stroke();

    // Y labels
    ctx.fillStyle='#4a6080';ctx.font='9px Inter';ctx.textAlign='right';
    [18, 10, -10, -18].forEach(v => {
        ctx.fillText(v>0?`+${v}`:`${v}`,padL-4,scaleY(v)+3);
    });
    ctx.fillText('0',padL-4,midY+3);
    // X labels removed per user request
// 
    // Range bands
//     ctx.setLineDash([4,4]);
//     ctx.strokeStyle='rgba(240,192,64,0.4)';ctx.lineWidth=1;
//     ctx.beginPath();ctx.moveTo(padL,scaleY(upperRange));ctx.lineTo(W-padR,scaleY(upperRange));ctx.stroke();
//     ctx.strokeStyle='rgba(100,180,255,0.4)';
//     ctx.beginPath();ctx.moveTo(padL,scaleY(lowerRange));ctx.lineTo(W-padR,scaleY(lowerRange));ctx.stroke();
//     ctx.setLineDash([]);
// 
    // AvgCW line (red)
//     ctx.strokeStyle='#f04060';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);
//     ctx.beginPath();ctx.moveTo(padL,scaleY(avgCW));ctx.lineTo(W-padR,scaleY(avgCW));ctx.stroke();
    // AvgCCW line (orange)
//     ctx.strokeStyle='#ff8c40';
//     ctx.beginPath();ctx.moveTo(padL,scaleY(avgCCW));ctx.lineTo(W-padR,scaleY(avgCCW));ctx.stroke();
//     ctx.setLineDash([]);
// 
    // Fill zones
//     ctx.fillStyle='rgba(48,224,144,0.04)';ctx.fillRect(padL,padT,chartW,chartH/2);
//     ctx.fillStyle='rgba(192,144,255,0.04)';ctx.fillRect(padL,midY,chartW,chartH/2);

    // Main line (SMOOTH WAVES V5)
    // Usamos curvas de BÃÂ©zier cÃÂ­ÃÂºbicas con puntos de control suavizados
    ctx.lineWidth=4; ctx.lineJoin='round'; ctx.lineCap='round';
    
    for(let i=0; i < numPoints - 1; i++){
        const x1 = scaleX(i), y1 = scaleY(data[i]);
        const x2 = scaleX(i+1), y2 = scaleY(data[i+1]);
        
        // Puntos de control para suavizado (Curva de BÃÂ©zier)
        const cpX = (x1 + x2) / 2;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
        
        // Color dinÃÂ¡mico segÃÂ­ÃÂºn la zona y pÃÂ©rdida de rango
        const val = data[i+1];
        if(val > upperRange || val < lowerRange) ctx.strokeStyle='#ffe600';
        else ctx.strokeStyle = val >= 0 ? '#00ffa2' : '#ff2a4b';
        
        // Sutil brillo en la lÃÂ­ÃÂ­nea
        ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Data points (Dots on the wave)
    for(let i=0;i<numPoints;i++){
        const x=scaleX(i),y=scaleY(data[i]);
        ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);
        ctx.fillStyle='#fff'; // Puntos blancos sobre la onda para contraste
        ctx.fill();ctx.strokeStyle='#0d1520';ctx.lineWidth=1;ctx.stroke();
    }
    // Last point highlight
    if(numPoints>0){
        const lx=scaleX(numPoints-1),ly=scaleY(data[numPoints-1]);
        ctx.beginPath();ctx.arc(lx,ly,6,0,Math.PI*2);
        ctx.strokeStyle='#fff';ctx.lineWidth=2;
        ctx.shadowBlur=8;ctx.shadowColor=data[numPoints-1]>=0?'#00ffa2':'#ff2a4b';
        ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle='#fff';ctx.font='bold 10px JetBrains Mono';ctx.textAlign='center';
        const v=data[numPoints-1];
        ctx.fillText((v>0?'+':'')+v,lx,ly-10);
    }
    // Legend
    const leg=[['#30e090','Travel'],['#f04060','Avg CW'],['#ff8c40','Avg CCW'],['#f5c842','Range']];
    let lx2=padL;
    ctx.font='8px Inter';
    leg.forEach(([color,label])=>{
        ctx.fillStyle=color;ctx.fillRect(lx2,5,8,8);
        ctx.fillStyle='#7a9bb8';ctx.textAlign='left';
        ctx.fillText(label,lx2+10,13);
        lx2+=ctx.measureText(label).width+22;
    });
    } catch(err) { console.error(err); }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ TRAVEL TABLE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function renderTravelPanel() {
    try {
        const tbody   = document.getElementById('travel-tbody');
    const patEl   = document.getElementById('travel-pattern');
    const lastZEl = document.getElementById('travel-last-zone');
    if (!tbody) return;

    if (history.length >= 3) {
        updateTravelPatternUI();
    }

    if (history.length < 2) {
        tbody.innerHTML = '<tr><td colspan="4" class="muted">Selecciona una mesa...</td></tr>';
        renderTravelChart();
        return;
    }

    // Pattern & SD badges using predictor.js
    if (patEl) {
        const dealerSig = computeDealerSignature(history);
        let pat = dealerSig.directionState;
        let patClass = 'badge-stable';
        
        if (pat === 'SÃÂ­Ã¢ÂÂLIDA') patClass = 'badge-solid';
        else if (pat === 'ZIGZAG') patClass = 'badge-zigzag';
        else if (pat === 'CHAOS') patClass = 'badge-zone'; // Red color for chaos
        
        patEl.textContent = pat;
        patEl.className = `badge ${patClass}`;
        
        const sdEl = document.getElementById('travel-sd');
        if (sdEl) {
            sdEl.textContent = `SD: ${dealerSig.stdDev || '0.0'}`;
            if (dealerSig.stdDev > 10) sdEl.style.borderColor = 'var(--red)';
            else if (dealerSig.stdDev > 6) sdEl.style.borderColor = 'var(--gold)';
            else sdEl.style.borderColor = 'var(--green)';
        }
    }

    const lastN = history[history.length - 1];
    if (lastZEl) {
        let label = "UNDER";
        const lastDist = (history.length >= 2) ? calcDist(history[history.length-2], history[history.length-1]) : 0;
        if (lastDist > 0) label = (lastDist >= currentAvgCW) ? "OVER" : "UNDER";
        else if (lastDist < 0) label = (lastDist <= currentAvgCCW) ? "OVER" : "UNDER";
        
        lastZEl.textContent = `LAST: ${label}`;
        lastZEl.style.color = label === 'OVER' ? 'var(--red)' : 'var(--green)';
    }

    tbody.innerHTML = history.slice(-50).reverse().map((n, i) => {
        const idxInHistory = history.length - 1 - i;
        const prev = history[idxInHistory - 1];
        const dist = (prev !== undefined) ? calcDist(prev, n) : 0;
        const absDist = Math.abs(dist);
        const dir  = dist > 0 ? 'DER.' : (dist < 0 ? 'IZQ.' : '--');
        const numClass = n===0 ? 'num-zero' : (RED_NUMS.has(n) ? 'num-red' : 'num-black');
        const dirClass = dist >= 0 ? 'dir-der' : 'dir-izq';
        let phaseHtml = '';
        if (dist !== 0) {
            const label = (absDist >= 9) ? "BIG" : "SMALL";
            const pClass = label.toLowerCase();
            phaseHtml = `<span class="phase-pill pill-${pClass}" style="background-color:${label==='BIG'?'var(--red)':'var(--green)'}; color:white;">${label}</span>`;
        }
        const isLast = (i === 0);
        return `<tr${isLast ? ' class="last-row"' : ''}>
            <td class="${numClass}">${n}</td>
            <td style="color:var(--text2)">${absDist}p</td>
            <td class="${dirClass}">${dir} <span style="font-size:9px;opacity:0.5">${dist >= 0 ? "&#8635;" : "&#8634;"}</span></td>
            <td>${phaseHtml}</td>
        </tr>`;
    }).join('');

    renderTravelChart(); } catch (err) { console.error(err); }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SYNC FROM SERVER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function syncData() {
    if (!currentTableId) return;
    try {
        const r = await fetch(`/api/history/${currentTableId}`);
        if (!r.ok) return;
        const spins = await r.json();
        if (spins.length !== history.length) {
            history.length = 0;
            cwHistory.length = 0;
            ccwHistory.length = 0;
            cwN4History.length = 0;
            ccwN4History.length = 0;
            aiN9History.length = 0;
            aiN4History.length = 0;
            lastAiPredN9 = null;
            lastAiPredN4 = null;
            lastSignal = null;
            
            // 1. Inyectar datos en lote
            for (const s of spins) submitNumber(s.number, true, true);
            
            // 2. Correr la IA una sola vez sobre todo el history ya armado
            if (typeof computeDealerSignature === 'function' && history.length >= 3) {
                try {
                    const sig  = computeDealerSignature(history);
                    const prox = projectNextRound(history, {});
                    const masterSignals = getIAMasterSignals(prox, sig, history);
                    if (masterSignals && masterSignals.length > 0) {
                        lastSignal = masterSignals[0];
                    }
                    if (typeof predictZonePattern === 'function') {
                        jugView = predictZonePattern(history, patternStatsCache);
                    }
                    if (history.length > 0) {
                        fetchPatternMemory(history);
                    }
                } catch(e) { console.error('Predict error on sync:', e); }
            }

            // 3. Renderizar vista final una sola vez
            renderShadowPanel();
    renderTravelPanel();
    applyUniformScale();
            renderWheelAndHistory();
            renderMasterUI();
        }
        await syncAiPredictionState();
    } catch(e) {}
}

let eventSource = null;
function connectSSE(tId) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    eventSource = new EventSource(`/api/events/${tId}`);
    eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'ping') return;
            if (data.type === 'batch_load') {
                console.log("\u{1F525} Lote recibido del bot. Resincronizando datos...");
                syncData();
                return;
            }
            if (data.type === 'new_spin' && data.number !== undefined) {
                // Instantly react to new live spins
                submitNumber(data.number, false, false);
            }
        } catch(err) {}
    };
}


function applyUniformScale() {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;

    // Keep real responsive sizing without artificial zoom gaps.
    shell.style.zoom = '1';
    shell.style.width = '100%';
    shell.style.maxWidth = '100%';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Neural Initialization V5
    if (typeof AIChat !== 'undefined') AIChat.init();
    
    // (Live clock interval removed)

    renderShadowPanel();
    renderTravelPanel();
    applyUniformScale();

    try {
        let ts = [];
        try {
            const r = await fetch('/api/tables');
            if (r.ok) ts = await r.json();
        } catch(err) { console.warn("Fetch tables failed, using fallback."); }

        if (!ts || ts.length === 0) {
            ts = [
                { id: 1, name: 'Auto Roulette' },
                { id: 2, name: 'Inmersive Roulette' }
            ];
        }

        const tableSelect = document.getElementById('table-select');
        if (tableSelect) {
            tableSelect.innerHTML = '';
            ts.forEach(t => {
                const opt = document.createElement('option');
                opt.value = String(t.id);
                opt.textContent = t.name;
                tableSelect.appendChild(opt);
            });

            tableSelect.onchange = async () => {
                currentTableId = tableSelect.value;
                const tImg = document.querySelector('.table-image-container img');
                if (tImg) tImg.src = currentTableId == "1" ? 'table-1.jpg' : 'table-2.jpg';

                history.length = 0;
                cwHistory.length = 0;
                ccwHistory.length = 0;
                cwN4History.length = 0;
                ccwN4History.length = 0;
                aiN9History.length = 0;
                aiN4History.length = 0;
                lastAiPredN9 = null;
                lastAiPredN4 = null;
                lastSignal = null;
                renderWheelAndHistory();
                await syncData();
                connectSSE(currentTableId);
            };

            // Force Load Initial
            currentTableId = String(ts[0].id);
            tableSelect.value = currentTableId;
            const tImgInit = document.querySelector('.table-image-container img');
            if (tImgInit) tImgInit.src = currentTableId == "1" ? 'table-1.jpg' : 'table-2.jpg';

            await syncData();
            connectSSE(currentTableId);
        }
    } catch (e) {
        console.error('Boot error:', e);
    }
});
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ ANALYST UI RENDERER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function renderAnalystUI() {
    const boxEl    = document.getElementById('analyst-panel');
    const signalEl = document.getElementById('analyst-signal');
    const dirEl    = document.getElementById('analyst-dir');
    const sizeEl   = document.getElementById('analyst-size');
    const reasonEl = document.getElementById('analyst-reason');
    const rateEl   = document.getElementById('analyst-rate');
    const perfEl   = document.getElementById('analyst-perf-string');

    if (!signalEl) return;

    // Reset classes
    signalEl.className = 'analyst-signal';
    boxEl.setAttribute('data-type', analystView.type || 'neutral');

    // Signal & Special CSS Classes
    signalEl.innerText = analystView.signal;
    if (analystView.signal.includes('FRACTAL')) signalEl.classList.add('fractal');
    else if (analystView.signal.includes('CANAL')) signalEl.classList.add('channel');
    else if (analystView.signal.includes('RUPTURA')) signalEl.classList.add('breakout');
    else if (analystView.signal.includes('COMPRESIÃÂ­Ã¢ÂÂN')) signalEl.classList.add('compression');

    if (analystView.type === 'bullish') signalEl.style.color = 'var(--green)';
    else if (analystView.type === 'bearish') signalEl.style.color = 'var(--red)';
    else if (!signalEl.classList.contains('fractal')) signalEl.style.color = '#fff';

    // Badges
    if (analystView.targetDir) {
        dirEl.innerText = analystView.targetDir === 'CW' ? 'DER.' : 'IZQ.';
        dirEl.style.display = 'inline-block';
        dirEl.style.background = analystView.targetDir === 'CW' ? 'rgba(48,224,144,0.15)' : 'rgba(192,144,255,0.15)';
        dirEl.style.color = analystView.targetDir === 'CW' ? 'var(--green)' : '#d1abff';
        dirEl.style.borderColor = analystView.targetDir === 'CW' ? 'rgba(48,224,144,0.4)' : 'rgba(192,144,255,0.4)';
    } else {
        dirEl.style.display = 'none';
    }

    if (analystView.size) {
        sizeEl.innerText = analystView.size;
        sizeEl.style.display = 'inline-block';
    } else {
        sizeEl.style.display = 'none';
    }

    // Reason
    reasonEl.innerText = analystView.reason;

    // Stats
    const last10 = analystHistory.slice(-10);
    const wins = last10.filter(x => x === 'win').length;
    const rate = last10.length > 0 ? ((wins / last10.length) * 100).toFixed(0) : 0;
    
    rateEl.innerText = `${rate}%`;
    perfEl.innerHTML = last10.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ MASTER UI RENDERER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function renderMasterUI() {
    const signalEl = document.getElementById('master-signal');
    const targetEl = document.getElementById('master-target');
    const reasonEl = document.getElementById('master-reason');
    const confText = document.getElementById('master-conf-text');
    const confFill = document.getElementById('master-conf-fill');
    const rateEl   = document.getElementById('master-rate');
    const perfEl   = document.getElementById('master-perf');

    if (!signalEl) return;

    signalEl.innerText = masterView.signal;
    targetEl.innerText = masterView.target ? (masterView.target === 'CW' ? 'DERECHA' : 'IZQUIERDA') : '--';
    reasonEl.innerText = masterView.reasons || 'Analizando flujos...';
    
    // Confidence
    confText.innerText = `${masterView.confidence}%`;
    confFill.style.width = `${masterView.confidence}%`;

    // Colors
    if (masterView.confidence >= 80) {
        signalEl.style.color = '#ffeb3b';
        confFill.style.background = 'linear-gradient(90deg, #ffeb3b, #fff)';
    } else {
        signalEl.style.color = '#fff';
        confFill.style.background = 'linear-gradient(90deg, #555, #888)';
    }

    // Stats
    const last10 = masterHistory.slice(-10);
    const wins = last10.filter(x => x === 'win').length;
    const rate = last10.length > 0 ? ((wins / last10.length) * 100).toFixed(0) : 0;
    
    rateEl.innerText = `${rate}%`;
    perfEl.innerHTML = last10.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ TOGGLE TRAVEL TABLE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
document.addEventListener('DOMContentLoaded', () => {
    const btnCollapse = document.getElementById('toggle-travel-table');
    if (btnCollapse) {
        btnCollapse.addEventListener('click', (e) => {
            const wrap = document.getElementById('travel-table-wrap');
            if (wrap.style.display === 'none') {
                wrap.style.display = 'block';
                e.target.innerText = 'Ã¢ÂÂ² CERRAR HISTORIAL Ã¢ÂÂ²';
            } else {
                wrap.style.display = 'none';
                e.target.innerText = 'Ã¢ÂÂ¼ ABRIR HISTORIAL DE RUTAS Ã¢ÂÂ¼';
            }
        });
    }

    // Botones de Patrones
    document.getElementById('travel-history-toggle')?.addEventListener('click', function() {
        const wrap = document.getElementById('travel-pattern-hist');
        if (!wrap) return;
        if (wrap.classList.contains('hidden')) {
            wrap.classList.remove('hidden');
            this.innerHTML = '&#9652;';
            this.setAttribute('aria-expanded', 'true');
        } else {
            wrap.classList.add('hidden');
            this.innerHTML = '&#9662;';
            this.setAttribute('aria-expanded', 'false');
        }
    });

    window.addEventListener('resize', () => {
        applyUniformScale();
        if (history.length >= 2) renderTravelChart();
    });

    // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Botones de CalibraciÃÂ³n del PREDICTOR ÃÂ±1 casilla Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
    function updatePredBadge() {
        const badge = document.getElementById('pred-offset-badge');
        if (badge) {
            badge.innerText = predictorOffset === 0 ? '0' : ((predictorOffset > 0 ? '+' : '') + predictorOffset);
            badge.style.color = predictorOffset !== 0 ? '#f0c040' : '#00e5c8';
        }
    }
    document.getElementById('btn-pred-inc')?.addEventListener('click', () => {
        predictorOffset += 1;
        updatePredBadge();
        if (history.length >= 3 && typeof computeDealerSignature === 'function') {
            const sig = computeDealerSignature(history);
            const prox = projectNextRound(history, {});
            const sigs = getIAMasterSignals(prox, sig, history, { cw: currentAvgCW, ccw: currentAvgCCW, offset: predictorOffset });
            if (sigs && sigs.length > 0) { 
                lastSignal = sigs[0]; 
                renderShadowPanel(); 
            }
        }
    });
    document.getElementById('btn-pred-dec')?.addEventListener('click', () => {
        predictorOffset -= 1;
        updatePredBadge();
        if (history.length >= 3 && typeof computeDealerSignature === 'function') {
            const sig = computeDealerSignature(history);
            const prox = projectNextRound(history, {});
            const sigs = getIAMasterSignals(prox, sig, history, { cw: currentAvgCW, ccw: currentAvgCCW, offset: predictorOffset });
            if (sigs && sigs.length > 0) { 
                lastSignal = sigs[0]; 
                renderShadowPanel(); 
            }
        }
    });
});

















// --- AUTO AI PREDICTORS VIA GROQ ---
let autoAiInFlight = false;
let lastAutoAiRequestAt = 0;
let lastAutoAiRequestKey = '';
const AUTO_AI_MIN_INTERVAL_MS = 12000;

// --- RAW AI (separate panel, own counters) ---
const rawN9History = [];
const rawN4History = [];
let rawN9Wins = 0, rawN9Losses = 0;
let rawN4Wins = 0, rawN4Losses = 0;
let lastRawPredN9 = null, lastRawPredN4 = null;
let rawAiInFlight = false;

function updateRawStats() {
    const n9Total = rawN9Wins + rawN9Losses;
    const n4Total = rawN4Wins + rawN4Losses;
    const eN9 = document.getElementById('raw-stats-inline-n9');
    const eN4 = document.getElementById('raw-stats-inline-n4');
    if (eN9) eN9.innerText = (n9Total ? Math.round((rawN9Wins / n9Total) * 100) : 0) + '% (' + rawN9Wins + 'W/' + rawN9Losses + 'L)';
    if (eN4) eN4.innerText = (n4Total ? Math.round((rawN4Wins / n4Total) * 100) : 0) + '% (' + rawN4Wins + 'W/' + rawN4Losses + 'L)';
}

function toggleRawHist(side, btn) {
    const panel = document.getElementById('raw-hist-' + side);
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (btn) btn.innerHTML = panel.style.display === 'none' ? '&#9662;' : '&#9652;';
    if (side === 'n9') {
        const list = document.getElementById('raw-hist-list-n9');
        if (list) list.innerHTML = getAiPerfHtml(rawN9History, { wins: rawN9Wins, losses: rawN9Losses, total: rawN9Wins + rawN9Losses, rate: rawN9Wins + rawN9Losses ? Math.round((rawN9Wins / (rawN9Wins + rawN9Losses)) * 100) : 0 }, 20);
    } else {
        const list = document.getElementById('raw-hist-list-n4');
        if (list) list.innerHTML = getAiPerfHtml(rawN4History, { wins: rawN4Wins, losses: rawN4Losses, total: rawN4Wins + rawN4Losses, rate: rawN4Wins + rawN4Losses ? Math.round((rawN4Wins / (rawN4Wins + rawN4Losses)) * 100) : 0 }, 20);
    }
}

function renderRawHist() {
    // Keep for compatibility, toggleRawHist handles it now
}

function evaluateRawPredictions(number) {
    // Quick client-side hit check for immediate feedback
    if (lastRawPredN9 && lastRawPredN9 !== 'ESPERAR' && typeof wheelNeighbors === 'function') {
        const n9Hit = wheelNeighbors(Number(lastRawPredN9), 9).includes(number);
        if (n9Hit) { rawN9Wins++; rawN9History.push('win'); }
        else { rawN9Losses++; rawN9History.push('loss'); }
        if (rawN9History.length > 20) rawN9History.shift();
    }
    if (lastRawPredN4 && lastRawPredN4 !== 'ESPERAR' && typeof wheelNeighbors === 'function') {
        const n4Hit = wheelNeighbors(Number(lastRawPredN4), 4).includes(number);
        if (n4Hit) { rawN4Wins++; rawN4History.push('win'); }
        else { rawN4Losses++; rawN4History.push('loss'); }
        if (rawN4History.length > 20) rawN4History.shift();
    }
    updateRawStats();
    
    // Also sync from DB for accuracy
    if (typeof syncRawPredictionState === 'function') syncRawPredictionState();
}

async function requestRawAI() {
    if (rawAiInFlight || !lastSignal || history.length < 3) return;
    if (Date.now() - lastAutoAiRequestAt < 8000) return;
    
    rawAiInFlight = true;
    lastAutoAiRequestAt = Date.now();
    
    const n9El = document.getElementById('raw-pred-n9-text');
    const n4El = document.getElementById('raw-pred-n4-text');
    const statusEl = document.getElementById('raw-status');
    const analysisEl = document.getElementById('raw-ai-analysis');
    
    if (statusEl) statusEl.innerText = 'PENSANDO...';
    
    try {
        // Calculate DOM8 and MOM15 properly (same as requestAutoAI)
        let der=0, izq=0, big=0, small=0;
        let der15=0, izq15=0, big15=0, small15=0;
        let dirSeq15 = [], zoneSeq15 = [];
        let lvl = 'red';
        let pat = {label:'Estandar'};
        
        // DOM8: last 8 travel directions
        const nCount = Math.min(history.length - 1, 8);
        for (let i = history.length - nCount; i < history.length; i++) {
            let d = calcDist(history[i-1], history[i]);
            if (d >= 0) der++; else izq++;
            if (Math.abs(d) >= 10) big++; else small++;
        }
        // MOM15: last 15
        const nCount15 = Math.min(history.length - 1, 15);
        for (let i = history.length - nCount15; i < history.length; i++) {
            let d = calcDist(history[i-1], history[i]);
            if (d >= 0) { der15++; dirSeq15.push('DER'); } else { izq15++; dirSeq15.push('IZQ'); }
            if (Math.abs(d) >= 10) { big15++; zoneSeq15.push('BIG'); } else { small15++; zoneSeq15.push('SMALL'); }
        }
        
        try {
            pat = (typeof analyzeTravelPattern === 'function') ? analyzeTravelPattern(history) : {label:'Estandar'};
            lvl = (typeof getStabilityLevel === 'function') ? getStabilityLevel(pat, []) : 'red';
        } catch(e) {}
        
        const cwRate = cwHistory.length ? Math.round((cwHistory.filter(x => x === 'win').length / cwHistory.length) * 100) : 0;
        const ccwRate = ccwHistory.length ? Math.round((ccwHistory.filter(x => x === 'win').length / ccwHistory.length) * 100) : 0;
        
        const autoAiContext = lastSignal ? {
            mode: 'RAW',
            stabilityLevel: lvl,
            patternLabel: pat.label || 'Estandar',
            dominance8: { cw: der, ccw: izq, big: big, small: small },
            momentum15: { cw: der15, ccw: izq15, big: big15, small: small15 },
            sequence15: {
                dir: dirSeq15.join(' '),
                zone: zoneSeq15.join(' ')
            },
            performance8: {
                cwN9: getPerfText(cwHistory),
                cwN4: getPerfText(cwN4History),
                ccwN9: getPerfText(ccwHistory),
                ccwN4: getPerfText(ccwN4History)
            },
            routes: {
                cw: { n9: lastSignal.targetCW, n4Small: lastSignal.targetUnderCW, n4Big: lastSignal.targetOverCW, hitRate: Number(cwRate) },
                ccw: { n9: lastSignal.targetCCW, n4Small: lastSignal.targetOverCCW, n4Big: lastSignal.targetUnderCCW, hitRate: Number(ccwRate) }
            },
            recentNumbers: history.slice(-15)
        } : null;
        
        const resp = await fetch('/api/ai/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: '', tableId: currentTableId, autoAiContext })
        });
        const data = await resp.json();
        
        if (data.reply) {
            // Always sync from DB for proper counting (server-side normalized)
            if (typeof syncRawPredictionState === 'function') syncRawPredictionState();
        } else {
            n9El.innerText = 'Error API';
            n4El.innerText = 'Error API';
        }
    } catch (e) {
        console.error('RAW AI error:', e);
        if (statusEl) statusEl.innerText = 'ERROR';
    } finally {
        rawAiInFlight = false;
    }
}

async function requestAutoAI() {
    const n9El = document.getElementById('ai-pred-n9-text');
    const n4El = document.getElementById('ai-pred-n4-text');
    const statusEl = document.getElementById('ai-status');
    const analysisEl = document.getElementById('auto-ai-analysis');
    if (!n9El || !n4El) return;

    if (history.length < 2) {
        n9El.innerText = "Esperando tiradas...";
        n4El.innerText = "Esperando tiradas...";
        return;
    }

    if (!lastSignal || lastSignal.targetCW === undefined || lastSignal.targetCCW === undefined) {
        n9El.innerText = "Esperando DIR...";
        n4El.innerText = "Esperando DIR...";
        if (analysisEl) analysisEl.innerText = 'Esperando las 6 medidas del panel DIR para decidir ruta y zona.';
        return;
    }

    const tableId = document.getElementById('table-select')?.value || '1';
    const requestKey = [
        tableId,
        String(window.currentAIMode || 'SAFE').toUpperCase(),
        history.slice(-6).join('-'),
        lastSignal.targetCW,
        lastSignal.targetCCW,
        lastSignal.targetUnderCW,
        lastSignal.targetOverCW,
        lastSignal.targetOverCCW,
        lastSignal.targetUnderCCW
    ].join('|');
    const now = Date.now();
    if (autoAiInFlight || (requestKey === lastAutoAiRequestKey && now - lastAutoAiRequestAt < AUTO_AI_MIN_INTERVAL_MS)) {
        return;
    }
    autoAiInFlight = true;
    lastAutoAiRequestAt = now;
    lastAutoAiRequestKey = requestKey;

    if (statusEl) statusEl.innerText = 'THINKING';
    
    let der=0, izq=0, big=0, small=0;
    let der15=0, izq15=0, big15=0, small15=0;
    let lvl = 'red';
    let pat = {label:'Estandar'};
    
    try {
        let stabilityInfo = '';
        try {
            let evts = [];
            const nCount = Math.min(history.length - 1, 8);
            for (let i = history.length - nCount; i < history.length; i++) {
                let d = calcDist(history[i-1], history[i]);
                const dir = d >= 0 ? 'DER' : 'IZQ';
                const zon = Math.abs(d) >= 10 ? 'BIG' : 'SMALL';
                evts.push({dir, zone: zon});
                if(dir==='DER') der++; else izq++;
                if(zon==='BIG') big++; else small++;
            }

            let dirSeq15 = [];
            let zoneSeq15 = [];
            const nCount15 = Math.min(history.length - 1, 15);
            for (let i = history.length - nCount15; i < history.length; i++) {
                let d = calcDist(history[i-1], history[i]);
                if (d >= 0) { der15++; dirSeq15.push('DER'); } else { izq15++; dirSeq15.push('IZQ'); }
                if (Math.abs(d) >= 10) { big15++; zoneSeq15.push('BIG'); } else { small15++; zoneSeq15.push('SMALL'); }
            }

            pat = (typeof analyzeTravelPattern === 'function') ? analyzeTravelPattern(history) : {label:'Estandar',tiradas:0};
            lvl = (typeof getStabilityLevel === 'function') ? getStabilityLevel(pat, evts) : 'red';
            const colorNames = { green: 'VERDE', yellow: 'AMARILLO', red: 'ROJO' };
            stabilityInfo = 'DOMINANCIA: DER(' + der + ') IZQ(' + izq + ') | ZONA: BIG(' + big + ') SMALL(' + small + ') | ESTADO: ' + colorNames[lvl];
        } catch(e) { stabilityInfo = 'ESTADO: Analizando...'; }

        // === CONSTRUIR PROMPT CON LAS 6 METRICAS ===
        let validMetrics = [];
        let validN9Nums = [];
        let validN4Nums = [];
        let mathContext = '';
        let cwRate = 0;
        let ccwRate = 0;
        if (lastSignal) {
            const s = lastSignal;
            const last10cw = cwHistory.slice(-10);
            const last10ccw = ccwHistory.slice(-10);
            cwRate = last10cw.length > 0 ? Number((last10cw.filter(x=>x==='win').length / last10cw.length * 100).toFixed(0)) : 0;
            ccwRate = last10ccw.length > 0 ? Number((last10ccw.filter(x=>x==='win').length / last10ccw.length * 100).toFixed(0)) : 0;
            
            validMetrics = [
                {label:'CW_N9', num: s.targetCW},
                {label:'CW_N4S', num: s.targetUnderCW},
                {label:'CW_N4B', num: s.targetOverCW},
                {label:'CCW_N9', num: s.targetCCW},
                {label:'CCW_N4S', num: s.targetOverCCW},
                {label:'CCW_N4B', num: s.targetUnderCCW}
            ];
            validN9Nums = [String(s.targetCW), String(s.targetCCW)];
            validN4Nums = [
                String(s.targetUnderCW),
                String(s.targetOverCW),
                String(s.targetOverCCW),
                String(s.targetUnderCCW)
            ];
            
            // Prompt SIN historial - solo opciones
            mathContext = 'OPCIONES (elige SOLO de aqui):\n';
            mathContext += 'A) ' + s.targetCW + ' (CW N9, Eff:' + cwRate + '%)\n';
            mathContext += 'B) ' + s.targetUnderCW + ' (CW SMALL)\n';
            mathContext += 'C) ' + s.targetOverCW + ' (CW BIG)\n';
            mathContext += 'D) ' + s.targetCCW + ' (CCW N9, Eff:' + ccwRate + '%)\n';
            mathContext += 'E) ' + s.targetOverCCW + ' (CCW SMALL)\n';
            mathContext += 'F) ' + s.targetUnderCCW + ' (CCW BIG)';
        } else {
            mathContext = 'SIN MEDIDAS - Responde ESPERAR.';
        }

        let modeInstruction = window.currentAIMode === 'SAFE' ? 'SAFE: si no hay ventaja clara, responde ESPERAR.' : 'FULL: elige la mejor jugada disponible aunque la ventaja sea corta.';
        const p = stabilityInfo + '\n' + mathContext + '\n' + modeInstruction + '\nElige 1 para N9 y 1 para N4. JSON: {"n9":"NUMERO","n4":"NUMERO"}';

        const autoAiContext = lastSignal ? {
            mode: window.currentAIMode,
            stabilityLevel: lvl,
            patternLabel: pat.label || 'Estandar',
            dominance8: { cw: der, ccw: izq, big: big, small: small },
            momentum15: { cw: der15, ccw: izq15, big: big15, small: small15 },
            sequence15: {
                dir: typeof dirSeq15 !== 'undefined' ? dirSeq15.join(' ') : '',
                zone: typeof zoneSeq15 !== 'undefined' ? zoneSeq15.join(' ') : ''
            },
            performance8: {
                cwN9: getPerfText(cwHistory),
                cwN4: getPerfText(cwN4History),
                ccwN9: getPerfText(ccwHistory),
                ccwN4: getPerfText(ccwN4History)
            },
            routes: {
                cw: {
                    n9: lastSignal.targetCW,
                    n4Small: lastSignal.targetUnderCW,
                    n4Big: lastSignal.targetOverCW,
                    hitRate: Number(cwRate)
                },
                ccw: {
                    n9: lastSignal.targetCCW,
                    n4Small: lastSignal.targetOverCCW,
                    n4Big: lastSignal.targetUnderCCW,
                    hitRate: Number(ccwRate)
                }
            },
            recentNumbers: history.slice(-15)
        } : null;

        const resp = await fetch('/api/ai/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: p, tableId, historyStr: history.join(','), autoAiContext })
        });
        const data = await resp.json();
        if (data.rateLimited) {
            if (statusEl) statusEl.innerText = 'WAIT';
            if (analysisEl) analysisEl.innerText = 'IA limitada por 429. No se guarda jugada ni se fuerza lectura; esperando cooldown.';
            n9El.innerText = 'ESPERAR';
            n4El.innerText = 'ESPERAR';
            return;
        }
        
        if (data.reply) {
            // Sync from DB for proper normalized numbers + counting
            if (typeof syncAiPredictionState === 'function') syncAiPredictionState();
        } else {
            n9El.innerText = 'Error API';
            n4El.innerText = 'Error API';
        }
    } catch(e) {
        console.error('Predictor error:', e);
        n9El.innerText = 'Error';
        n4El.innerText = 'Error';
    } finally {
        autoAiInFlight = false;
    }
}


async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msgsEl = document.getElementById('chat-messages');
    const statusEl = document.getElementById('chat-status');
    if (!input || !msgsEl) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Append user bubble
    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'background:rgba(255,255,255,0.08);border-radius:10px;padding:6px 10px;font-size:10px;color:var(--text);max-width:85%;align-self:flex-end;line-height:1.4;';
    userBubble.innerText = text;
    msgsEl.appendChild(userBubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    // Thinking bubble
    const thinking = document.createElement('div');
    thinking.style.cssText = 'background:rgba(0,229,200,0.08);border-radius:10px;padding:6px 10px;font-size:10px;color:var(--accent);max-width:85%;align-self:flex-start;line-height:1.4;font-style:italic;';
    thinking.innerText = 'Pensando...';
    msgsEl.appendChild(thinking);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    if (statusEl) statusEl.innerText = 'THINKING';

    const tableId = document.getElementById('table-select') ? document.getElementById('table-select').value : 'default';

    try {
        const resp = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, tableId, historyStr: history.join(',') })
        });
        const data = await resp.json();
        thinking.innerText = data.reply || 'Sin respuesta.';
        thinking.style.fontStyle = 'normal';
    } catch(e) {
        thinking.innerText = 'Error de conexion con la IA.';
        thinking.style.color = '#f55';
    }
    if (statusEl) statusEl.innerText = 'ONLINE';
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

