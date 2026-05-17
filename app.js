// app.js — SIMPLIFIED: DIR + Analyst + Sniper only

const history = [];
const cwHistory = [], ccwHistory = [], cwN4History = [], ccwN4History = [];
let lastSignal = null, currentTableId = null;
let lastOverHitCW = false, lastUnderHitCW = false, lastOverHitCCW = false, lastUnderHitCCW = false;

// Analyst & Master state
const analystHistory = [], masterHistory = [];
let analystView = { signal: 'ANALIZANDO...', targetDir: null, size: null, reason: '-', type: 'neutral' };
let masterView = { signal: 'SYNCHRONIZING...', target: null, confidence: 0, reasons: '-', type: 'neutral' };
let lastAnalystHit = false, lastMasterHit = false;

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_NUMS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

function calcDist(from, to) {
    const i1 = WHEEL_NUMS.indexOf(from), i2 = WHEEL_NUMS.indexOf(to);
    if (i1 === -1 || i2 === -1) return 0;
    let d = i2 - i1;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

function renderShadowPanel() {
    try {
        if (!lastSignal) return;
        document.getElementById('dir-cw-c-val').innerText = lastSignal.targetCW ?? '--';
        document.getElementById('dir-cw-l-val').innerText = lastSignal.targetUnderCW ?? '--';
        document.getElementById('dir-cw-r-val').innerText = lastSignal.targetOverCW ?? '--';
        document.getElementById('dir-ccw-c-val').innerText = lastSignal.targetCCW ?? '--';
        document.getElementById('dir-ccw-l-val').innerText = lastSignal.targetUnderCCW ?? '--';
        document.getElementById('dir-ccw-r-val').innerText = lastSignal.targetOverCCW ?? '--';
        
        const last10cw = cwHistory.slice(-10), winsCW = last10cw.filter(x => x === 'win').length;
        document.getElementById('dir-cw-w').innerText = winsCW;
        document.getElementById('dir-cw-l').innerText = last10cw.length - winsCW;
        document.getElementById('dir-cw-rate').innerText = last10cw.length > 0 ? ((winsCW/last10cw.length)*100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-cw-perf').innerHTML = last10cw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('') || '--';
        
        const last10ccw = ccwHistory.slice(-10), winsCCW = last10ccw.filter(x => x === 'win').length;
        document.getElementById('dir-ccw-w').innerText = winsCCW;
        document.getElementById('dir-ccw-l').innerText = last10ccw.length - winsCCW;
        document.getElementById('dir-ccw-rate').innerText = last10ccw.length > 0 ? ((winsCCW/last10ccw.length)*100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-ccw-perf').innerHTML = last10ccw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('') || '--';
    } catch(e) { console.error('renderShadowPanel:', e); }
}

function renderAnalystUI() {
    const signalEl = document.getElementById('analyst-signal');
    const dirEl = document.getElementById('analyst-dir');
    const sizeEl = document.getElementById('analyst-size');
    const reasonEl = document.getElementById('analyst-reason');
    const rateEl = document.getElementById('analyst-rate');
    const perfEl = document.getElementById('analyst-perf-string');
    if (!signalEl) return;
    
    signalEl.innerText = analystView.signal;
    signalEl.style.color = analystView.type === 'bullish' ? 'var(--green)' : analystView.type === 'bearish' ? 'var(--red)' : '#fff';
    
    if (analystView.targetDir) {
        dirEl.innerText = analystView.targetDir;
        dirEl.style.display = 'inline-block';
        dirEl.style.background = analystView.targetDir === 'CW' ? 'rgba(48,224,144,0.15)' : 'rgba(192,144,255,0.15)';
    } else dirEl.style.display = 'none';
    
    if (analystView.size) {
        sizeEl.innerText = analystView.size;
        sizeEl.style.display = 'inline-block';
    } else sizeEl.style.display = 'none';
    
    reasonEl.innerText = analystView.reason;
    const last10 = analystHistory.slice(-10), wins = last10.filter(x => x === 'win').length;
    rateEl.innerText = last10.length > 0 ? ((wins/last10.length)*100).toFixed(0) + '%' : '0%';
    perfEl.innerHTML = last10.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
}

function renderMasterUI() {
    const signalEl = document.getElementById('master-signal');
    const targetEl = document.getElementById('master-target');
    const reasonEl = document.getElementById('master-reason');
    const confText = document.getElementById('master-conf-text');
    const confFill = document.getElementById('master-conf-fill');
    const rateEl = document.getElementById('master-rate');
    const perfEl = document.getElementById('master-perf');
    if (!signalEl) return;
    
    signalEl.innerText = masterView.signal;
    targetEl.innerText = masterView.target ?? '--';
    reasonEl.innerText = masterView.reasons || '--';
    confText.innerText = masterView.confidence + '%';
    confFill.style.width = masterView.confidence + '%';
    signalEl.style.color = masterView.confidence >= 80 ? '#ffeb3b' : '#fff';
    
    const last10 = masterHistory.slice(-10), wins = last10.filter(x => x === 'win').length;
    rateEl.innerText = last10.length > 0 ? ((wins/last10.length)*100).toFixed(0) + '%' : '0%';
    perfEl.innerHTML = last10.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
}

function renderTravelPanel() {
    const tbody = document.getElementById('travel-tbody');
    if (!tbody || history.length < 2) return;
    tbody.innerHTML = history.slice(-50).reverse().map((n, i) => {
        const prev = history[history.length - 1 - i - 1];
        const dist = prev !== undefined ? calcDist(prev, n) : 0;
        const dir = dist > 0 ? 'DER' : (dist < 0 ? 'IZQ' : '--');
        const numClass = n === 0 ? 'num-zero' : (RED_NUMS.has(n) ? 'num-red' : 'num-black');
        return `<tr${i===0?' class="last-row"':''}><td class="${numClass}">${n}</td><td>${Math.abs(dist)}p</td><td>${dir}</td><td>${Math.abs(dist)>=9?'BIG':'SMALL'}</td></tr>`;
    }).join('');
}

function submitNumber(val) {
    const n = parseInt(val);
    if (isNaN(n) || n < 0 || n > 36) return;
    
    if (lastSignal && history.length > 0) {
        const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
        cwHistory.push(distCW <= 9 ? 'win' : 'loss');
        lastUnderHitCW = Math.abs(calcDist(n, lastSignal.targetUnderCW)) <= 4;
        lastOverHitCW = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
        cwN4History.push((lastUnderHitCW || lastOverHitCW) ? 'win' : 'loss');
        
        const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
        ccwHistory.push(distCCW <= 9 ? 'win' : 'loss');
        lastUnderHitCCW = Math.abs(calcDist(n, lastSignal.targetUnderCCW)) <= 4;
        lastOverHitCCW = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
        ccwN4History.push((lastUnderHitCCW || lastOverHitCCW) ? 'win' : 'loss');
    }
    
    if (history.length >= 1 && analystView.targetDir) {
        const jump = calcDist(history[history.length - 1], n);
        const dirHit = (analystView.targetDir === 'CW' && jump >= 0) || (analystView.targetDir === 'CCW' && jump < 0);
        lastAnalystHit = dirHit;
        analystHistory.push(lastAnalystHit ? 'win' : 'loss');
    }
    
    if (history.length >= 1 && masterView.target) {
        const jump = calcDist(history[history.length - 1], n);
        const dirHit = (masterView.target === 'CW' && jump >= 0) || (masterView.target === 'CCW' && jump < 0);
        lastMasterHit = dirHit;
        masterHistory.push(lastMasterHit ? 'win' : 'loss');
    }
    
    history.push(n);
    
    if (typeof computeDealerSignature === 'function' && history.length >= 3) {
        try {
            const sig = computeDealerSignature(history);
            const prox = projectNextRound(history, {});
            const masterSignals = getIAMasterSignals(prox, sig, history);
            if (masterSignals?.length > 0) lastSignal = masterSignals[0];
            
            const travels = [];
            for (let i = 1; i < history.length; i++) travels.push(calcDist(history[i-1], history[i]));
            analystView = analyzeTravelWave(travels);
            
            const jugView = predictZonePattern(history, null);
            masterView = analyzeMasterConfluence(history, analystView, jugView, {});
        } catch(e) { console.error('Predict error:', e); }
    }
    
    renderShadowPanel();
    renderTravelPanel();
    renderAnalystUI();
    renderMasterUI();
}

function wipeData() {
    if (!confirm('⚠ WIPE ALL DATA?')) return;
    history.length = 0;
    cwHistory.length = 0; ccwHistory.length = 0; cwN4History.length = 0; ccwN4History.length = 0;
    analystHistory.length = 0; masterHistory.length = 0;
    lastSignal = null;
    renderShadowPanel();
    renderTravelPanel();
    renderAnalystUI();
    renderMasterUI();
}

// Tab handling
document.addEventListener('click', (e) => {
    const tabMap = { 'tab-btn-dir': 'panel-dir', 'tab-btn-scatter': 'panel-scatter', 'tab-btn-analisis': 'panel-analisis', 'tab-btn-chat': 'panel-chat' };
    if (tabMap[e.target.id]) {
        ['panel-dir', 'panel-scatter', 'panel-analisis', 'panel-chat'].forEach(p => document.getElementById(p).style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabMap[e.target.id]).style.display = 'flex';
    }
});

// Load initial
document.addEventListener('DOMContentLoaded', () => {
    renderShadowPanel();
    renderTravelPanel();
});
