// Version bump 20240421

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

// ——— ZONE STATE ——————————————————————————————————————————————
const zoneOverHistory = [];   
const zoneUnderHistory = [];
const zone26History = [];
let lastZoneOverHit   = false;
let lastZoneUnderHit = false;
let lastZone26Hit    = false;

// Dynamic Reference Lines
let currentAvgCW = 9;
let currentAvgCCW = -9;
let predictorOffset = 0; // CALIBRACIÓN MANUAL DEL PREDICTOR (± casillas)

// ——— DOZENS STATE ———————————————————————————————————————————
// ——— DOZENS STATE ———————————————————————————————————————————
let dzCurrent = [];
let dzPrevious = [];
let dzSpinsSinceChange = 0;
const dzHistoryList = []; // Para almacenar las íºltimas 8 situaciones

// ——— JUGADAS STATE ———————————————————————————————————————————
let jugView = { magnitude: 'UNDER', direction: 'CW', confidence: 0 };
const jugHistory = [];
let lastJugHit = false;
let patternStatsCache = null;

// ——— ANALYST STATE (V26) —————————————————————————————————————
const analystHistory = [];
let analystView = { signal: 'ANALIZANDO...', targetDir: null, size: null, reason: '-', type: 'neutral' };
let lastAnalystHit = false;

// ——— MASTER SNIPER STATE (CONFLUENCE) —————————————————————————
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
            alert('✔ Datos borrados.');
        }).catch(() => { history.length=0; cwHistory.length=0; cwHistory.length=0; ccwHistory.length=0; lastSignal=null; renderShadowPanel(); renderWheelAndHistory(); });
}

/// ——— RENDER: UNIFIED PANEL ——————————————————————————————————

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
        const last10cw = cwHistory.slice(-10);
        const winsCW   = last10cw.filter(x => x === 'win').length;
        document.getElementById('dir-cw-w').innerText = winsCW;
        document.getElementById('dir-cw-l').innerText = last10cw.length - winsCW;
        document.getElementById('dir-cw-rate').innerText = last10cw.length > 0 ? ((winsCW / last10cw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-cw-perf').innerHTML = last10cw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // CCW Stats
        const last10ccw = ccwHistory.slice(-10);
        const winsCCW   = last10ccw.filter(x => x === 'win').length;
        document.getElementById('dir-ccw-w').innerText = winsCCW;
        document.getElementById('dir-ccw-l').innerText = last10ccw.length - winsCCW;
        document.getElementById('dir-ccw-rate').innerText = last10ccw.length > 0 ? ((winsCCW / last10ccw.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-ccw-perf').innerHTML = last10ccw.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

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
        const underTarget = lastSignal ? lastSignal.targetUnderCW : WHEEL_NUMS[(idx + 4 + 37) % 37];
        document.getElementById('sup-s-c-val').innerText = underTarget;
        document.getElementById('sup-s-l-hit').innerText = lastZoneUnderHit ? '✔ HIT' : '';
        document.getElementById('sup-s-trend').innerText = `LAST: ${phaseLabel} (${dVal}p)`;

        const last10s = zoneUnderHistory.slice(-10);
        const winsS = last10s.filter(x => x === 'win').length;
        document.getElementById('sup-s-w').innerText = winsS;
        document.getElementById('sup-s-l').innerText = last10s.length - winsS;
        document.getElementById('sup-s-rate').innerText = last10s.length > 0 ? ((winsS / last10s.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-s-perf').innerHTML = last10s.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- OVER BLOCK (Dynamic Logic) ---
        const overTarget = lastSignal ? lastSignal.targetOverCW : WHEEL_NUMS[(idx + 14 + 37) % 37];
        document.getElementById('sup-b-c-val').innerText = overTarget;
        document.getElementById('sup-b-l-hit').innerText = lastZoneOverHit ? '✔ HIT' : '';
        document.getElementById('sup-b-trend').innerText = `LAST: ${phaseLabel} (${dVal}p)`;

        const last10b = zoneOverHistory.slice(-10);
        const winsB = last10b.filter(x => x === 'win').length;
        document.getElementById('sup-b-w').innerText = winsB;
        document.getElementById('sup-b-l').innerText = last10b.length - winsB;
        document.getElementById('sup-b-rate').innerText = last10b.length > 0 ? ((winsB / last10b.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-b-perf').innerHTML = last10b.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- NEIGHBOR BALLS: DISABLED (Per user request) ---
        document.getElementById('sup-s-c-balls').innerHTML = '';
        document.getElementById('sup-s-l-balls').innerHTML = '';
        document.getElementById('sup-s-r-balls').innerHTML = '';
        document.getElementById('sup-b-c-balls').innerHTML = '';
        document.getElementById('sup-b-l-balls').innerHTML = '';
        document.getElementById('sup-b-r-balls').innerHTML = '';
        // --- ZONE 26 STATS ---
        const last10z26 = zone26History.slice(-10);
        const winsZ26 = last10z26.filter(x => x === 'win').length;
        const rateZ26 = last10z26.length > 0 ? ((winsZ26 / last10z26.length) * 100).toFixed(0) : '0';
        document.getElementById('z26-rate').innerText = rateZ26 + '%';
        document.getElementById('z26-string').innerHTML = last10z26.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        renderDozens();
    } } catch (err) { 
        document.body.innerHTML += `<div style="color:red;z-index:9999;position:fixed;top:50px">${err.stack}</div>`;
        console.error('Error in renderShadowPanel:', err); 
    }
}

function renderDozens() {
    try {
        if (history.length < 12) {
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
        for (let i = 12; i <= dozens.length; i++) {
            const window = dozens.slice(i - 12, i).filter(d => d !== 0);
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
                        dzHistoryList.unshift({ dozens: [...cur], duróation: spins });
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
                statusEl.innerText = `✔ ESTABLE (${spins}t)`;
                statusEl.classList.add('stable');
                if (arrow) arrow.innerText = '•';
            }
        }

        if (infoEl) {
            infoEl.innerText = `Ventana 18: Dom.° ${fmtDoz(cur)}`;
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
             else if (weak1) weakWarning = `❗ ${cur[0]}ª DOCENA DEBILITADA (AISLADA)`;
             else if (weak2) weakWarning = `❗ ${cur[1]}ª DOCENA DEBILITADA (AISLADA)`;
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
        if (histEl) {
             if (dzHistoryList.length === 0) {
                 histEl.innerHTML = '<div class="dz-hist-item" style="opacity:0.5;justify-content:center">Sin datos aún</div>';
             } else {
                 histEl.innerHTML = dzHistoryList.map(h => {
                     const chips = h.dozens.map(d => `<span style="background:var(--accent); color:#111; padding:0 4px; border-radius:2px; font-weight:bold; margin:0 2px;">${d}°</span>`).join('');
                     return `
                        <div class="dz-hist-item" style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center;">${chips}</div>
                            <span class="dur" style="font-size:9px; color:var(--muted)">duró ${h.duration}t</span>
                        </div>
                     `;
                 }).join('');
             }
        }

        // Refresh neighbor balls now that dzCurrent is updated
        renderShadowPanelNeighborsOnly();

    } catch (err) { 
        console.error('Error in renderDozens:', err); 
    }
}

// ——— WHEEL DRAW ——————————————————————————————————————————————
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

// ——— TAB LISTENERS —————————————————————————————————————
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

// ——— SUBMIT NUMBER —————————————————————————————————————————
function submitNumber(val, silent = false, batch = false) {
    const raw = val !== undefined ? val : '';
    const n = parseInt(raw);
    
    if (!isNaN(n) && n >= 0 && n <= 36) {
        // Evaluate previous predictions before pushing to history
        if (lastSignal && history.length > 0) {
            // Main CW prediction — evaluated at N9 (win radius 9, under/over radius 4)
            if (lastSignal.targetCW !== undefined) {
                const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
                cwHistory.push(distCW <= 9 ? 'win' : 'loss');
                
                // Dynamically evaluate hits against under/over targets at radius 4
                lastUnderHitCW = Math.abs(calcDist(n, lastSignal.targetUnderCW)) <= 4;
                lastOverHitCW  = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
            }
            // Main CCW prediction — evaluated at N9 (9-ball neighborhood = radius 4)
            if (lastSignal.targetCCW !== undefined) {
                const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
                ccwHistory.push(distCCW <= 9 ? 'win' : 'loss');
                
                // Dynamically evaluate hits against under/over targets at radius 4
                lastUnderHitCCW = Math.abs(calcDist(n, lastSignal.targetUnderCCW)) <= 4;
                lastOverHitCCW  = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
            }
        }
        
        // Evaluate ZONE OVER prediction — Offset 14
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

        // Evaluate ZONE UNDER prediction — Offset 4
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

        // Evaluate Zone 26 (Dist <= 9 to 26)
        const d26 = Math.abs(calcDist(n, 26));
        lastZone26Hit = (d26 <= 9);
        zone26History.push(lastZone26Hit ? 'win' : 'loss');

        // Evaluate JUGADAS prediction — only when ACTIVE (not charging)
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
        }
    }
}

// ——— SCATTER CHART: DIRECTION DISPERSION (CUMULATIVE RANDOM WALK) ——————————
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
        
        // ——— Moving Average (window=5) ———
        const maWindow = 5;
        const ma = [];
        for (let i = 0; i < dirs.length; i++) {
            const start = Math.max(0, i - maWindow + 1);
            const slice = dirs.slice(start, i + 1);
            ma.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        
        // ——— Support / Resistance Detection ———
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
        
        // ——— Moving Average Line (SUBTLE REFERENCE) ———
        ctx.strokeStyle = 'rgba(245, 200, 66, 0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
        ctx.beginPath();
        for (let i = 0; i < ma.length; i++) {
            const x = scaleX(i), y = scaleY(ma[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
        
        // ——— SHARP PEAKS LINE (ZIG-ZAG) ———
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
        
        // ——— Scatter Points ———
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
        
        // ——— Trend Detection ———
        const recent10 = binaryDirs.slice(-10);
        const cwRatio = recent10.filter(d => d > 0).length / recent10.length;
        let trendLabel = 'NEUTRAL';
        let trendColor = '#6a8aa8';
        if (cwRatio >= 0.7) { trendLabel = '🔼 TENDENCIA CW'; trendColor = '#30e090'; }
        else if (cwRatio <= 0.3) { trendLabel = '🔽 TENDENCIA CCW'; trendColor = '#f04060'; }
        else if (cwRatio >= 0.55) { trendLabel = '↔ SESGO CW LEVE'; trendColor = '#7ae0b0'; }
        else if (cwRatio <= 0.45) { trendLabel = '↔ SESGO CCW LEVE'; trendColor = '#e07a90'; }
        
        const trendEl = document.getElementById('scatter-trend-label');
        if (trendEl) { trendEl.innerText = trendLabel; trendEl.style.color = trendColor; }
        
        const biasEl = document.getElementById('scatter-bias');
        if (biasEl) { biasEl.innerText = `${Math.round(cwRatio * 100)}% CW`; }
        
        // Scroll to rightmost point
        canvas.parentElement.scrollLeft = canvas.parentElement.scrollWidth;
        
    } catch(err) { console.error('Scatter chart error:', err); }
}

// ——— TRAVEL PATTERN ANALYSIS (DOBLE EJE) —————————————————————————————————————
const travelPatternHistory = []; // íšltimos 8 episodios

function analyzeTravelPattern(hist) {
    if (hist.length < 3) return { label: '—', tiradas: 0, emoji: '' };

    // Build [{ dir, zone }] list from full history
    const events = [];
    for (let i = 1; i < hist.length; i++) {
        const d = calcDist(hist[i - 1], hist[i]);
        events.push({
            dir:  d >= 0 ? 'DER' : 'IZQ',
            zone: Math.abs(d) >= 9 ? 'BIG' : 'SMALL'
        });
    }

    // —— Find the current streak (how many events from the end share ANY linkage) ——
    // We measure the active window = last N events (use last 12, or fewer if not enough)
    const window = events.slice(-12);
    const N = window.length;
    if (N < 2) return { label: '—', tiradas: N, emoji: '' };

    const dirs  = window.map(e => e.dir);
    const zones = window.map(e => e.zone);

    // —— EJE 1: DIRECCIí“N ——
    // Solid: last 3+ all same
    const dirSolid = N >= 3 && dirs.slice(-N).every(d => d === dirs[dirs.length - 1]);
    const dirLast  = dirs[dirs.length - 1];

    // Zigzag: perfect alternation
    let dirZigzag = N >= 4;
    for (let i = 1; i < N && dirZigzag; i++) {
        if (dirs[i] === dirs[i - 1]) dirZigzag = false;
    }

    const dirState = dirSolid ? `DER:${dirLast}` : (dirZigzag ? 'ZZ' : 'INEST');

    // —— EJE 2: ZONA ——
    const zoneSolid    = N >= 3 && zones.slice(-N).every(z => z === zones[zones.length - 1]);
    const zoneLast     = zones[zones.length - 1];

    let zoneZigzag = N >= 4;
    for (let i = 1; i < N && zoneZigzag; i++) {
        if (zones[i] === zones[i - 1]) zoneZigzag = false;
    }

    // Dom.inance: 60%+ of window is same zone
    const smallCount = zones.filter(z => z === 'SMALL').length;
    const bigCount   = zones.length - smallCount;
    const domSmall   = smallCount / N >= 0.6;
    const domBig     = bigCount   / N >= 0.6;

    const zoneState = zoneSolid ? `ZS:${zoneLast}` : (zoneZigzag ? 'ZZ' : (domSmall ? 'DOM:SMALL' : (domBig ? 'DOM:BIG' : 'INEST')));

    // —— COMBINED LABEL ——
    let label = '';
    let emoji = '';

    if (dirState.startsWith('DER:') && zoneState.startsWith('ZS:')) {
        label = `Sólida ${dirLast}-${zoneLast}`;
        emoji = 'ðŸ”¥';
    } else if (dirState === 'ZZ' && zoneState === 'ZZ') {
        label = 'Zigzag doble';
        emoji = '↔';
    } else if (dirState.startsWith('DER:') && zoneState === 'ZZ') {
        label = `Dir ${dirLast} estable, zona zigzag`;
        emoji = '↔';
    } else if (zoneState.startsWith('ZS:') && dirState === 'ZZ') {
        label = `${zoneLast} sólida, dir zigzag`;
        emoji = '↙';
    } else if (zoneState.startsWith('ZS:') && dirState === 'INEST') {
        label = `${zoneLast} sólida, dir inestable`;
        emoji = '❗';
    } else if (zoneState === 'DOM:SMALL' && dirState.startsWith('DER:')) {
        label = `Small dom, ${dirLast} estable`;
        emoji = 'ðŸ“Œ';
    } else if (zoneState === 'DOM:BIG' && dirState.startsWith('DER:')) {
        label = `Big dom, ${dirLast} estable`;
        emoji = 'ðŸ“Œ';
    } else if (zoneState === 'DOM:SMALL') {
        label = 'Small dom, dir inestable';
        emoji = 'ðŸŸ¢';
    } else if (zoneState === 'DOM:BIG') {
        label = 'Big dom, dir inestable';
        emoji = 'ðŸ”´';
    } else if (dirState.startsWith('DER:') && zoneState === 'INEST') {
        label = `${dirLast} estable, zona inestable`;
        emoji = '↔';
    } else {
        label = 'Caos';
        emoji = 'ðŸŒ€';
    }

    return { label, tiradas: N, emoji };
}

function updateTravelPatternUI() {
    if (history.length < 3) return;
    const result = analyzeTravelPattern(history);
    
    const labelEl = document.getElementById('travel-pattern-label');
    const tirasEl = document.getElementById('travel-pattern-count');
    const histEl  = document.getElementById('travel-pattern-hist');
    
    if (labelEl) labelEl.innerText = `${result.emoji} ${result.label}`;
    if (tirasEl) tirasEl.innerText = `${result.tiradas}t`;

    // Save to history if label changed
    const last = travelPatternHistory[0];
    if (!last || last.label !== result.label) {
        if (last) travelPatternHistory.unshift({ label: last.label, emoji: last.emoji, tiradas: last.tiradas });
        if (travelPatternHistory.length > 8) travelPatternHistory.length = 8;
    } else {
        // Update tiradas count of current
        if (travelPatternHistory[0]) travelPatternHistory[0].tiradas = result.tiradas;
    }

    if (histEl) {
        histEl.innerHTML = travelPatternHistory.slice(0, 8).map(p =>
            `<div style="display:flex; justify-content:space-between; padding: 2px 0; font-size:10px; border-bottom:1px solid var(--border);">
                <span style="color:var(--text)">${p.emoji} ${p.label}</span>
                <span style="color:var(--muted); font-family:var(--mono);">${p.tiradas}t</span>
            </div>`
        ).join('') || `<div style="opacity:0.5; font-size:10px; text-align:center; padding:4px;">Sin historial aíºn</div>`;
    }
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
    
    // V5 SCROLLABLE: FIXED DISTANCE
    const padL=30, padR=50, padT=14, padB=20;
    const pxPerPoint = 14;
    const numPoints = travels.length;
    
    const minW = canvas.parentElement.offsetWidth || 400;
    const totalW = Math.max(minW, numPoints * pxPerPoint + padL + padR);
    canvas.width = totalW;
    canvas.style.width = totalW + 'px';
    const W = totalW;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const data = travels; // ALL travels, not sliced

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
    const scaleX = i => padL + i * pxPerPoint; // FIXED DISTANCE, NO STRETCHING

    // Update the offset UI badge
    const badgeCalib = document.getElementById('travel-avg-offset');
    if (badgeCalib) badgeCalib.innerText = `CALIB: ${manualAvgOffset >= 0 ? '+'+manualAvgOffset : manualAvgOffset}`;

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
    // Usamos curvas de Bézier cíºbicas con puntos de control suavizados
    ctx.lineWidth=3; ctx.lineJoin='round'; ctx.lineCap='round';
    
    for(let i=0; i < numPoints - 1; i++){
        const x1 = scaleX(i), y1 = scaleY(data[i]);
        const x2 = scaleX(i+1), y2 = scaleY(data[i+1]);
        
        // Puntos de control para suavizado (Curva de Bézier)
        const cpX = (x1 + x2) / 2;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cpX, y1, cpX, y2, x2, y2);
        
        // Color dinámico segíºn la zona y pérdida de rango
        const val = data[i+1];
        if(val > upperRange || val < lowerRange) ctx.strokeStyle='#f5c842';
        else ctx.strokeStyle = val >= 0 ? '#30e090' : '#f04060';
        
        // Sutil brillo en la lí­nea
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

// ——— TRAVEL TABLE ——————————————————————————————————————————
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
        
        if (pat === 'Sí“LIDA') patClass = 'badge-solid';
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
            <td class="${dirClass}">${dir} <span style="font-size:9px;opacity:0.5">${dist >= 0 ? '↺' : '↻'}</span></td>
            <td>${phaseHtml}</td>
        </tr>`;
    }).join('');

    renderTravelChart(); } catch (err) { console.error(err); }
}

// ——— SYNC FROM SERVER ————————————————————————————————————————
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
                console.log("ðŸ”¥ Lote recibido del bot. Resincronizando datos...");
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

// ——— INIT —————————————————————————————————————————————————
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
// ——— ANALYST UI RENDERER —————————————————————————————————————————
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
    else if (analystView.signal.includes('COMPRESIí“N')) signalEl.classList.add('compression');

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

// ——— MASTER UI RENDERER —————————————————————————————————————————
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

// ——— TOGGLE TRAVEL TABLE —————————————————————————————————————————
document.addEventListener('DOMContentLoaded', () => {
    const btnCollapse = document.getElementById('toggle-travel-table');
    if (btnCollapse) {
        btnCollapse.addEventListener('click', (e) => {
            const wrap = document.getElementById('travel-table-wrap');
            if (wrap.style.display === 'none') {
                wrap.style.display = 'block';
                e.target.innerText = '▲ CERRAR HISTORIAL ▲';
            } else {
                wrap.style.display = 'none';
                e.target.innerText = '▼ ABRIR HISTORIAL DE RUTAS ▼';
            }
        });
    }

    // Botones de Patrones
    document.getElementById('toggle-pattern-hist')?.addEventListener('click', function() {
        const wrap = document.getElementById('travel-pattern-hist');
        if (wrap.style.maxHeight === '0px' || !wrap.style.maxHeight) {
            wrap.style.maxHeight = '200px';
            this.innerText = '▲ CERRAR HISTORIAL PATRONES ▲';
        } else {
            wrap.style.maxHeight = '0px';
            this.innerText = '▼ VER HISTORIAL PATRONES ▼';
        }
    });

    // ─── Botones de Calibración del PREDICTOR ±1 casilla ────
    function updatePredBadge() {
        const badge = document.getElementById('pred-offset-badge');
        if (badge) {
            const n = 9 + predictorOffset;
            badge.innerText = `N${n}`;
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
