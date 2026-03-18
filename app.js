// ============================================================
// app.js — BULLETPROOF INITIALIZATION
// ============================================================

const history      = [];
const iaSignalsHistory = [ [], [], [], [], [] ]; 
let activeIaTab    = 0; 
let lastIaSignals = [
    { top: 17, rule: 'READY' },
    { top: 16, rule: 'READY' },
    { top: 5,  rule: 'READY' },
    { top: 22, rule: 'READY' },
    { top: 10, rule: 'READY' }
]; 

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_NUMS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// Selectors
const activeAgentLabel = document.getElementById('active-agent-name');
const historyEl       = document.getElementById('history-strip');
const tableSelect     = document.getElementById('table-select');
const travelTbody     = document.getElementById('travel-tbody');
const targetNumEl     = document.getElementById('target-number');
const wheelCanvas     = document.getElementById('wheel-canvas');
const wheelCtx        = wheelCanvas ? wheelCanvas.getContext('2d') : null;

let currentTableId = null;

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
    const cx = 110, cy = 110;
    ctx.clearRect(0, 0, 220, 220);

    const goldColor = '#f5c842';

    ctx.beginPath(); ctx.arc(cx, cy, 105, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a'; ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();

    WHEEL_NUMS.forEach((n, i) => {
        const startAng = (i * (360 / 37) - 90 - (360/74)) * (Math.PI / 180);
        const endAng   = (i * (360 / 37) - 90 + (360/74)) * (Math.PI / 180);
        const midAng   = (i * (360 / 37) - 90) * (Math.PI / 180);

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(startAng) * 60, cy + Math.sin(startAng) * 60);
        ctx.arc(cx, cy, 100, startAng, endAng);
        ctx.lineTo(cx + Math.cos(endAng) * 60, cy + Math.sin(endAng) * 60);
        ctx.closePath();
        
        ctx.fillStyle = (n === 0) ? '#008b00' : (RED_NUMS.has(n) ? '#c41e3a' : '#000');
        ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5; ctx.stroke();

        const rx = cx + Math.cos(midAng) * 82;
        const ry = cy + Math.sin(midAng) * 82;
        
        ctx.save();
        ctx.translate(rx, ry); ctx.rotate(midAng + Math.PI/2);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Inter';
        ctx.textAlign = 'center'; ctx.fillText(n, 0, 4);
        ctx.restore();

        if (n === highlightNum) {
            ctx.beginPath(); ctx.arc(rx, ry, 14, 0, Math.PI * 2);
            ctx.strokeStyle = goldColor; ctx.lineWidth = 3; ctx.stroke();
            const bx = cx + Math.cos(midAng) * 105;
            const by = cy + Math.sin(midAng) * 105;
            ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI*2);
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
            ctx.fill(); ctx.shadowBlur = 0;
        }
    });

    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
    gr.addColorStop(0, '#333'); gr.addColorStop(1, '#000');
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI*2);
    ctx.fillStyle = gr; ctx.fill();
}

function renderHistory() {
    if (!historyEl) return;
    historyEl.innerHTML = history.slice(-15).reverse().map((n, idx) => {
        const color = (n === 0) ? 'green' : (RED_NUMS.has(n) ? 'red' : 'black');
        return `<div class="hist-ball hist-${color} ${idx === 0 ? 'hist-latest' : ''}">${n}</div>`;
    }).join('');
}

function renderSignalsPanel(signals) {
    const tabStrip = document.getElementById('strat-tabs');
    if (!tabStrip) return;

    const names = ['N17', 'N16', 'N17PLUS', 'N18', 'CELULA'];
    tabStrip.innerHTML = names.map((name, idx) => {
        const h = iaSignalsHistory[idx] || [];
        const winCount = h.filter(x => x === 'win').length;
        const wL = `W-L ${winCount}-${h.length - winCount}`;
        return `<div class="ia-tab ${idx === activeIaTab ? 'active' : ''}" onclick="setActiveIaTab(${idx})">
            <span>${name}</span>
            <div class="stat-line">${wL}</div>
        </div>`;
    }).join('');

    if (activeAgentLabel) activeAgentLabel.innerText = names[activeIaTab];

    const s = signals[activeIaTab];
    if (targetNumEl) targetNumEl.innerText = (s && s.top) ? s.top : '--';
    
    const smallBox = document.getElementById('pred-small-val');
    const bigBox = document.getElementById('pred-big-val');
    const targetLabel = document.querySelector('.target-box .label');

    if (targetLabel && s) {
        targetLabel.innerText = s.radius ? `TARGET POCKET (${s.radius})` : 'TARGETED POCKET';
    }

    if (smallBox && bigBox && s && s.top) {
        const smallLabel = smallBox.parentElement.querySelector('.label');
        const bigLabel = bigBox.parentElement.querySelector('.label');

        if (s.top >= 1 && s.top <= 9) {
            smallBox.innerText = s.top;
            smallBox.style.opacity = '1';
            if (smallLabel) smallLabel.innerText = "SMALL (N4)";
            
            bigBox.innerText = 'BIG';
            bigBox.style.opacity = '0.3';
            if (bigLabel) bigLabel.innerText = "BIG 10-18";
        } else if (s.top >= 10 && s.top <= 19) {
            bigBox.innerText = s.top;
            bigBox.style.opacity = '1';
            if (bigLabel) bigLabel.innerText = "BIG (N4)";
            
            smallBox.innerText = 'SMALL';
            smallBox.style.opacity = '0.3';
            if (smallLabel) smallLabel.innerText = "SMALL 1-9";
        } else {
            smallBox.innerText = 'SMALL';
            bigBox.innerText = 'BIG';
            smallBox.style.opacity = '0.3';
            bigBox.style.opacity = '0.3';
            if (smallLabel) smallLabel.innerText = "SMALL 1-9";
            if (bigLabel) bigLabel.innerText = "BIG 10-18";
        }
    }
}

function renderTravelPanel() {
    if (!travelTbody) return;
    if (history.length < 2) {
        travelTbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center; padding:30px;">Analyzing data...</td></tr>';
        return;
    }

    travelTbody.innerHTML = history.slice(-50).reverse().map((n, i) => {
        const idx = history.length - 1 - i;
        const prev = history[history.length - 2 - i];
        const dist = (prev !== undefined) ? calcDist(prev, n) : 0;
        const color = (n === 0) ? 'val-up' : (RED_NUMS.has(n) ? 'val-down' : '');
        
        let phase = ''; // Remove ULTRA-BIG/Other labels
        if (n >= 1 && n <= 9) phase = 'SMALL';
        else if (n >= 10 && n <= 19) phase = 'BIG';

        return `<tr>
            <td>${idx + 1}</td>
            <td class="${color}" style="font-weight:900;">${n}</td>
            <td style="color:var(--text);">${Math.abs(dist)}</td>
            <td style="color:var(--accent); font-weight:800;">${dist >= 0 ? 'DERECHA' : 'IZQUIERDA'}</td>
            <td style="font-weight:900; color:${phase === 'SMALL' ? 'var(--green)' : (phase === 'BIG' ? 'var(--red)' : '#fff')}">${phase}</td>
        </tr>`;
    }).join('');
}

async function submitNumber(val, silent = false, batch = false) {
    let n = parseInt(val);
    if (!isNaN(n) && n >= 0 && n <= 36) {
        history.push(n);
        lastIaSignals.forEach((s, idx) => {
            if (!s) return;
            const target = s.top;
            if (target !== null) {
                const win = (Math.abs(calcDist(n, target)) <= 4);
                iaSignalsHistory[idx].push(win ? 'win' : 'loss');
            }
        });
    }

    if (typeof computeDealerSignature === 'function') {
        try {
            const sig = computeDealerSignature(history);
            const prx = projectNextRound(history, {});
            const sigs = getIAMasterSignals(prx, sig, history);
            lastIaSignals = [
                { top: sig.casilla1 }, { top: sig.casilla10 }, { top: sig.casilla14 }, { top: sig.casilla19 }, { top: sig.casilla5 }
            ];
        } catch(e) {}
    }

    if (!batch) {
        renderHistory(); renderTravelPanel();
        drawWheel(history[history.length - 1]);
        renderSignalsPanel(lastIaSignals);
    }
}

async function syncData() {
    if (!currentTableId) return;
    try {
        const r = await fetch(`/api/history/${currentTableId}`);
        if (!r.ok) return;
        const spins = await r.json();
        if (spins.length !== history.length) {
            history.length = 0;
            iaSignalsHistory.forEach(h => h.length = 0);
            for (const s of spins) await submitNumber(s.number, true, true);
            submitNumber(null, true, false);
        }
    } catch(e) {}
}

window.setActiveIaTab = (idx) => { activeIaTab = idx; renderSignalsPanel(lastIaSignals); };

document.addEventListener('DOMContentLoaded', async () => {
    // 1. IMMEDIATE RENDER
    setInterval(() => { 
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString(); 
    }, 1000);

    drawWheel();
    renderSignalsPanel(lastIaSignals);
    renderTravelPanel();

    // 2. BACKGROUND FETCH
    try {
        const r = await fetch('/api/tables');
        if (r.ok) {
            const ts = await r.json();
            if (tableSelect && ts.length > 0) {
                tableSelect.innerHTML = ts.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                tableSelect.addEventListener('change', () => { currentTableId = tableSelect.value; history.length = 0; syncData(); });
                currentTableId = ts[0].id;
                syncData();
            }
        }
    } catch (e) { console.error("API Error:", e); }

    setInterval(syncData, 5000);
});
