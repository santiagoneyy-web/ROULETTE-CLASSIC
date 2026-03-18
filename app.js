// ============================================================
// app.js — UI logic for Roulette Predictor v2 [VER 2.0.1]
// ============================================================

const history      = [];
const stats        = {};
const iaSignalsHistory = [ [], [], [], [], [] ]; 
const iaWins = [0, 0, 0, 0, 0];
const iaLosses = [0, 0, 0, 0, 0];
let lastIaSignals = [null, null, null, null, null]; 
let activeIaTab    = 0; 
let latestAgent5Top = null; 
let latestAgent5Dna = false; 
let activeTab      = '-'; 

const API_BASE = '/api';
let currentTableId = null;

const numInput    = document.getElementById('num-input');
const submitBtn   = document.getElementById('submit-btn');
const clearBtn    = document.getElementById('clear-btn');
const historyEl   = document.getElementById('history-strip');
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
    if (!historyEl) return;
    historyEl.innerHTML = '';
    history.slice(-15).reverse().forEach((n, idx) => {
        const div = document.createElement('div');
        div.className = `hist-ball hist-${numColor(n)} ${idx === 0 ? 'hist-latest' : ''}`;
        div.textContent = n;
        historyEl.appendChild(div);
    });
}

function buildStratTabs(results) {
    if (!stratTabs) return;
    if (!results) { stratTabs.innerHTML = ''; return; }
    stratTabs.innerHTML = results.map(r => {
        const isActive = r.strategy === activeTab;
        const h = r.outcomes || [];
        const last = h[h.length-1];
        const cls = last === true ? 'tab-win' : (last === false ? 'tab-loss' : '');
        return `<button class="strat-tab ${isActive ? 'active' : ''} ${cls}" onclick="activeTab='${r.strategy}'; submitNumber(null,true,false)">${r.strategy}</button>`;
    }).join('');
}
function renderTargetPanel(results) {
    if (!targetPanel) return;
    if (!results || results.length === 0) { targetPanel.innerHTML = '<p class="muted">Ingresa datos...</p>'; return; }
    const r = results.find(x => x.strategy === activeTab) || results[0];
    
    const mainNum = (r.betZone && r.betZone.length > 0) ? r.betZone[0] : null;
    if (mainNum === null) { targetPanel.innerHTML = '<p class="muted">Calculando terminales...</p>'; return; }

    const terminalDigit = mainNum % 10;
    const allTerminals = [terminalDigit, terminalDigit + 10, terminalDigit + 20, terminalDigit + 30].filter(n => n <= 36);
    
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const idx = WHEEL_ORDER.indexOf(mainNum);
    const neighbors = [
        WHEEL_ORDER[(idx - 1 + 37) % 37],
        WHEEL_ORDER[(idx + 1) % 37]
    ];

    targetPanel.innerHTML = `
    <div class="target-header" style="margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
        <span class="target-strat-name" style="color:var(--accent);">Estrategia ${r.strategy}</span>
        <span class="badge badge-neutral" style="font-size:0.7rem;">Sess: W:${iaWins[activeIaTab]} L:${iaLosses[activeIaTab]}</span>
    </div>
    <div class="terminal-logic-view" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
        <div class="term-box" style="background:rgba(255,190,0,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,190,0,0.15);">
            <div style="color:var(--gold); font-size:0.6rem; text-transform:uppercase; margin-bottom:5px;">Terminal Principal</div>
            <div style="font-size:1.8rem; font-weight:900; color:#fff;">T-${terminalDigit}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:4px;">Nums: ${allTerminals.join(', ')}</div>
        </div>
        <div class="vec-box" style="background:rgba(76,130,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(76,130,255,0.15);">
            <div style="color:var(--accent); font-size:0.6rem; text-transform:uppercase; margin-bottom:5px;">Vecinos (Wheel)</div>
            <div style="font-size:1.4rem; font-weight:900; color:#fff;">${neighbors.join(' | ')}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:4px;">Base: ${mainNum}</div>
        </div>
    </div>`;
}

function renderNextPanel(prox) {
    if (!nextPanel) return;
    // Simplified: Just show the session hit rates
    const top = prox.slice(0, 3);
    nextPanel.innerHTML = `<div class="stats-row" style="display:flex; gap:15px; font-size:0.75rem;">
        ${top.map(p => `<div><span style="color:var(--text-dim);">${p.strategy}:</span> ${p.hitRate.toFixed(1)}%</div>`).join('')}
    </div>`;
}

function renderTravelPanel(sig) {
    if (!travelPanel) return;
    const hist = sig.travelHistory || [];
    const rows = [];
    const maxEntries = 100; // Expanded to 100 as requested
    
    for (let i = 0; i < Math.min(history.length, maxEntries); i++) {
        const idx = history.length - 1 - i;
        const n = history[idx];
        const t = hist[idx - 1]; 
        const dist = t !== undefined ? Math.abs(t) : '-';
        const dir = t !== undefined ? (t > 0 ? 'DER. ↻' : (t < 0 ? 'IZQ. ↺' : '-')) : '-';
        const phase = dist === '-' ? '-' : (dist <= 9 ? 'SMALL' : 'BIG');
        
        rows.push(`<tr class="${i === 0 ? 'travel-row-last' : ''}">
            <td class="text-gold"><strong>${n}</strong> ${i === 0 ? '<span class="travel-last-badge">★ LAST</span>' : ''}</td>
            <td class="${dist > 9 ? 'text-red' : ''}">${dist}${dist !== '-' ? 'p' : ''}</td>
            <td>${dir}</td>
            <td><span class="badge ${phase === 'SMALL' ? 'badge-win' : 'badge-loss'}" style="font-size:0.5rem;">${phase}</span></td>
        </tr>`);
    }

    travelPanel.innerHTML = `
        <div class="travel-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div class="dir-state-badge ${sig.directionState === 'stable' ? 'state-stable' : 'state-unstable'}" style="padding:4px 10px; border-radius:10px;">
                ${sig.directionState === 'stable' ? '▶ ESTABLE' : '▶ VOLÁTIL'}
            </div>
            <div class="last-hit-badge" style="font-family:var(--mono); font-size:0.7rem;">LAST REC: ${sig.recommendedPlay}</div>
        </div>
        <div class="travel-scroll-container" style="max-height: 400px; overflow-y: auto; padding-right:5px;">
            <table class="travel-table" style="width:100%; font-size:0.75rem; border-collapse:collapse;">
                <thead style="position:sticky; top:0; background:var(--bg2); z-index:10; border-bottom:1px solid var(--border);">
                    <tr style="color:var(--text-dim); text-align:left;"><th>N°</th><th>DIST</th><th>DIR</th><th>PHASE</th></tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>`;
}

function renderSignalsPanel(signals) {
    if (!topPanel) return;
    try {
        const names = ['FISICA', 'SIX', 'COMBINATION', 'SOPORTE', 'IA'];
        const tabButtons = names.map((name, idx) => {
            const h = iaSignalsHistory[idx] || [];
            const last = h[h.length-1];
            const cls = last === 'win' ? 'tab-win' : (last === 'loss' ? 'tab-loss' : '');
            const w = iaWins[idx], l = iaLosses[idx];
            return `<button class="ia-tab ${idx === activeIaTab ? 'active' : ''} ${cls}" onclick="setActiveIaTab(${idx})">
                ${name} <span style="opacity:0.6; font-size:0.55rem; margin-left:4px;">${w}-${l}</span>
            </button>`;
        }).join('');

        const s = signals[activeIaTab];
        let content = '<p class="muted">Buscando señal...</p>';

        if (s) {
            const isPerfect = (activeIaTab === 4 && s.confidence === 'PERFECTION');
            const slotClass = s.mode === 'FISICA' ? 'slot-escudo' : 'slot-lanza';
            
            // Fixed Agent Layout (Simplified as requested: Top Number + Big/Small)
            const smallNum = s.small !== undefined ? s.small : '...';
            const bigNum = s.big !== undefined ? s.big : '...';
            
            content = `<div class="ia-active-slot ${slotClass} ${isPerfect ? 'slot-perfect' : ''}" style="padding:20px; border-radius:16px;">
                <div class="ia-slot-header" style="margin-bottom:10px;">
                    <span class="ia-slot-name">${activeIaTab === 4 ? '🤖 IA AUTÓNOMA' : (s.name || 'AGENTE')}</span>
                    <span class="ia-slot-conf" style="color:var(--green); font-weight:800; font-size:0.9rem;">${s.confidence || '0%'}</span>
                </div>
                
                <div class="ia-grid" style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 15px; align-items: center; margin: 10px 0;">
                    <div style="text-align:center;">
                        <div style="font-size:0.6rem; color:var(--text-dim); margin-bottom:5px;">SMALL</div>
                        <div style="font-size:1.3rem; font-weight:900; color:#fff;">${smallNum}<sup>n4</sup></div>
                    </div>
                    <div style="text-align:center;">
                        <div class="ia-main-num" style="font-size:3.8rem; font-weight:900; color:var(--gold); line-height:1; margin:5px 0;">${s.number !== null && s.number !== undefined ? s.number : (s.tp || '...')}</div>
                        <div style="font-size:0.7rem; color:var(--text-dim); letter-spacing:1px;">TOP TARGET</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.6rem; color:var(--text-dim); margin-bottom:5px;">BIG</div>
                        <div style="font-size:1.3rem; font-weight:900; color:#fff;">${bigNum}<sup>n4</sup></div>
                    </div>
                </div>

                <div class="ia-slot-footer" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px; margin-top:10px;">
                    <div style="font-family:var(--mono); color:var(--gold); font-size:0.75rem;">RECOMENDACIÓN: ${s.rule || 'ESTÁNDAR'}</div>
                    <div style="font-family:var(--mono); font-size:0.8rem;"><span style="color:var(--green);">W:${iaWins[activeIaTab]}</span> <span style="color:var(--red);">L:${iaLosses[activeIaTab]}</span></div>
                </div>
            </div>`;
        }
        topPanel.innerHTML = `<div class="ia-tabs-strip" style="display:flex; gap:5px; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:5px;">${tabButtons}</div>${content}`;
    } catch (e) { console.error(e); }
}

async function submitNumber(val, silent = false, batch = false) {
    let n = parseInt(val || numInput.value);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        history.push(n);

        if (!silent && currentTableId) {
            try { 
                const resp = await apiPostSpin(currentTableId, n); 
                if (resp && resp.predictions) {
                    // Fix: Ensure we only take the number value if it's an object
                    const ag5 = resp.predictions.agent5_top;
                    latestAgent5Top = (typeof ag5 === 'object' && ag5 !== null) ? ag5.number : ag5;
                    latestAgent5Dna = resp.predictions.agent5_dna || false;
                }
            } catch(e) { console.error("Error posting spin:", e); }
        }

        lastIaSignals.forEach((s, idx) => {
            if (!s || s.confidence === '0%' || s.rule === 'STOP' || s.rule === 'PAUSA (BAJA CONF.)') return;
            let win = false;
            
            if (s.betZone && s.betZone.length > 0) {
                win = s.betZone.includes(n);
            } else {
                const target = s.number !== null && s.number !== undefined ? s.number : s.tp;
                if (target !== null && target !== undefined) {
                    const dist = wheelDistance(n, target);
                    win = (dist <= ((idx === 0 || idx === 4) ? 2 : 4));
                }
            }
            
            if (win) iaWins[idx]++; else iaLosses[idx]++;
            iaSignalsHistory[idx].push(win ? 'win' : 'loss');
        });
    }

    if (typeof computeDealerSignature !== 'function') return;

    const sig = computeDealerSignature(history);
    const res = analyzeSpin(history, stats);
    const prx = projectNextRound(history, stats);
    const sigs = getIAMasterSignals(prx, sig, history) || [];
    
    const finalSigs = [
        { ...sigs[1], name: 'FISICA', mode: 'FISICA', small: sig.casilla5, big: sig.casilla14 },
        { ...sigs[0], name: 'SIX', mode: 'MATH', small: sig.casilla10, big: sig.casilla19 },
        { ...sigs[2], name: 'COMBINATION', mode: 'ATAQUE', small: sig.casilla5, big: sig.casilla14 },
        { ...sigs[3], name: 'SOPORTE', mode: 'SOPORTE', small: sig.casilla1, big: sig.casilla19 },
        { 
            name: 'IA', 
            mode: latestAgent5Dna ? 'ATAQUE' : 'MATH',
            number: latestAgent5Top,
            confidence: latestAgent5Top !== null ? (latestAgent5Dna ? 'PERFECTION' : 'MAX') : '0%',
            rule: latestAgent5Dna ? 'PERFECT DNA' : (latestAgent5Top !== null ? 'BDD Master' : 'APRENDIENDO'),
            small: sig.casilla5,
            big: sig.casilla14
        }
    ];
    
    lastIaSignals = finalSigs;

    if (!batch) {
        renderHistory(); 
        drawWheel(isNaN(n) ? null : n); 
        buildStratTabs(res); 
        renderTargetPanel(res); 
        renderNextPanel(prx); 
        renderTravelPanel(sig); 
        renderSignalsPanel(finalSigs);
        
        if (!silent) {
            numInput.value = ''; 
            numInput.focus();
        }
    }
}

function wipeData() { 
    history.length = 0; 
    iaWins.fill(0); 
    iaLosses.fill(0); 
    iaSignalsHistory.forEach(h => h.length = 0); 
    lastIaSignals.fill(null); 
    Object.keys(stats).forEach(k => delete stats[k]);
    renderHistory(); 
    drawWheel(null); 
}

window.setActiveIaTab = (idx) => { activeIaTab = idx; submitNumber(null, true, false); };
submitBtn.addEventListener('click', () => submitNumber());
numInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNumber(); });
clearBtn.addEventListener('click', wipeData);

tableSelect.addEventListener('change', async () => {
    currentTableId = tableSelect.value; if (!currentTableId) return;
    const spins = await apiFetchHistory(currentTableId); 
    wipeData(); 
    for (const s of spins) {
        if (s && s.number !== undefined) await submitNumber(s.number, true, true);
    }
    if (tableSpinCount) tableSpinCount.textContent = `(${spins.length})`;
    try {
        const p = await apiFetchPredict(currentTableId);
        if (p) {
            latestAgent5Top = p.agent5_top;
            latestAgent5Dna = p.agent5_dna || false;
        }
    } catch(e) { console.error("Sync error:", e); }
    submitNumber(null, true, false);
});

async function loadTables() { 
    const ts = await apiFetchTables(); 
    if (tableSelect) tableSelect.innerHTML = '<option value="">-- Mesa --</option>' + ts.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); 
}

document.addEventListener('DOMContentLoaded', () => { 
    console.log("🚀 [App] Version 2.0.1 Loaded Successfully.");
    loadTables(); 
    drawWheel(null); 
});
