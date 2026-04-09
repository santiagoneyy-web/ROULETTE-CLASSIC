// ============================================================
// app.js — SHADOW ROULETTE UI ENGINE
// ============================================================

const history = [];
const cwHistory = [];
const ccwHistory = [];

let lastSignal  = null;
let currentTableId = null;

let lastOverHitCW = false;
let lastBigHitCW  = false;
let lastOverHitCCW = false;
let lastBigHitCCW  = false;

// ─── ZONE STATE ──────────────────────────────────────────────
const zoneBigHistory = [];   
const zoneSmallHistory = [];
const zone26History = [];
let lastZoneBigHit   = false;
let lastZoneSmallHit = false;
let lastZone26Hit    = false;

// ─── DOZENS STATE ──────────────────────────────────────────────
// ─── DOZENS STATE ──────────────────────────────────────────────
let dzCurrent = [];
let dzPrevious = [];
let dzSpinsSinceChange = 0;
const dzHistoryList = []; // Para almacenar las últimas 8 situaciones

// ─── JUGADAS STATE ───────────────────────────────────────────
let jugView = { magnitude: 'SMALL', direction: 'CW', confidence: 0 };
const jugHistory = [];
let lastJugHit = false;
let patternStatsCache = null;

// ─── ANALYST STATE (V26) ─────────────────────────────────────
const analystHistory = [];
let analystView = { signal: 'ANALIZANDO...', targetDir: null, size: null, reason: '-', type: 'neutral' };
let lastAnalystHit = false;

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
            document.getElementById('dir-cw-l-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetOverCW, 4);
            document.getElementById('dir-cw-r-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetBigCW, 4);
            document.getElementById('dir-ccw-c-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetCCW, 9);
            document.getElementById('dir-ccw-l-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetOverCCW, 4);
            document.getElementById('dir-ccw-r-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetBigCCW, 4);
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
            zoneBigHistory.length=0; zoneSmallHistory.length=0; zone26History.length=0;
            dzCurrent=[]; dzPrevious=[]; dzSpinsSinceChange=0; dzHistoryList.length=0; lastSignal=null;
            renderShadowPanel(); renderWheelAndHistory();
            alert('✅ Datos borrados.');
        }).catch(() => { history.length=0; cwHistory.length=0; ccwHistory.length=0; lastSignal=null; renderShadowPanel(); renderWheelAndHistory(); });
}

/// ─── RENDER: UNIFIED PANEL ───────────────────────────────

function getZoneTargets(lastNum) {
    const idx = WHEEL_NUMS.indexOf(lastNum);
    if (idx === -1) return {};
    
    if (zoneView === 'BIG') {
        return {
            // BIG mode: Anchor is at +19 distance
            // Targets: Principal(+19), Soporte(+10), Inverso(-19)
            main:    WHEEL_NUMS[(idx + 19 + 37) % 37],
            support: WHEEL_NUMS[(idx + 10 + 37) % 37],
            inverse: WHEEL_NUMS[(idx - 19 + 37) % 37]
        };
    } else {
        // SMALL mode: Anchor is at 0/1/-1 distance
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
        document.getElementById('dir-cw-l-val').innerText = lastSignal.targetOverCW;
        document.getElementById('dir-cw-r-val').innerText = lastSignal.targetBigCW;
        document.getElementById('dir-cw-l-hit').innerText = lastOverHitCW ? '✔ HIT' : '';
        document.getElementById('dir-cw-r-hit').innerText = lastBigHitCW ? '✔ HIT' : '';

        // --- CCW BLOCK ---
        document.getElementById('dir-ccw-c-val').innerText = lastSignal.targetCCW;
        document.getElementById('dir-ccw-l-val').innerText = lastSignal.targetOverCCW;
        document.getElementById('dir-ccw-r-val').innerText = lastSignal.targetBigCCW;
        document.getElementById('dir-ccw-l-hit').innerText = lastOverHitCCW ? '✔ HIT' : '';
        document.getElementById('dir-ccw-r-hit').innerText = lastBigHitCCW ? '✔ HIT' : '';

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

        // --- NEIGHBOR BALLS: CW blocks ---
        document.getElementById('dir-cw-c-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetCW, 9);
        document.getElementById('dir-cw-l-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetOverCW, 4);
        document.getElementById('dir-cw-r-balls').innerHTML  = getFilteredNeighborsHTML(lastSignal.targetBigCW, 4);
        // --- NEIGHBOR BALLS: CCW blocks ---
        document.getElementById('dir-ccw-c-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetCCW, 9);
        document.getElementById('dir-ccw-l-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetOverCCW, 4);
        document.getElementById('dir-ccw-r-balls').innerHTML = getFilteredNeighborsHTML(lastSignal.targetBigCCW, 4);
    }

    // 2. SUP (ZONE SUPPORT)
    if (history.length >= 2) {
        const lastNum  = history[history.length - 1];
        const prevNum  = history[history.length - 2];
        const lastDist = Math.abs(calcDist(prevNum, lastNum));
        const idx = WHEEL_NUMS.indexOf(lastNum);

        // --- SMALL BLOCK (DIST +1) ---
        const smallTarget = WHEEL_NUMS[(idx + 1 + 37) % 37];
        document.getElementById('sup-s-c-val').innerText = smallTarget;
        document.getElementById('sup-s-l-hit').innerText = lastZoneSmallHit ? '✔ HIT' : '';
        document.getElementById('sup-s-trend').innerText = `LAST: ${lastDist >= 10 ? 'BIG' : 'SMALL'} (${lastDist}p)`;

        const last12s = zoneSmallHistory.slice(-12);
        const winsS = last12s.filter(x => x === 'win').length;
        document.getElementById('sup-s-w').innerText = winsS;
        document.getElementById('sup-s-l').innerText = last12s.length - winsS;
        document.getElementById('sup-s-rate').innerText = last12s.length > 0 ? ((winsS / last12s.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-s-perf').innerHTML = last12s.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- BIG BLOCK (DIST +19) ---
        const bigTarget = WHEEL_NUMS[(idx + 19 + 37) % 37];
        document.getElementById('sup-b-c-val').innerText = bigTarget;
        document.getElementById('sup-b-l-hit').innerText = lastZoneBigHit ? '✔ HIT' : '';
        document.getElementById('sup-b-trend').innerText = `LAST: ${lastDist >= 10 ? 'BIG' : 'SMALL'} (${lastDist}p)`;

        const last12b = zoneBigHistory.slice(-12);
        const winsB = last12b.filter(x => x === 'win').length;
        document.getElementById('sup-b-w').innerText = winsB;
        document.getElementById('sup-b-l').innerText = last12b.length - winsB;
        document.getElementById('sup-b-rate').innerText = last12b.length > 0 ? ((winsB / last12b.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-b-perf').innerHTML = last12b.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');

        // --- NEIGHBOR BALLS: SUP blocks ---
        document.getElementById('sup-s-c-balls').innerHTML = getFilteredNeighborsHTML(smallTarget, 9);
        document.getElementById('sup-s-l-balls').innerHTML = '';
        document.getElementById('sup-s-r-balls').innerHTML = '';
        document.getElementById('sup-b-c-balls').innerHTML = getFilteredNeighborsHTML(bigTarget, 9);
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
    if (e.target && e.target.id === 'tab-btn-dir') {
        document.getElementById('tab-btn-dir').classList.add('active');
        document.getElementById('tab-btn-sup').classList.remove('active');
        document.getElementById('panel-dir').style.display = 'flex';
        document.getElementById('panel-sup').style.display = 'none';
        renderShadowPanel();
    }
    if (e.target && e.target.id === 'tab-btn-sup') {
        document.getElementById('tab-btn-sup').classList.add('active');
        document.getElementById('tab-btn-dir').classList.remove('active');
        document.getElementById('panel-dir').style.display = 'none';
        document.getElementById('panel-sup').style.display = 'flex';
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
            // Main CW prediction — evaluated at N9 radius
            if (lastSignal.targetCW !== undefined) {
                const distCW = Math.abs(calcDist(n, lastSignal.targetCW));
                cwHistory.push(distCW <= 9 ? 'win' : 'loss'); // N9 radius
                // SMALL (+5 dist) and BIG (+14 dist) snipes at N4
                lastOverHitCW = Math.abs(calcDist(n, lastSignal.targetOverCW)) <= 4;
                lastBigHitCW  = Math.abs(calcDist(n, lastSignal.targetBigCW)) <= 4;
            }
            // Main CCW prediction — evaluated at N9 radius
            if (lastSignal.targetCCW !== undefined) {
                const distCCW = Math.abs(calcDist(n, lastSignal.targetCCW));
                ccwHistory.push(distCCW <= 9 ? 'win' : 'loss'); // N9 radius
                // SMALL (-5 dist) and BIG (-14 dist) snipes at N4
                lastOverHitCCW = Math.abs(calcDist(n, lastSignal.targetOverCCW)) <= 4;
                lastBigHitCCW  = Math.abs(calcDist(n, lastSignal.targetBigCCW)) <= 4;
            }
        }
        
        // Evaluate ZONE BIG prediction — N9 of +19 target
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const bigTarget = WHEEL_NUMS[(idxZ + 19 + 37) % 37];
                const dBig = Math.abs(calcDist(n, bigTarget));
                lastZoneBigHit = (dBig <= 9);
                zoneBigHistory.push(lastZoneBigHit ? 'win' : 'loss');
            }
        }

        // Evaluate ZONE SMALL prediction — N9 of +1 target only
        if (history.length >= 1) {
            const prevForZone = history[history.length - 1];
            const idxZ = WHEEL_NUMS.indexOf(prevForZone);
            if (idxZ !== -1) {
                const smallTarget = WHEEL_NUMS[(idxZ + 1 + 37) % 37];
                const dSmall = Math.abs(calcDist(n, smallTarget));
                lastZoneSmallHit = (dSmall <= 9);
                zoneSmallHistory.push(lastZoneSmallHit ? 'win' : 'loss');
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
            
            const hitMag = jugView.magnitude === 'SMALL' ? (mag <= 9 && mag >= 1) : (mag >= 10 && mag <= 18);
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

        history.push(n);

        // Compute new predictions (Se calculan siempre para que la historia de W/L se llene, incluso en lote)
        if (typeof computeDealerSignature === 'function' && history.length >= 3) {
            try {
                const sig  = computeDealerSignature(history);
                const prox = projectNextRound(history, {});
                const masterSignals = getIAMasterSignals(prox, sig, history);
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

                if (!batch) {
                    if (history.length > 0) fetchPatternMemory(history);
                    renderShadowPanel();
                    renderWheelAndHistory();
                    renderTravelPanel();
                    renderAnalystUI();
                }
            } catch(e) { console.error('Predict error:', e); }
        }
    }
}

// ─── RENDER: TRAVEL CHART (OFI-Style canvas) ──────────────
function renderTravelChart() {
    try {
    const canvas = document.getElementById('travelChart');
    if (!canvas || history.length < 3) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || canvas.parentElement.offsetWidth || 400;
    canvas.width = W;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Build travel array
    const travels = [];
    for (let i = 1; i < history.length; i++) travels.push(calcDist(history[i-1], history[i]));
    if (travels.length < 2) return;
    const maxPoints = 30;
    const data = travels.slice(-maxPoints);
    const numPoints = data.length;

    // Averages
    const cwVals = data.filter(d => d > 0);
    const ccwVals = data.filter(d => d < 0);
    const avgCW  = cwVals.length  > 0 ? cwVals.reduce((a,b)=>a+b,0)/cwVals.length   :  7;
    const avgCCW = ccwVals.length > 0 ? ccwVals.reduce((a,b)=>a+b,0)/ccwVals.length : -7;
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

    // Main line (green CW / red CCW / gold if out of range)
    ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
    for(let i=1;i<numPoints;i++){
        const x1=scaleX(i-1),y1=scaleY(data[i-1]),x2=scaleX(i),y2=scaleY(data[i]);
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
        const val=data[i];
        if(val>upperRange||val<lowerRange) ctx.strokeStyle='#f5c842';
        else ctx.strokeStyle=val>=0?'#30e090':'#f04060';
        ctx.stroke();
    }
    // Data points
    for(let i=0;i<numPoints;i++){
        const x=scaleX(i),y=scaleY(data[i]);
        ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);
        ctx.fillStyle=data[i]>=0?'#30e090':'#c090ff';
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
    }); } catch(err) { console.error(err); }
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
        const numClass = n===0 ? 'num-zero' : (RED_NUMS.has(n) ? 'num-red' : 'num-black');
        const dirClass = dist >= 0 ? 'dir-der' : 'dir-izq';
        let phaseHtml = '';
        if (absDist >= 1 && absDist <= 9)        phaseHtml = `<span class="phase-pill pill-small">SMALL</span>`;
        else if (absDist >= 10 && absDist <= 19) phaseHtml = `<span class="phase-pill pill-big">BIG</span>`;
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
                // Clear existing options
                tableSelect.innerHTML = '';
                
                // Populate options
                ts.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.name;
                    tableSelect.appendChild(opt);
                });

                tableSelect.addEventListener('change', async () => {
                    currentTableId = tableSelect.value;
                    const tImg = document.querySelector('.table-image-container img');
                    if (tImg) tImg.src = currentTableId == 1 ? 'table-1.jpg' : 'table-2.jpg';

                    history.length = 0;
                    cwHistory.length = 0;
                    ccwHistory.length = 0;
                    lastSignal = null;
                    renderWheelAndHistory();
                    
                    const infoEl = document.getElementById('doc-info');
                    if (infoEl) infoEl.innerText = 'Sincronizando...';
                    
                    await syncData();
                    if (infoEl) infoEl.innerText = 'Listo'; // Clear syncing state
                    connectSSE(currentTableId);
                });

                // Force initial selection
                currentTableId = ts[0].id;
                tableSelect.value = currentTableId;
                const tImgInit = document.querySelector('.table-image-container img');
                if (tImgInit) tImgInit.src = currentTableId == 1 ? 'table-1.jpg' : 'table-2.jpg';
                
                await syncData();
                connectSSE(currentTableId);
            } else {
                console.warn('No tables returned from API');
            }
        }
    } catch (e) { 
        console.warn('API not reachable, offline mode.', e);
        const info = document.getElementById('doc-info');
        if (info) info.innerText = '⚠️ API OFFLINE';
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
