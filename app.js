// ============================================================
// app.js — SHADOW ROULETTE UI ENGINE
// ============================================================

const history = [];
const cwHistory = [];
const ccwHistory = [];

let currentView = 'CW'; // toggled by SWITCH SIDE
let lastSignal = null;
let currentTableId = null;

let lastOverHitCW = false;
let lastBigHitCW = false;
let lastOverHitCCW = false;
let lastBigHitCCW = false;

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

// ─── RENDER: SHADOW PANEL ──────────────────────────────────
function renderShadowPanel() {
    if (!lastSignal) return;

    const targetEl = document.getElementById('pred-target');
    const wrateEl = document.getElementById('w-rate');
    const streakEl = document.getElementById('wl-streak');
    const patternEl = document.getElementById('pattern-next');
    const dirEl = document.getElementById('pred-dir');
    const topCwEl = document.getElementById('top-cw');
    const topCcwEl = document.getElementById('top-ccw');
    const spinsEl = document.getElementById('pred-spins');

    // Select the array and target based on current view
    const isCW = currentView === 'CW';
    const activeHistory = isCW ? cwHistory : ccwHistory;
    const activeTarget = isCW ? lastSignal.targetCW : lastSignal.targetCCW;
    const activeOver = isCW ? lastSignal.targetOverCW : lastSignal.targetOverCCW;
    const activeBig = isCW ? lastSignal.targetBigCW : lastSignal.targetBigCCW;

    if (targetEl) targetEl.innerText = activeTarget !== undefined ? activeTarget : '--';
    if (dirEl) dirEl.innerText = currentView;
    if (topCwEl) topCwEl.innerText = activeOver !== undefined ? activeOver : '--';
    if (topCcwEl) topCcwEl.innerText = activeBig !== undefined ? activeBig : '--';
    
    const overHitEl = document.getElementById('hit-over');
    const bigHitEl = document.getElementById('hit-big');
    const overHitState = isCW ? lastOverHitCW : lastOverHitCCW;
    const bigHitState = isCW ? lastBigHitCW : lastBigHitCCW;
    if (overHitEl) overHitEl.innerText = overHitState ? 'LAST HIT! ✔' : '';
    if (bigHitEl) bigHitEl.innerText = bigHitState ? 'LAST HIT! ✔' : '';

    // Win Rate & Streak
    if (activeHistory.length > 0) {
        const wins = activeHistory.filter(x => x === 'win').length;
        const rate = ((wins / activeHistory.length) * 100).toFixed(2);
        if (wrateEl) wrateEl.innerText = `${rate}%`;
        if (spinsEl) spinsEl.innerText = activeHistory.length;
        
        let streakHtml = activeHistory.slice(-15).map(r => 
            `<span style="color:${r === 'win' ? '#0f0' : '#f00'}; margin-right:2px;">${r === 'win' ? 'W' : 'L'}</span>`
        ).join(',');
        if (streakEl) streakEl.innerHTML = streakHtml;

        // Simple pattern predict (always predict Win if W-Rate is good, else Lose - visual flair)
        if (patternEl) {
            patternEl.innerText = rate > 20 ? 'WIN' : 'LOSE';
            patternEl.style.color = rate > 20 ? '#0f0' : '#f00';
        }
    } else {
        if (wrateEl) wrateEl.innerText = '0.00%';
        if (streakEl) streakEl.innerHTML = '--';
        if (spinsEl) spinsEl.innerText = '0';
    }
}

// ─── SWITCH SIDE ──────────────────────────────────────────
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-switch-side') {
        currentView = currentView === 'CW' ? 'CCW' : 'CW';
        renderShadowPanel();
    }
});

// ─── SUBMIT NUMBER ─────────────────────────────────────────
function submitNumber(val, silent = false, batch = false) {
    const raw = val !== undefined ? val : '';
    const n = parseInt(raw);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        // Evaluate previous predictions before pushing to history
        if (lastSignal && history.length > 0) {
            // Evaluates CW N4
            if (lastSignal.targetCW !== undefined) {
                const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
                cwHistory.push(distCW <= 4 ? 'win' : 'loss'); // N4 radius
                lastOverHitCW = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
                lastBigHitCW = Math.abs(calcDist(n, lastSignal.targetBigCW)) <= 4;
            }
            // Evaluates CCW N4
            if (lastSignal.targetCCW !== undefined) {
                const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
                ccwHistory.push(distCCW <= 4 ? 'win' : 'loss'); // N4 radius
                lastOverHitCCW = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
                lastBigHitCCW = Math.abs(calcDist(n, lastSignal.targetBigCCW)) <= 4;
            }
        }
        
        history.push(n);

        // Compute new predictions
        if (typeof computeDealerSignature === 'function' && history.length >= 3) {
            try {
                const sig  = computeDealerSignature(history);
                const prox = projectNextRound(history, {});
                const masterSignals = getIAMasterSignals(prox, sig, history);
                if (masterSignals && masterSignals.length > 0) {
                    lastSignal = masterSignals[0];
                }
            } catch(e) { console.error('Predict error:', e); }
        }
    }

    if (!batch) {
        renderShadowPanel();
        renderTravelPanel();
    }
}

// ─── TRAVEL TABLE (UNCHANGED) ──────────────────────────────
function renderTravelPanel() {
    const tbody   = document.getElementById('travel-tbody');
    const patEl   = document.getElementById('travel-pattern');
    const lastZEl = document.getElementById('travel-last-zone');
    if (!tbody) return;

    if (history.length < 2) {
        tbody.innerHTML = '<tr><td colspan="4" class="muted">Selecciona una mesa...</td></tr>';
        return;
    }

    // Pattern badge
    if (patEl) {
        const last5 = history.slice(-5);
        const bigCount   = last5.filter(n => n >= 10 && n <= 19).length;
        const smallCount = last5.filter(n => n >= 1 && n <= 9).length;
        const dirs = [];
        for (let i = history.length - 4; i < history.length; i++) {
            if (i > 0) dirs.push(calcDist(history[i-1], history[i]) > 0 ? 'D' : 'I');
        }
        const isZigZagDir = dirs.length >= 2 && dirs[dirs.length-1] !== dirs[dirs.length-2];
        
        let pat = 'ESTABLE', patClass = 'badge-stable';
        if (isZigZagDir) { pat = 'ZIG ZAG ↔'; patClass = 'badge-zigzag'; }
        else if (bigCount >= 3) { pat = 'BIG TREND'; patClass = 'badge-zone'; }
        else if (smallCount >= 3) { pat = 'SMALL TREND'; patClass = 'badge-stable'; }
        
        patEl.textContent = pat;
        patEl.className = `badge ${patClass}`;
    }

    const lastN = history[history.length - 1];
    if (lastZEl) {
        if (lastN >= 1 && lastN <= 9)        { lastZEl.textContent = 'LAST: SMALL'; lastZEl.style.color = 'var(--green)'; }
        else if (lastN >= 10 && lastN <= 19) { lastZEl.textContent = 'LAST: BIG';   lastZEl.style.color = 'var(--red)'; }
        else                                 { lastZEl.textContent = `LAST: ${lastN}`; lastZEl.style.color = 'var(--muted)'; }
    }

    tbody.innerHTML = history.slice(-50).reverse().map((n, i) => {
        const idxInHistory = history.length - 1 - i;
        const prev = history[idxInHistory - 1];
        const dist = (prev !== undefined) ? calcDist(prev, n) : 0;
        const absDist = Math.abs(dist);
        const dir  = dist > 0 ? 'DER.' : (dist < 0 ? 'IZQ.' : '--');
        
        const numClass = (n === 0) ? 'num-zero' : (RED_NUMS.has(n) ? 'num-red' : 'num-black');
        const dirClass = dist >= 0 ? 'dir-der' : 'dir-izq';
        
        let phaseHtml = '';
        if (absDist >= 1 && absDist <= 9)        phaseHtml = `<span class="phase-pill pill-small">SMALL</span>`;
        else if (absDist >= 10 && absDist <= 19) phaseHtml = `<span class="phase-pill pill-big">BIG</span>`;

        const isLast = (i === 0);
        return `<tr>
            <td class="row-n">${idxInHistory + 1}${isLast ? '<span style="font-size:8px;color:var(--accent)"> ★</span>' : ''}</td>
            <td class="${numClass}">${n}</td>
            <td style="color:var(--text2)">${absDist}p</td>
            <td class="${dirClass}">${dir} <span style="font-size:9px;opacity:0.6">${dist >= 0 ? '↺' : '↻'}</span></td>
            <td>${phaseHtml}</td>
        </tr>`;
    }).join('');

    // Update Travel Chart.js
    const canvas = document.getElementById('travelChart');
    if (canvas && history.length >= 2) {
        const d50 = history.slice(-50);
        const dt = [];
        for (let i = 1; i < d50.length; i++) {
            dt.push(calcDist(d50[i-1], d50[i]));
        }
        if (window.travelChartInstance) window.travelChartInstance.destroy();
        window.travelChartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: dt.map((_, i) => i),
                datasets: [{
                    label: 'Dist',
                    data: dt,
                    borderColor: '#00e5c8',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointBackgroundColor: dt.map(v => Math.abs(v) >= 10 ? '#f04060' : '#30e090'),
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { min: -18, max: 18, ticks: { color: '#4a6080', stepSize: 6 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { display: false }
                }
            }
        });
    }
}

// ─── SYNC FROM SERVER ────────────────────────────────────────
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
            lastSignal = null;
            for (const s of spins) submitNumber(s.number, true, true);
            renderShadowPanel();
            renderTravelPanel();
        }
    } catch(e) {}
}

let eventSource = null;
function connectSSE(tId) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    eventSource = new EventSource(`/api/events/${tId}`);
    eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'new_spin' && data.number !== undefined) {
                // Instantly react to new live spins
                submitNumber(data.number, false, false);
            }
        } catch(err) {}
    };
}

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);

    renderShadowPanel();
    renderTravelPanel();

    try {
        const r = await fetch('/api/tables');
        if (r.ok) {
            const ts = await r.json();
            const tableSelect = document.getElementById('table-select');
            if (tableSelect && ts.length > 0) {
                tableSelect.innerHTML = ts.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                tableSelect.addEventListener('change', () => {
                    currentTableId = tableSelect.value;
                    history.length = 0;
                    cwHistory.length = 0;
                    ccwHistory.length = 0;
                    lastSignal = null;
                    syncData().then(() => connectSSE(currentTableId));
                });
                currentTableId = ts[0].id;
                await syncData();
                connectSSE(currentTableId);
            }
        }
    } catch (e) { console.warn('API not reachable, offline mode.'); }
});
