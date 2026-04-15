// ============================================================
// app.js — SHADOW ROULETTE UI ENGINE
// ============================================================

const history = [];
const cwHistory = [];
const ccwHistory = [];

let lastSignal  = null;
let currentTableId = null;

let lastOverHitCW  = false;
let lastUnderHitCW = false;
let lastOverHitCCW = false;
let lastUnderHitCCW = false;

// ─── ZONE STATE ──────────────────────────────────────────────
const zoneOverHistory = [];   
const zoneUnderHistory = [];
const zone26History = [];
let lastZoneOverHit   = false;
let lastZoneUnderHit = false;
let lastZone26Hit    = false;

// Dynamic Reference Lines
let currentAvgCW = 10;
let currentAvgCCW = -10;

// ─── DOZENS STATE ──────────────────────────────────────────────
// ─── DOZENS STATE ──────────────────────────────────────────────
let dzCurrent = [];
let dzPrevious = [];
let dzSpinsSinceChange = 0;
const dzHistoryList = []; // Para almacenar las últimas 8 situaciones

// ─── JUGADAS STATE ───────────────────────────────────────────
let jugView = { magnitude: 'UNDER', direction: 'CW', confidence: 0 };
const jugHistory = [];
let lastJugHit = false;
let patternStatsCache = null;

// ─── ANALYST STATE (V26) ─────────────────────────────────────
const analystHistory = [];
let analystView = { signal: 'ANALIZANDO...', targetDir: null, size: null, reason: '-', type: 'neutral' };
let lastAnalystHit = false;

// ─── MASTER SNIPER STATE (CONFLUENCE) ─────────────────────────
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
        seqMag += Math.abs(d) >= 10 ? 'B' : 'S';
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


// HELPERS: WHEEL NEIGHBORS + DOZEN FILTER
const RED_NUMS_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numToDozClass(n) { return n===0?'fn-zero':(RED_NUMS_SET.has(n)?'fn-red':'fn-black'); }
function numToDoz(n) { return n>=1&&n<=12?1:(n>=13&&n<=24?2:(n>=25&&n<=36?3:0)); }
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
    const hasFilt = dzCurrent && dzCurrent.length > 0;
    return all
        .filter(n => !hasFilt || dzCurrent.includes(numToDoz(n)) || n===0)
        .map(n => `<span class="fn-ball ${numToDozClass(n)}">${n}</span>`)
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
    if (!confirm('⚠️ WIPE ALL DATA?')) return;
    const tableId = currentTableId;
    if (!tableId) { alert('Selecciona una mesa primero'); return; }
    fetch('/api/history/' + tableId, { method: 'DELETE' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(() => {
            history.length=0; cwHistory.length=0; ccwHistory.length=0;
            zoneOverHistory.length=0; zoneUnderHistory.length=0; zone26History.length=0;
            dzCurrent=[]; dzPrevious=[]; dzSpinsSinceChange=0; dzHistoryList.length=0; lastSignal=null;
            renderShadowPanel(); renderWheelAndHistory();
            alert('✅ Datos borrados.');
        }).catch(() => { history.length=0; cwHistory.length=0; ccwHistory.length=0; lastSignal=null; renderShadowPanel(); renderWheelAndHistory(); });
}

/// ─── RENDER: UNIFIED PANEL ───────────────────────────────

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
    // 1. DIR (ANDROID 1717)
    if (lastSignal) {
        // --- CW BLOCK ---
        document.getElementById('dir-cw-c-val').innerText = lastSignal.targetCW;
        document.getElementById('dir-cw-l-val').innerText = lastSignal.targetUnderCW;
        document.getElementById('dir-cw-r-val').innerText = lastSignal.targetOverCW;
        document.getElementById('dir-cw-l-hit').innerText = lastUnderHitCW ? '✔ HIT' : '';
        document.getElementById('dir-cw-r-hit').innerText = lastOverHitCW ? '✔ HIT' : '';

        // --- CCW BLOCK ---
        document.getElementById('dir-ccw-c-val').innerText = lastSignal.targetCCW;
        document.getElementById('dir-ccw-l-val').innerText = lastSignal.targetUnderCCW;
        document.getElementById('dir-ccw-r-val').innerText = lastSignal.targetOverCCW;
        document.getElementById('dir-ccw-l-hit').innerText = lastUnderHitCCW ? '✔ HIT' : '';
        document.getElementById('dir-ccw-r-hit').innerText = lastOverHitCCW ? '✔ HIT' : '';

        // Shared Tendency
        if (history.length >= 2) {
            const d = calcDist(history[history.length-2], history[history.length-1]);
            const trendTxt = `TEND: ${ d >= 0 ? 'DER ↺' : 'IZQ ↻'}`;
            document.getElementById('dir-cw-trend').innerText = trendTxt;
            document.getElementById('dir-ccw-trend').innerText = trendTxt;
        }

        // CW Stats
        const last12cw = cwHistory.slice(-12);
        const winsCW   = last12cw.filter(x => x === 'win').length;
        document.getElementById('dir-cw-w').innerText = winsCW;
        document.getElementById('dir-cw-l').innerText = last12cw.length - winsCW;
        document.getElementById('dir-cw-rate').innerText = last12cw.length > 0 ? ((winsCW / last12cw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-cw-perf').innerHTML = last12cw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // CCW Stats
        const last12ccw = ccwHistory.slice(-12);
        const winsCCW   = last12ccw.filter(x => x === 'win').length;
        document.getElementById('dir-ccw-w').innerText = winsCCW;
        document.getElementById('dir-ccw-l').innerText = last12ccw.length - winsCCW;
        document.getElementById('dir-ccw-rate').innerText = last12ccw.length > 0 ? ((winsCCW / last12ccw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-ccw-perf').innerHTML = last12ccw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- NEIGHBOR BALLS: DISABLED (Per user request: remove "bolitas") ---
        document.getElementById('dir-cw-c-balls').innerHTML  = '';
        document.getElementById('dir-cw-l-balls').innerHTML  = '';
        document.getElementById('dir-cw-r-balls').innerHTML  = '';
        document.getElementById('dir-ccw-c-balls').innerHTML = '';
        document.getElementById('dir-ccw-l-balls').innerHTML = '';
        document.getElementById('dir-ccw-r-balls').innerHTML = '';
    }

    // 2. SUP (ZONE SUPPORT)
    if (history.length >= 2) {
        const lastNum  = history[history.length - 1];
        const prevNum  = history[history.length - 2];
        const dVal = calcDist(prevNum, lastNum);
        const lastAbsDist = Math.abs(dVal);
        const idx = WHEEL_NUMS.indexOf(lastNum);

        // Classification Logic V5 (Dynamic OVER/UNDER - Vertical Position)
        // Over is ALWAYS physically above the reference line on the chart.
        let phaseLabel = "UNDER";
        if (dVal >= 0) phaseLabel = (dVal >= currentAvgCW) ? "OVER" : "UNDER";
        else          phaseLabel = (dVal >= currentAvgCCW) ? "OVER" : "UNDER";

        // --- UNDER BLOCK (Dynamic Logic) ---
        const underTarget = lastSignal ? lastSignal.targetUnderCW : WHEEL_NUMS[(idx + 5 + 37) % 37];
        const underLabel = (dVal < 0) ? (5 >= -currentAvgCCW ? "OVER" : "UNDER") : (5 >= currentAvgCW ? "OVER" : "UNDER"); 
        // Nota: Para simplificar, el label n4 se mantiene como UNDER/OVER segun la posicion
        document.getElementById('sup-s-c-val').innerText = underTarget;
        document.getElementById('sup-s-l-hit').innerText = lastZoneUnderHit ? '✔ HIT' : '';
        document.getElementById('sup-s-trend').innerText = `LAST: ${phaseLabel} (${dVal}p)`;

        const last12s = zoneUnderHistory.slice(-12);
        const winsS = last12s.filter(x => x === 'win').length;
        document.getElementById('sup-s-w').innerText = winsS;
        document.getElementById('sup-s-l').innerText = last12s.length - winsS;
        document.getElementById('sup-s-rate').innerText = last12s.length > 0 ? ((winsS / last12s.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-s-perf').innerHTML = last12s.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- OVER BLOCK (Dynamic Logic) ---
        const overTarget = lastSignal ? lastSignal.targetOverCW : WHEEL_NUMS[(idx + 14 + 37) % 37];
        document.getElementById('sup-b-c-val').innerText = overTarget;
        document.getElementById('sup-b-l-hit').innerText = lastZoneOverHit ? '✔ HIT' : '';
        document.getElementById('sup-b-trend').innerText = `LAST: ${phaseLabel} (${dVal}p)`;

        const last12b = zoneOverHistory.slice(-12);
        const winsB = last12b.filter(x => x === 'win').length;
        document.getElementById('sup-b-w').innerText = winsB;
        document.getElementById('sup-b-l').innerText = last12b.length - winsB;
        document.getElementById('sup-b-rate').innerText = last12b.length > 0 ? ((winsB / last12b.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-b-perf').innerHTML = last12b.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- NEIGHBOR BALLS: DISABLED (Per user request) ---
        document.getElementById('sup-s-c-balls').innerHTML = '';
        document.getElementById('sup-s-l-balls').innerHTML = '';
        document.getElementById('sup-s-r-balls').innerHTML = '';
        document.getElementById('sup-b-c-balls').innerHTML = '';
        document.getElementById('sup-b-l-balls').innerHTML = '';
        document.getElementById('sup-b-r-balls').innerHTML = '';
        // --- ZONE 26 STATS ---
        const last15z26 = zone26History.slice(-15);
        const winsZ26 = last15z26.filter(x => x === 'win').length;
        const rateZ26 = last15z26.length > 0 ? ((winsZ26 / last15z26.length) * 100).toFixed(0) : '0';
        document.getElementById('z26-rate').innerText = rateZ26 + '%';
        document.getElementById('z26-string').innerHTML = last15z26.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        renderDozens();
    } } catch (err) { 
        document.body.innerHTML += `<div style="color:red;z-index:9999;position:fixed;top:50px">${err.stack}</div>`;
        console.error('Error in renderShadowPanel:', err); 
    }
}

function renderDozens() {
    try {
        if (history.length < 18) {
            // Not enough data yet — refresh neighbor balls with unfiltered view
            renderShadowPanelNeighborsOnly();
            return;
        }

        // Map everything to dozens first.
        const dozens = history.map(n => {
            if (n === 0) return 0;
            if (n >= 1 && n <= 12) return 1;
            if (n >= 13 && n <= 24) return 2;
            return 3;
        });

        let cur = [];
        let prev = [];
        let spins = 0;

        // Replay history to build accurate State Machine for Dozens
        for (let i = 18; i <= dozens.length; i++) {
            const window = dozens.slice(i - 18, i).filter(d => d !== 0);
            if (window.length === 0) continue;

            const counts = {1:0, 2:0, 3:0};
            window.forEach(d => counts[d]++);
            
            // STABLE SORT: Si hay empate en conteo, priorizar la docena que YA es dominante.
            // Esto evita que salte a otra docena solo por un reordenamiento interno de Javascript.
            const sorted = [1,2,3].sort((a,b) => {
                if (counts[b] !== counts[a]) return counts[b] - counts[a];
                const aIsDom = cur.includes(a);
                const bIsDom = cur.includes(b);
                if (aIsDom && !bIsDom) return -1;
                if (!aIsDom && bIsDom) return 1;
                // Si ninguna es dominante (o ambas lo son), priorizamos la que haya salido más recientemente
                const lastIdxA = window.lastIndexOf(a);
                const lastIdxB = window.lastIndexOf(b);
                return lastIdxB - lastIdxA;
            });
            
            let top2 = [sorted[0], sorted[1]].sort();

            if (cur.length === 0) {
                cur = top2;
                spins = 0;
            } else {
                // STICKY LOGIC: Only switch if the "outsider" has a CLEAR lead (+2)
                const outsider = [1,2,3].find(d => !cur.includes(d));
                const dom1 = cur[0]; 
                const dom2 = cur[1];
                
                const shouldSwitch = (counts[outsider] > counts[dom1] + 1) || (counts[outsider] > counts[dom2] + 1);

                if (shouldSwitch && JSON.stringify(top2) !== JSON.stringify(cur)) {
                    // Guardar en historial si hubo estabilidad previa
                    if (spins > 5 && cur.length > 0) {
                        dzHistoryList.unshift({ dozens: [...cur], duration: spins });
                        if (dzHistoryList.length > 8) dzHistoryList.length = 8;
                    }
                    // Start TRANSITION
                    prev = [...cur];
                    cur = top2;
                    spins = 0;
                } else {
                    spins++;
                }
            }
        }
        
        // Sync to global vars
        dzCurrent = cur;
        dzPrevious = prev;
        dzSpinsSinceChange = spins;

        // UI: Dozen balls highlight logic (REFINED)
        [1,2,3].forEach(dz => {
            const el = document.getElementById(`dz-${dz}`);
            if(!el) return;
            
            el.classList.remove('dominant', 'dominant-transition');
            
            if (spins > 10) {
                // STABLE MODE: Highlight the current (new) dominants
                if (cur.includes(dz)) el.classList.add('dominant');
            } else {
                // TRANSITION/CONSOLIDATION MODE:
                // Special case: blink the PREVIOUS dominants until stability is reached
                if (prev.length > 0) {
                   if (prev.includes(dz)) el.classList.add('dominant-transition');
                } else {
                   // Initial state (no previous) -> just highlight current
                   if (cur.includes(dz)) el.classList.add('dominant');
                }
            }
        });

        // UI: Transition row
        const prevBadge    = document.getElementById('doc-memory-badge');
        const currBadge    = document.getElementById('doc-current-badge');
        const arrow        = document.getElementById('doc-transition-arrow');
        const statusEl     = document.getElementById('doc-transition-status');
        const infoEl       = document.getElementById('doc-info');

        const fmtDoz = arr => arr.length > 0 ? arr.map(d => d + '°').join(' & ') : '--';

        if (prevBadge) prevBadge.innerText = fmtDoz(prev);
        if (currBadge) currBadge.innerText = fmtDoz(cur);

        // Transition status indicator
        if (statusEl) {
            statusEl.className = 'transition-status'; // reset
            if (spins <= 5 && prev.length > 0) {
                statusEl.innerText = `⚠️ TRANSICIÓN (+${spins}t)`;
                statusEl.classList.add('warning');
                if (arrow) arrow.innerText = '→';
            } else if (spins <= 10) {
                statusEl.innerText = `CONSOLIDANDO (+${spins}t)`;
                statusEl.classList.add('warning');
                if (arrow) arrow.innerText = '→';
            } else {
                statusEl.innerText = `✅ ESTABLE (${spins}t)`;
                statusEl.classList.add('stable');
                if (arrow) arrow.innerText = '•';
            }
        }

        if (infoEl) {
            infoEl.innerText = `Ventana 18: Dom· ${fmtDoz(cur)}`;
        }

        // Detección de debilitamiento: Revisamos las últimas 18 tiradas.
        let weakWarning = '';
        if (spins > 8 && cur.length === 2 && history.length >= 18) {
             const recentDozens = dozens.slice(-18).filter(d => d !== 0);
             let iso1 = 0, iso2 = 0;
             let c1 = 0, c2 = 0;
             for (let i = 0; i < recentDozens.length; i++) {
                 if (recentDozens[i] === cur[0]) {
                     c1++;
                     if (recentDozens[i-1] !== cur[0] && recentDozens[i+1] !== cur[0]) iso1++;
                 }
                 if (recentDozens[i] === cur[1]) {
                     c2++;
                     if (recentDozens[i-1] !== cur[1] && recentDozens[i+1] !== cur[1]) iso2++;
                 }
             }
             // Débil si: aparece al menos 2 veces, y casi todas o todas sus apariciones están aisladas (separadas)
             const weak1 = (iso1 >= 2 && c1 > 0 && iso1 >= c1 - 1) || (c1 <= 2 && c1 > 0);
             const weak2 = (iso2 >= 2 && c2 > 0 && iso2 >= c2 - 1) || (c2 <= 2 && c2 > 0);
             
             if (weak1 && weak2) weakWarning = '⚠️ AMBAS DOCENAS DEBILITADAS';
             else if (weak1) weakWarning = `🟡 ${cur[0]}ª DOCENA DEBILITÁNDOSE (AISLADA)`;
             else if (weak2) weakWarning = `🟡 ${cur[1]}ª DOCENA DEBILITÁNDOSE (AISLADA)`;
        }
        
        const weakEl = document.getElementById('doc-weak-warning');
        if (weakEl) {
             if (weakWarning) {
                 weakEl.innerText = weakWarning;
                 weakEl.style.display = 'block';
             } else {
                 weakEl.style.display = 'none';
             }
        }
        
        // Render history list
        const histEl = document.getElementById('dz-hist-list');
        if (histEl) {
             if (dzHistoryList.length === 0) {
                 histEl.innerHTML = '<div class="dz-hist-item" style="opacity:0.5;justify-content:center">Sin datos aún</div>';
             } else {
                 histEl.innerHTML = dzHistoryList.map(h => `
                    <div class="dz-hist-item">
                        <span>${h.dozens.join('ª & ')}ª</span>
                        <span class="dur">duró ${h.duration}t</span>
                    </div>
                 `).join('');
             }
        }

        // Refresh neighbor balls now that dzCurrent is updated
        renderShadowPanelNeighborsOnly();

    } catch (err) { 
        console.error('Error in renderDozens:', err); 
    }
}

// ─── WHEEL DRAW ──────────────────────────────────────────────
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
    const last12 = history.slice(-12).reverse();
    strip.innerHTML = last12.map(n => {
        const cls = n===0 ? 'ball-zero' : (RED_NUMS.has(n) ? 'ball-red' : 'ball-black');
        return `<div class="mini-ball ${cls}">${n}</div>`;
    }).join('');
    // drawWheel removed
}

// ─── TAB LISTENERS ─────────────────────────────────────
document.addEventListener('click', (e) => {
    const allTabs = ['tab-btn-dir', 'tab-btn-sup', 'tab-btn-scatter'];
    const allPanels = ['panel-dir', 'panel-sup', 'panel-scatter'];
    const tabMap = { 'tab-btn-dir': 'panel-dir', 'tab-btn-sup': 'panel-sup', 'tab-btn-scatter': 'panel-scatter' };
    
    if (e.target && tabMap[e.target.id]) {
        allTabs.forEach(t => { const el = document.getElementById(t); if(el) el.classList.remove('active'); });
        allPanels.forEach(p => { const el = document.getElementById(p); if(el) el.style.display = 'none'; });
        e.target.classList.add('active');
        const panel = document.getElementById(tabMap[e.target.id]);
        if (panel) panel.style.display = 'flex';
        renderShadowPanel();
        if (e.target.id === 'tab-btn-scatter') renderScatterChart();
    }
});

// ─── SUBMIT NUMBER ─────────────────────────────────────────
function submitNumber(val, silent = false, batch = false) {
    const raw = val !== undefined ? val : '';
    const n = parseInt(raw);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        // Evaluate previous predictions before pushing to history
        if (lastSignal && history.length > 0) {
            // Main CW prediction — evaluated at N9 radius
            if (lastSignal.targetCW !== undefined) {
                const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
                cwHistory.push(distCW <= 9 ? 'win' : 'loss'); // N9 radius
                
                // Dynamically evaluate hits against under/over targets at N4
                lastUnderHitCW = Math.abs(calcDist(n, lastSignal.targetUnderCW)) <= 4;
                lastOverHitCW  = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
            }
            // Main CCW prediction — evaluated at N9 radius
            if (lastSignal.targetCCW !== undefined) {
                const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
                ccwHistory.push(distCCW <= 9 ? 'win' : 'loss'); // N9 radius
                
                // Dynamically evaluate hits against under/over targets at N4
                lastUnderHitCCW = Math.abs(calcDist(n, lastSignal.targetUnderCCW)) <= 4;
                lastOverHitCCW  = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
            }
        }
        
        // Evaluate ZONE OVER prediction — N9 of (idx + 14)
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const overTarget = lastSignal ? lastSignal.targetOverCW : WHEEL_NUMS[(idxZ + 14 + 37) % 37];
                const dOver = Math.abs(calcDist(prevForZone, n));
                const distToT = Math.abs(calcDist(n, overTarget));
                lastZoneOverHit = (distToT <= 9);
                zoneOverHistory.push(lastZoneOverHit ? 'win' : 'loss');
            }
        }

        // Evaluate ZONE UNDER prediction — N9 of (idx + 5)
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const underTarget = lastSignal ? lastSignal.targetUnderCW : WHEEL_NUMS[(idxZ + 5 + 37) % 37];
                const distToT = Math.abs(calcDist(n, underTarget));
                lastZoneUnderHit = (distToT <= 9);
                zoneUnderHistory.push(lastZoneUnderHit ? 'win' : 'loss');
            }
        }

        // Evaluate Zone 26 (Dist <= 9 to 26)
        const d26 = Math.abs(calcDist(n, 26));
        lastZone26Hit = (d26 <= 9);
        zone26History.push(lastZone26Hit ? 'win' : 'loss');

        // Evaluate JUGADAS prediction — only when ACTIVE (not charging)
        if (history.length >= 1 && jugView.isCharging === false) {
            const jump = calcDist(history[history.length - 1], n);
            const mag = Math.abs(jump);
            
            const hitMag = jugView.magnitude === 'UNDER' ? (mag <= 9 && mag >= 1) : (mag >= 10 && mag <= 18);
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
                const masterSignals = getIAMasterSignals(prox, sig, history, { cw: currentAvgCW, ccw: currentAvgCCW });
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
                    // Extract sector stats for 26
                    const last20 = zone26History.slice(-20);
                    const z26Wins = last20.filter(x => x === 'win').length;
                    const z26Rate = (z26Wins / (last20.length || 1)) * 100;
                    
                    masterView = analyzeMasterConfluence(history, analystView, jugView, { z26Rate });

                    // V5 Neural Overlay: If Agent 5 has Expert knowledge, it overrides
                    if (jugView.agent5_top_new && jugView.agent5_top_new.dnaMatch) {
                        masterView.signal = `🧠 NEURAL: ${jugView.agent5_top_new.direction}`;
                        masterView.reasons = jugView.agent5_top_new.reason;
                        masterView.confidence = Math.max(masterView.confidence, 90);
                        masterView.target = jugView.agent5_top_new.direction;
                    }

                    if (typeof AIChat !== 'undefined' && masterView.reasons) {
                        AIChat.onNewSpin(n, { 
                            masterConfidence: masterView.confidence,
                            isRhythm: String(masterView.reasons).includes('RITMO'),
                            rhythmName: masterView.reasons
                        });
                    }
                }

                if (!batch) {
                    if (history.length > 0) fetchPatternMemory(history);
                    renderShadowPanel();
                    renderWheelAndHistory();
                    renderTravelPanel();
                    renderAnalystUI();
                    renderMasterUI();
                }
            } catch(e) { console.error('Predict error:', e); }
        }
    }
}

// ─── RENDER: TRAVEL CHART (OFI-Style canvas) ──────────────
// ─── SCATTER CHART: DIRECTION DISPERSION (CW=+1, CCW=-1) ──────────
function renderScatterChart() {
    try {
        const canvas = document.getElementById('scatterChart');
        if (!canvas || history.length < 4) return;
        const ctx = canvas.getContext('2d');
        
        // Build direction data: CW=+1, CCW=-1
        const dirs = [];
        for (let i = 1; i < history.length; i++) {
            const d = calcDist(history[i-1], history[i]);
            dirs.push(d >= 0 ? 1 : -1);
        }
        if (dirs.length < 3) return;
        
        const numPoints = dirs.length;
        const pxPerPoint = 12;
        const totalW = Math.max(canvas.parentElement.offsetWidth || 400, numPoints * pxPerPoint + 60);
        canvas.width = totalW;
        const H = canvas.height;
        ctx.clearRect(0, 0, totalW, H);
        
        const padL = 30, padR = 15, padT = 20, padB = 20;
        const chartW = totalW - padL - padR;
        const chartH = H - padT - padB;
        const midY = padT + chartH / 2;
        const scaleY = v => midY - v * (chartH / 2 - 10);
        const scaleX = i => padL + (i / (numPoints - 1)) * chartW;
        
        // Background
        ctx.fillStyle = 'rgba(48, 224, 144, 0.03)'; ctx.fillRect(padL, padT, chartW, chartH / 2);
        ctx.fillStyle = 'rgba(240, 64, 96, 0.03)'; ctx.fillRect(padL, midY, chartW, chartH / 2);
        
        // Zero line
        ctx.strokeStyle = '#2a3a5d'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(totalW - padR, midY); ctx.stroke();
        
        // Y axis labels
        ctx.fillStyle = '#4a6080'; ctx.font = '9px Inter'; ctx.textAlign = 'right';
        ctx.fillText('+1 CW', padL - 3, scaleY(1) + 3);
        ctx.fillText('-1 CCW', padL - 3, scaleY(-1) + 3);
        ctx.fillText('0', padL - 3, midY + 3);
        
        // ─── Moving Average (window=5) ───
        const maWindow = 5;
        const ma = [];
        for (let i = 0; i < dirs.length; i++) {
            const start = Math.max(0, i - maWindow + 1);
            const slice = dirs.slice(start, i + 1);
            ma.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        
        // ─── Support / Resistance Detection ───
        // Support = average of the lowest MA valleys (CCW zones)
        // Resistance = average of the highest MA peaks (CW zones)
        const maPeaks = [], maValleys = [];
        for (let i = 1; i < ma.length - 1; i++) {
            if (ma[i] > ma[i-1] && ma[i] > ma[i+1]) maPeaks.push(ma[i]);
            if (ma[i] < ma[i-1] && ma[i] < ma[i+1]) maValleys.push(ma[i]);
        }
        const resistance = maPeaks.length > 0 ? maPeaks.reduce((a,b) => a+b, 0) / maPeaks.length : 0.8;
        const support = maValleys.length > 0 ? maValleys.reduce((a,b) => a+b, 0) / maValleys.length : -0.8;
        
        // Draw support/resistance lines
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(48, 224, 144, 0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(padL, scaleY(resistance)); ctx.lineTo(totalW - padR, scaleY(resistance)); ctx.stroke();
        ctx.strokeStyle = 'rgba(240, 64, 96, 0.5)';
        ctx.beginPath(); ctx.moveTo(padL, scaleY(support)); ctx.lineTo(totalW - padR, scaleY(support)); ctx.stroke();
        ctx.setLineDash([]);
        
        // Labels for support/resistance
        ctx.font = '8px Inter'; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(48, 224, 144, 0.7)'; ctx.fillText(`R: ${resistance.toFixed(2)}`, totalW - padR - 50, scaleY(resistance) - 4);
        ctx.fillStyle = 'rgba(240, 64, 96, 0.7)'; ctx.fillText(`S: ${support.toFixed(2)}`, totalW - padR - 50, scaleY(support) + 12);
        
        // ─── Moving Average Line (SUBTLE REFERENCE) ───
        ctx.strokeStyle = 'rgba(245, 200, 66, 0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]);
        ctx.beginPath();
        for (let i = 0; i < ma.length; i++) {
            const x = scaleX(i), y = scaleY(ma[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
        
        // ─── SHARP PEAKS LINE (ZIG-ZAG) ───
        // Esta línea conecta los puntos reales +1/-1 con ángulos cerrados como pidió Santi
        ctx.strokeStyle = '#30e090'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (let i = 0; i < dirs.length; i++) {
            const x = scaleX(i), y = scaleY(dirs[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1.0;
        
        // ─── Scatter Points (More visible) ───
        for (let i = 0; i < numPoints; i++) {
            const x = scaleX(i), y = scaleY(dirs[i]);
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = dirs[i] > 0 ? '#30e090' : '#f04060';
            ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        }
        
        // Last point highlight
        if (numPoints > 0) {
            const lx = scaleX(numPoints - 1), ly = scaleY(dirs[numPoints - 1]);
            ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.shadowBlur = 10; ctx.shadowColor = dirs[numPoints - 1] > 0 ? '#30e090' : '#f04060';
            ctx.stroke(); ctx.shadowBlur = 0;
        }
        
        // ─── Trend Detection ───
        const recent10 = dirs.slice(-10);
        const cwRatio = recent10.filter(d => d > 0).length / recent10.length;
        let trendLabel = 'NEUTRAL';
        let trendColor = '#6a8aa8';
        if (cwRatio >= 0.7) { trendLabel = '⬆️ TENDENCIA CW'; trendColor = '#30e090'; }
        else if (cwRatio <= 0.3) { trendLabel = '⬇️ TENDENCIA CCW'; trendColor = '#f04060'; }
        else if (cwRatio >= 0.55) { trendLabel = '↗️ SESGO CW LEVE'; trendColor = '#7ae0b0'; }
        else if (cwRatio <= 0.45) { trendLabel = '↙️ SESGO CCW LEVE'; trendColor = '#e07a90'; }
        
        const trendEl = document.getElementById('scatter-trend-label');
        if (trendEl) { trendEl.innerText = trendLabel; trendEl.style.color = trendColor; }
        
        const biasEl = document.getElementById('scatter-bias');
        if (biasEl) { biasEl.innerText = `${Math.round(cwRatio * 100)}% CW`; }
        
        // Scroll to rightmost point
        canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth;
        
    } catch(err) { console.error('Scatter chart error:', err); }
}

function renderTravelChart() {
    try {
    const canvas = document.getElementById('travelChart');
    if (!canvas || history.length < 3) return;
    const ctx = canvas.getContext('2d');
    
    // Build travel array
    const travels = [];
    for (let i = 1; i < history.length; i++) travels.push(calcDist(history[i-1], history[i]));
    if (travels.length < 2) return;
    
    // V5 SCROLLABLE: Show ALL data, expand canvas width as needed
    const pxPerPoint = 14;
    const minW = canvas.parentElement.offsetWidth || 400;
    const totalW = Math.max(minW, travels.length * pxPerPoint + 60);
    canvas.width = totalW;
    canvas.style.width = totalW + 'px';
    const W = totalW;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const data = travels; // ALL travels, not sliced
    const numPoints = data.length;

    // Averages
    const cwVals = data.filter(d => d > 0);
    const ccwVals = data.filter(d => d < 0);
    const avgCW  = cwVals.length  > 0 ? cwVals.reduce((a,b)=>a+b,0)/cwVals.length   :  10;
    const avgCCW = ccwVals.length > 0 ? ccwVals.reduce((a,b)=>a+b,0)/ccwVals.length : -10;
    
    // Update Global References for logic classification
    currentAvgCW = avgCW;
    currentAvgCCW = avgCCW;

    const allAbs = data.map(d=>Math.abs(d));
    const avgAbs = allAbs.reduce((a,b)=>a+b,0)/allAbs.length;
    const stdDev = Math.sqrt(allAbs.reduce((a,b)=>a+Math.pow(b-avgAbs,2),0)/allAbs.length);
    const upperRange = avgCW  + stdDev;
    const lowerRange = avgCCW - stdDev;

    const padL=30, padR=10, padT=14, padB=20;
    const chartW = W-padL-padR, chartH = H-padT-padB;
    const midY = padT + chartH/2;
    const maxVal = 18;
    const scaleY = v => midY - (v/maxVal)*(chartH/2);
    const scaleX = i => padL + (i/(numPoints-1))*chartW;

    // Grid
    ctx.strokeStyle='#1a2a3d'; ctx.lineWidth=0.5;
    for (let v=-15;v<=15;v+=5){ctx.beginPath();ctx.moveTo(padL,scaleY(v));ctx.lineTo(W-padR,scaleY(v));ctx.stroke();}
    ctx.strokeStyle='#2a3a5d'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padL,midY); ctx.lineTo(W-padR,midY); ctx.stroke();

    // Y labels
    ctx.fillStyle='#4a6080';ctx.font='9px Inter';ctx.textAlign='right';
    for(let v=-15;v<=15;v+=5){if(v===0)continue;ctx.fillText(v>0?`+${v}`:`${v}`,padL-4,scaleY(v)+3);}
    ctx.fillText('0',padL-4,midY+3);
    // X labels
    ctx.textAlign='center';ctx.fillStyle='#3a5070';
    const step=Math.max(1,Math.floor(numPoints/8));
    for(let i=0;i<numPoints;i+=step){ctx.fillText(travels.length-numPoints+i+1,scaleX(i),H-4);}

    // Range bands
    ctx.setLineDash([4,4]);
    ctx.strokeStyle='rgba(240,192,64,0.4)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(padL,scaleY(upperRange));ctx.lineTo(W-padR,scaleY(upperRange));ctx.stroke();
    ctx.strokeStyle='rgba(100,180,255,0.4)';
    ctx.beginPath();ctx.moveTo(padL,scaleY(lowerRange));ctx.lineTo(W-padR,scaleY(lowerRange));ctx.stroke();
    ctx.setLineDash([]);

    // AvgCW line (red)
    ctx.strokeStyle='#f04060';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);
    ctx.beginPath();ctx.moveTo(padL,scaleY(avgCW));ctx.lineTo(W-padR,scaleY(avgCW));ctx.stroke();
    // AvgCCW line (orange)
    ctx.strokeStyle='#ff8c40';
    ctx.beginPath();ctx.moveTo(padL,scaleY(avgCCW));ctx.lineTo(W-padR,scaleY(avgCCW));ctx.stroke();
    ctx.setLineDash([]);

    // Fill zones
    ctx.fillStyle='rgba(48,224,144,0.04)';ctx.fillRect(padL,padT,chartW,chartH/2);
    ctx.fillStyle='rgba(192,144,255,0.04)';ctx.fillRect(padL,midY,chartW,chartH/2);

    // Main line (SMOOTH WAVES V5)
    // Usamos curvas de Bézier cúbicas con puntos de control suavizados
    ctx.lineWidth=3; ctx.lineJoin='round'; ctx.lineCap='round';
    
    for(let i=0; i < numPoints - 1; i++){
        const x1 = scaleX(i), y1 = scaleY(data[i]);
        const x2 = scaleX(i+1), y2 = scaleY(data[i+1]);
        
        // Puntos de control para suavizado (Curva de Bézier)
        const cpX = (x1 + x2) / 2;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
        
        // Color dinámico según la zona y pérdida de rango
        const val = data[i+1];
        if(val > upperRange || val < lowerRange) ctx.strokeStyle='#f5c842';
        else ctx.strokeStyle = val >= 0 ? '#30e090' : '#f04060';
        
        // Sutil brillo en la línea
        ctx.shadowBlur = 4; ctx.shadowColor = ctx.strokeStyle;
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
        ctx.shadowBlur=8;ctx.shadowColor=data[numPoints-1]>=0?'#30e090':'#c090ff';
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
    
    // Auto-scroll to the rightmost point (latest spins)
    if (canvas.parentElement) {
        canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth;
    }

    } catch(err) { console.error(err); }
}

// ─── TRAVEL TABLE ──────────────────────────────────────────
function renderTravelPanel() {
    try {
        const tbody   = document.getElementById('travel-tbody');
    const patEl   = document.getElementById('travel-pattern');
    const lastZEl = document.getElementById('travel-last-zone');
    if (!tbody) return;

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
        
        if (pat === 'SÓLIDA') patClass = 'badge-solid';
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
            const label = (absDist >= 10) ? "BIG" : "SMALL";
            const pClass = label.toLowerCase();
            phaseHtml = `<span class="phase-pill pill-${pClass}">${label}</span>`;
        }
        const isLast = (i === 0);
        return `<tr${isLast ? ' class="last-row"' : ''}>
            <td class="${numClass}">${n}</td>
            <td style="color:var(--text2)">${absDist}p</td>
            <td class="${dirClass}">${dir} <span style="font-size:9px;opacity:0.5">${dist >= 0 ? '↺' : '↻'}</span></td>
            <td>${phaseHtml}</td>
        </tr>`;
    }).join('');

    renderTravelChart(); } catch (err) { console.error(err); }
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
            renderWheelAndHistory();
            renderMasterUI();
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
            if (data.type === 'ping') return;
            if (data.type === 'batch_load') {
                console.log("🔥 Lote recibido del bot. Resincronizando datos...");
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

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Neural Initialization V5
    if (typeof AIChat !== 'undefined') AIChat.init();
    
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);

    renderShadowPanel();
    renderTravelPanel();

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
                lastSignal = null;
                renderWheelAndHistory();
                
                const infoEl = document.getElementById('doc-info');
                if (infoEl) infoEl.innerText = 'Sincronizando...';
                
                await syncData();
                if (infoEl) infoEl.innerText = 'Listo';
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
// ─── ANALYST UI RENDERER ─────────────────────────────────────────
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
    else if (analystView.signal.includes('COMPRESIÓN')) signalEl.classList.add('compression');

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

// ─── MASTER UI RENDERER ─────────────────────────────────────────
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
    const last12 = masterHistory.slice(-12);
    const wins = last12.filter(x => x === 'win').length;
    const rate = last12.length > 0 ? ((wins / last12.length) * 100).toFixed(0) : 0;
    
    rateEl.innerText = `${rate}%`;
    perfEl.innerHTML = last12.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
}
