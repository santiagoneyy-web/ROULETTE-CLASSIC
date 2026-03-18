// ============================================================
// app.js — UI logic for Roulette Predictor Pro v3.1
// ============================================================

const history      = [];
const stats        = {};
const iaSignalsHistory = [ [], [], [], [], [] ]; 
const iaWins = [0, 0, 0, 0, 0];
const iaLosses = [0, 0, 0, 0, 0];
let lastIaSignals = [null, null, null, null, null]; 
let activeIaTab    = 0; 

const API_BASE = '/api';
let currentTableId = null;

// Pro v3.1 Selectors
const activeAgentLabel = document.getElementById('active-agent-name');
const historyEl       = document.getElementById('history-strip');
const tableSelect     = document.getElementById('table-select');
const travelTbody     = document.getElementById('travel-tbody');
const topPanel        = document.getElementById('top-content'); 
const signalBanner    = document.getElementById('active-signal-container');

const numInput = { value: '', focus: () => {}, addEventListener: () => {} }; 
const submitBtn = { addEventListener: () => {} };

const wheelCanvas = document.getElementById('wheel-canvas');
const wheelCtx = wheelCanvas ? wheelCanvas.getContext('2d') : null;

const WHEEL_NUMS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numColor(n) { if (n === 0) return 'green'; if (RED_NUMS.has(n)) return 'red'; return 'black'; }

function calcDist(from, to) {
    const i1 = WHEEL_NUMS.indexOf(from);
    const i2 = WHEEL_NUMS.indexOf(to);
    if (i1 === -1 || i2 === -1) return 0;
    let d = i2 - i1;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

function drawWheel(highlightNum = null) {
    if (!wheelCtx) return;
    const ctx = wheelCtx;
    const cx = 110, cy = 110, r = 85;
    ctx.clearRect(0,0,220,220);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r + 15, 0, Math.PI * 2);
    ctx.strokeStyle = '#0a0d1a';
    ctx.lineWidth = 12;
    ctx.stroke();

    WHEEL_NUMS.forEach((n, i) => {
        const ang = (i * (360 / 37) - 90) * (Math.PI / 180);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;

        // Slot
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = (n === 0) ? '#00ff00' : (RED_NUMS.has(n) ? '#ff3b5c' : '#111');
        ctx.fill();
        
        if (n === highlightNum) {
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#f5c842';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px var(--mono)';
        ctx.textAlign = 'center';
        ctx.fillText(n, x, y + 3);
    });
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

function updateClock() {
    const el = document.getElementById('live-clock');
    if (el) el.innerText = new Date().toLocaleTimeString();
}
setInterval(updateClock, 1000);

function renderSignalsPanel(signals) {
    const banner = document.getElementById('active-signal-container');
    const tabStrip = document.getElementById('strat-tabs');
    if (!banner || !tabStrip) return;

    try {
        const names = ['N17', 'N16', 'N17PLUS', 'N18', 'CELULA'];
        
        tabStrip.innerHTML = names.map((name, idx) => {
            const h = iaSignalsHistory[idx] || [];
            const h15 = h.slice(-15);
            const last = h[h.length-1];
            const cls = last === 'win' ? 'tab-win' : (last === 'loss' ? 'tab-loss' : '');
            
            const wTotal = h.filter(x => x === 'win').length;
            const hitTotal = h.length > 0 ? Math.round((wTotal / h.length) * 100) : 0;
            
            const w15 = h15.filter(x => x === 'win').length;
            const l15 = h15.filter(x => x === 'loss').length;
            
            return `<button class="nav-item ${idx === activeIaTab ? 'active' : ''} ${cls}" onclick="setActiveIaTab(${idx})">
                <span style="font-weight:900;">${name}</span>
                <span class="status-pill" style="margin-left:5px; background:rgba(255,255,255,0.03); opacity:0.8;">${hitTotal}%</span>
                <span class="status-pill" style="opacity:0.4; font-size:0.55rem;">${w15}-${l15}</span>
            </button>`;
        }).join('');

        if (activeAgentLabel) activeAgentLabel.innerText = names[activeIaTab];

        const s = signals[activeIaTab];
        if (!s || !s.top || s.rule === 'STOP') {
            banner.innerHTML = '<div class="signal-idle" onclick="toggleDashboard()">⚡ WAITING FOR SPIN DATA... <span style="font-size:0.6rem; opacity:0.4;">(CLICK TO TOGGLE)</span></div>';
            return;
        }

        const isHighConfidence = s.confidence && parseInt(s.confidence) > 50;
        banner.innerHTML = `
            <div class="signal-toggle-header" onclick="toggleDashboard()" style="cursor:pointer; font-size:0.6rem; text-transform:uppercase; color:var(--text-dim); margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:5px; display:flex; justify-content:space-between;">
                <span>Active Signal: ${names[activeIaTab]}</span>
                <span>Click to Collapse</span>
            </div>
            <div class="signal-active-box">
                <div class="signal-target-num">${s.top} <sup style="font-size:0.8rem; opacity:0.6;">n9</sup></div>
                <div class="signal-label-pro">RECOMMENDED PLAY</div>
                <div style="font-family:var(--mono); font-size:0.72rem; color:var(--text-dim); margin-top:8px;">
                    CONFIDENCE: <span style="color:var(--green); font-weight:800;">${s.confidence || '---'}</span> | 
                    ZONE: ${s.small}-${s.big}
                </div>
            </div>`;
        
        if (isHighConfidence) banner.classList.add('signal-pulse-green');
        else banner.classList.remove('signal-pulse-green');

    } catch (e) { console.error("Pro Signal Render Error:", e); }
}

function renderTravelPanel(sig) {
    const cont = travelTbody;
    if (!cont) return;

    if (!history || history.length < 2) {
        cont.innerHTML = '<tr><td colspan="7" class="muted" style="padding:20px; text-align:center;">Analyzing patterns (min 2 spins required)...</td></tr>';
        return;
    }

    const rows = history.slice(-100).reverse().map((n, i) => {
        const isLatest = i === 0;
        const colorClass = RED_NUMS.has(n) ? 'val-down' : (n === 0 ? 'val-up' : 'val-neutral');
        const prev = history[history.length - 2 - i];
        const dist = prev !== undefined ? calcDist(prev, n) : 0;
        
        // Define Small/Big for Travel Data
        const isSmall = n > 0 && n <= 18;
        const phaseLabel = isSmall ? 'SMALL' : 'BIG';
        const phaseClass = isSmall ? 'badge-win' : 'badge-loss';

        return `<tr class="${isLatest ? 'travel-row-last' : ''}">
            <td>${history.length - i}</td>
            <td class="${colorClass}" style="font-weight:900;">${n}</td>
            <td class="${Math.abs(dist) > 9 ? 'val-down' : 'val-up'}">${Math.abs(dist)}p</td>
            <td>${dist > 0 ? 'DER' : (dist < 0 ? 'IZQ' : '---')}</td>
            <td><span class="badge ${phaseClass}" style="font-size:0.65rem; padding:4px 12px; width:70px; display:inline-block; text-align:center;">${phaseLabel}</span></td>
        </tr>`;
    }).join('');

    cont.innerHTML = rows;
}

async function apiFetchTables() { const r = await fetch(`${API_BASE}/tables`); return r.json(); }
async function apiFetchHistory(tableId) { const r = await fetch(`${API_BASE}/history/${tableId}`); return r.json(); }
async function apiPostSpin(tableId, number) { const r = await fetch(`${API_BASE}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: tableId, number, source: 'manual' }) }); return r.json(); }
async function apiFetchPredict(tableId) { const r = await fetch(`${API_BASE}/predict/${tableId}`); return r.json(); }

async function submitNumber(val, silent = false, batch = false) {
    let n = parseInt(val || numInput.value);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        history.push(n);

        if (!silent && currentTableId) {
            try { 
                await apiPostSpin(currentTableId, n); 
            } catch(e) { console.error("Error posting spin:", e); }
        }

        lastIaSignals.forEach((s, idx) => {
            if (!s || s.confidence === '0%' || s.rule === 'STOP') return;
            let win = false;
            const target = s.number !== null && s.number !== undefined ? s.number : s.top;
            if (target !== null && target !== undefined) {
                const dist = Math.abs(calcDist(n, target));
                win = (dist <= 4); 
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
        { ...sigs[1], name: 'N17', top: sig.casilla1, small: sig.casilla5, big: sig.casilla14 },
        { ...sigs[0], name: 'N16', top: sig.casilla10, small: sig.casilla5, big: sig.casilla19 },
        { ...sigs[2], name: 'N17PLUS', top: sig.casilla14, small: sig.casilla5, big: sig.casilla19 },
        { ...sigs[3], name: 'N18', top: sig.casilla19, small: sig.casilla1, big: sig.casilla10 },
        { ...sigs[0], name: 'CELULA', top: sig.casilla5, small: sig.casilla1, big: sig.casilla14 }
    ];
    
    lastIaSignals = finalSigs;

    if (!batch) {
        renderHistory(); 
        renderTravelPanel(null); 
        drawWheel(history[history.length - 1]);
        
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
    renderHistory(); 
}

window.setActiveIaTab = (idx) => { activeIaTab = idx; submitNumber(null, true, false); };

window.toggleDashboard = () => {
    const banner = document.getElementById('active-signal-container');
    banner.classList.toggle('signal-collapsed');
};

window.toggleSettings = () => {
    const content = document.getElementById('settings-content');
    const arrow = document.getElementById('settings-arrow');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
};

const clearBtn = document.getElementById('clear-btn');
if (clearBtn) clearBtn.addEventListener('click', wipeData);

tableSelect.addEventListener('change', async () => {
    currentTableId = tableSelect.value; if (!currentTableId) return;
    const spins = await apiFetchHistory(currentTableId); 
    wipeData(); 
    for (const s of spins) {
        if (s && s.number !== undefined) await submitNumber(s.number, true, true);
    }
    submitNumber(null, true, false);
});

async function loadTables() { 
    const ts = await apiFetchTables(); 
    if (tableSelect) {
        tableSelect.innerHTML = '<option value="">-- MESA --</option>' + ts.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); 
        // Auto-select first table if none selected
        if (ts.length > 0 && !currentTableId) {
            tableSelect.value = ts[0].id;
            tableSelect.dispatchEvent(new Event('change'));
        }
    }
}

// Real-time synchronization interval
async function syncData() {
    if (!currentTableId) return;
    try {
        const spins = await apiFetchHistory(currentTableId);
        // Only trigger full update if new spins arrived
        if (spins.length !== history.length) {
            wipeData();
            for (const s of spins) {
                if (s && s.number !== undefined) await submitNumber(s.number, true, true);
            }
            submitNumber(null, true, false);
        }
    } catch (e) { console.error("Sync Error:", e); }
}

document.addEventListener('DOMContentLoaded', () => { 
    loadTables(); 
    updateClock();
    // Start auto-sync polling
    setInterval(syncData, 5000); 
});
