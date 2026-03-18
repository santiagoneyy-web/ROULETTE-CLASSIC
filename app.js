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
let latestAgent5Dna = false; 
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
        const names = ['FISICA', 'SIX', 'COMBINATION', 'SOPORTE', 'IA'];
        const tabButtons = names.map((name, idx) => {
            const h = iaSignalsHistory[idx] || [];
            const last = h[h.length-1];
            const cls = last === 'win' ? 'tab-win' : (last === 'loss' ? 'tab-loss' : '');
            return `<button class="ia-tab ${idx === activeIaTab ? 'active' : ''} ${cls}" onclick="setActiveIaTab(${idx})">${name}</button>`;
        }).join('');

        const s = signals[activeIaTab];
        let content = '<p class="muted">Buscando señal...</p>';

        if (s) {
            const isPerfect = (s.name === 'Célula' && s.confidence === 'PERFECTION');
            const slotClass = s.mode === 'FISICA' ? 'slot-escudo' : (s.mode === 'ATAQUE' ? 'slot-lanza' : (s.mode === 'MATH' ? 'slot-math' : ''));
            
            if (activeIaTab === 0) { // FISICA STUDIO
                content = `<div class="ia-active-slot slot-escudo">
                    <div class="ia-slot-header"><span class="ia-slot-name">🎯 FÍSICA STUDIO</span><span class="ia-slot-conf">${s.confidence || '0%'} CONF.</span></div>
                    <div class="ia-grid">
                        <div class="ia-side-box"><div class="ia-side-lbl">SMALL</div><div class="ia-side-num">${s.small || '0'}<sup>n4</sup></div></div>
                        <div class="ia-center-box">
                            <div class="ia-main-num">${s.number || '...'}<sup>n9</sup></div>
                            <div class="ia-dir-lbl">TENDENCIA: ${s.rule || '...'}</div>
                        </div>
                        <div class="ia-side-box"><div class="ia-side-lbl">BIG</div><div class="ia-side-num">${s.big || '0'}<sup>n4</sup></div></div>
                    </div>
                    <div class="ia-slot-footer">
                        <div class="ia-reason">RUPTURA DETECTADA - POLO ${s.mode || '...'}</div>
                        <div class="ia-reason">SOPORTE ${s.mode === 'SOPORTE' ? 'PRO' : 'BIG N9'}</div>
                    </div>
                </div>`;
            } else { // OTHER AGENTS & IA AUTÓNOMA
                content = `<div class="ia-active-slot ${slotClass} ${isPerfect ? 'slot-perfect' : ''}">
                    <div class="ia-slot-header">
                        <span class="ia-slot-name">${activeIaTab === 4 ? '🤖 IA AUTÓNOMA' : s.name}</span>
                        <span class="ia-slot-conf">${s.confidence || '0%'}</span>
                    </div>
                    <div class="ia-center-box">
                        <div class="ia-rule-pro" style="color:var(--gold); font-size:0.7rem;">${s.rule || 'ANALIZANDO'}</div>
                        <div class="ia-main-num">${s.number !== null ? s.number : (s.tp || '...')}</div>
                        <div class="ia-dir-lbl" style="font-size:0.6rem; opacity:0.6;">SINCRONIZANDO BDD...</div>
                    </div>
                    <div class="ia-slot-footer">
                        <div class="badge ${s.mode === 'ATAQUE' ? 'rec-lanza' : 'rec-escudo'}">JUGAR ${s.mode || '...'}</div>
                        <div class="ia-reason">W:${iaWins[activeIaTab]} L:${iaLosses[activeIaTab]}</div>
                    </div>
                </div>`;
            }
        }
        const dots = (iaSignalsHistory[activeIaTab] || []).slice(-10).map(h => `<span class="m-hist-badge ${h === 'win' ? 'm-hist-w' : 'm-hist-l'}">${h === 'win' ? 'W' : 'L'}</span>`).join('');
        topPanel.innerHTML = `<div class="ia-tabs-strip">${tabButtons}</div>${content}<div class="ia-pattern-strip">${dots}</div>`;
    } catch (e) { console.error(e); }
}

async function submitNumber(val, silent = false, batch = false) {
    let n = parseInt(val || numInput.value);
    
    // 1. DATA PROCESSING (Only if a valid number is provided)
    if (!isNaN(n) && n >= 0 && n <= 36) {
        history.push(n);

        if (!silent) {
            try { 
                const resp = await apiPostSpin(currentTableId, n); 
                if (resp && resp.predictions) {
                    if (resp.predictions.agent5_top !== undefined) latestAgent5Top = resp.predictions.agent5_top;
                    if (resp.predictions.agent5_dna !== undefined) latestAgent5Dna = resp.predictions.agent5_dna;
                }
            } catch(e) { console.error("Error posting spin:", e); }
        }

        // Evaluate previous signals against this new number
        lastIaSignals.forEach((s, idx) => {
            if (!s || s.confidence === '0%' || s.rule === 'STOP') return;
            let win = false;
            
            // Evaluation logic based on agent type
            if (s.betZone && s.betZone.length > 0) {
                win = s.betZone.includes(n);
            } else if (s.number !== null && s.number !== undefined) {
                const dist = wheelDistance(n, s.number);
                const maxDist = (idx === 0 || idx === 4) ? 2 : 4; // FISICA/IA are tighter (N2), others N4
                win = (dist <= maxDist);
            }
            
            if (win) iaWins[idx]++; else iaLosses[idx]++;
            iaSignalsHistory[idx].push(win ? 'win' : 'loss');
            if (activeIaTab === idx) { if (win) recommendedWin++; else recommendedLoss++; }
        });
    }

    // 2. LOGIC EVALUATION (Generate predictions for the NEXT spin)
    if (typeof computeDealerSignature === 'undefined' || typeof analyzeSpin === 'undefined') {
        console.error("❌ Critical: predictor.js logic not loaded.");
        return;
    }

    const sig = computeDealerSignature(history);
    const res = analyzeSpin(history, stats);
    const prx = projectNextRound(history, stats);
        const sigs = getIAMasterSignals(prx, sig, history) || [];
        
        // Ensure sigs match the names array: ['FISICA', 'SIX', 'COMBINATION', 'SOPORTE', 'IA']
        // 0: FISICA (n17), 1: SIX (n16), 2: COMBINATION (1717), 3: SOPORTE (N18)
        
        // Re-map for UI consistency
        const finalSigs = [
            { ...sigs[1], name: 'FISICA', mode: 'FISICA' },      // n17 -> FISICA
            { ...sigs[0], name: 'SIX', mode: 'MATH' },        // n16 -> SIX
            { ...sigs[2], name: 'COMBINATION', mode: 'ATAQUE' }, // 1717 -> COMBINATION
            { ...sigs[3], name: 'SOPORTE', mode: 'SOPORTE' },    // N18 -> SOPORTE
            { 
                name: 'IA', 
                mode: latestAgent5Dna ? 'ATAQUE' : 'MATH',
                number: latestAgent5Top,
                confidence: latestAgent5Top !== null ? (latestAgent5Dna ? 'PERFECTION' : 'MAX') : '0%',
                rule: latestAgent5Dna ? 'PERFECT DNA' : (latestAgent5Top !== null ? 'BDD Master' : 'APRENDIENDO'),
                reason: latestAgent5Top !== null ? (latestAgent5Dna ? 'SINCRONIA TOTAL' : 'AUTÓNOMO') : (history.length < 50 ? `GRABANDO ${history.length}/50` : 'ANALIZANDO...')
            }
        ];
        
        lastIaSignals = finalSigs;

    // 3. UI RENDERING (Skip if batching for performance)
    if (!batch) {
        renderHistory(); 
        drawWheel(isNaN(n) ? null : n); 
        buildStratTabs(res); 
        renderTargetPanel(res); 
        renderNextPanel(prx); 
        renderTravelPanel(sig); 
        renderSignalsPanel(sigs);
        
        if (!silent) {
            numInput.value = ''; 
            numInput.focus();
        }
    }
}

function wipeData() { history.length = 0; iaWins.fill(0); iaLosses.fill(0); iaSignalsHistory.forEach(h => h.length = 0); renderHistory(); drawWheel(null); }
window.setActiveIaTab = (idx) => { activeIaTab = idx; submitNumber(null, true, false); };
submitBtn.addEventListener('click', () => submitNumber());
numInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNumber(); });
clearBtn.addEventListener('click', wipeData);
tableSelect.addEventListener('change', async () => {
    currentTableId = tableSelect.value; if (!currentTableId) return;
    const spins = await apiFetchHistory(currentTableId); 
    wipeData(); // Reset local state
    
    // 1. Ingest history (This evaluates logic for each spin to build stats)
    for (const s of spins) await submitNumber(s.number, true, true);
    if (tableSpinCount) tableSpinCount.textContent = `(${spins.length})`;
    
    // 2. Sync latest prediction for the NEXT round
    try {
        const p = await apiFetchPredict(currentTableId);
        if (p) {
            latestAgent5Top = p.agent5_top;
            latestAgent5Dna = p.agent5_dna || false;
            console.log("🧬 [Master Brain] Initial prediction synchronized:", latestAgent5Top);
        }
    } catch(e) { console.error("Sync error:", e); }

    // 3. Trigger final UI update
    submitNumber(null, true, false);
});
async function loadTables() { const ts = await apiFetchTables(); if (tableSelect) tableSelect.innerHTML = '<option value="">-- Mesa --</option>' + ts.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); }
document.addEventListener('DOMContentLoaded', () => { loadTables(); drawWheel(null); });
