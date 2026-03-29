// ============================================================
// app.js — SHADOW ROULETTE UI ENGINE
// ============================================================

const history = [];
const cwHistory = [];
const ccwHistory = [];

let currentView = 'CW'; 
let panelMode   = 'DIR';  // 'DIR', 'SUP', 'JUG'
let lastSignal  = null;
let currentTableId = null;

let lastOverHitCW = false;
let lastBigHitCW  = false;
let lastOverHitCCW = false;
let lastBigHitCCW  = false;

// ─── ZONE STATE ──────────────────────────────────────────────
let zoneView = 'BIG';     
const zoneBigHistory = [];   
const zoneSmallHistory = [];
let lastZoneBigHit   = false;
let lastZoneSmallHit = false;

// ─── DOZENS STATE ──────────────────────────────────────────────
let dzCurrent = [];
let dzPrevious = [];
let dzSpinsSinceChange = 0;

// ─── JUGADAS STATE ───────────────────────────────────────────
let jugView = { magnitude: 'SMALL', direction: 'CW', confidence: 0 };
const jugHistory = [];
let lastJugHit = false;
let patternStatsCache = null;

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
        const isCW = currentView === 'CW';
        const activeHistory = isCW ? cwHistory : ccwHistory;
        document.getElementById('dir-badge').innerText = isCW ? 'CW ↺' : 'CCW ↻';
        document.getElementById('dir-c-val').innerText = isCW ? lastSignal.targetCW : lastSignal.targetCCW;
        document.getElementById('dir-l-val').innerText = isCW ? lastSignal.targetOverCW : lastSignal.targetOverCCW;
        document.getElementById('dir-r-val').innerText = isCW ? lastSignal.targetBigCW : lastSignal.targetBigCCW;
        document.getElementById('dir-l-hit').innerText = (isCW ? lastOverHitCW : lastOverHitCCW) ? '✔ HIT' : '';
        document.getElementById('dir-r-hit').innerText = (isCW ? lastBigHitCW : lastBigHitCCW) ? '✔ HIT' : '';

        if (history.length >= 2) {
            const d = calcDist(history[history.length-2], history[history.length-1]);
            document.getElementById('dir-trend').innerText = `TEND: ${ d >= 0 ? 'DER ↺' : 'IZQ ↻'}`;
        }

        const last12 = activeHistory.slice(-12);
        const wins   = last12.filter(x => x === 'win').length;
        document.getElementById('dir-w').innerText = wins;
        document.getElementById('dir-l').innerText = last12.length - wins;
        document.getElementById('dir-rate').innerText = last12.length > 0 ? ((wins / last12.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('dir-perf').innerHTML = last12.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
    }

    // 2. SUP (ZONE SUPPORT)
    if (history.length >= 2) {
        document.getElementById('sup-badge').innerText = zoneView === 'BIG' ? 'BIG 🔺' : 'SMALL 🔻';
        document.getElementById('sup-strat').innerText = zoneView === 'BIG' ? 'DIST +19 · N9' : 'DIST +1 · N9';

        const lastNum  = history[history.length - 1];
        const prevNum  = history[history.length - 2];
        const lastDist = Math.abs(calcDist(prevNum, lastNum));
        const idx = WHEEL_NUMS.indexOf(lastNum);

        if (zoneView === 'BIG') {
            document.getElementById('sup-l-lbl').innerText = '';
            document.getElementById('sup-r-lbl').innerText = '';
            document.getElementById('sup-l-sub').innerText = '';
            document.getElementById('sup-r-sub').innerText = '';
            
            const bigTarget = WHEEL_NUMS[(idx + 19 + 37) % 37];
            document.getElementById('sup-c-val').innerText = bigTarget;
            document.getElementById('sup-l-val').innerText = '';
            document.getElementById('sup-r-val').innerText = '';
            document.getElementById('sup-l-hit').innerText = lastZoneBigHit ? '✔ HIT' : '';
            document.getElementById('sup-r-hit').innerText = '';
        } else {
            // SMALL
            document.getElementById('sup-l-lbl').innerText = '';
            document.getElementById('sup-r-lbl').innerText = '';
            document.getElementById('sup-l-sub').innerText = '';
            document.getElementById('sup-r-sub').innerText = '';

            const smallTarget = WHEEL_NUMS[(idx + 1 + 37) % 37];
            document.getElementById('sup-c-val').innerText = smallTarget;
            document.getElementById('sup-l-val').innerText = '';
            document.getElementById('sup-r-val').innerText = '';
            document.getElementById('sup-l-hit').innerText = lastZoneSmallHit ? '✔ HIT' : '';
            document.getElementById('sup-r-hit').innerText = '';
        }

        document.getElementById('sup-trend').innerText = `LAST: ${lastDist >= 10 ? 'BIG' : 'SMALL'} (${lastDist}p)`;

        const activeZoneHist = zoneView === 'BIG' ? zoneBigHistory : zoneSmallHistory;
        const last12z = activeZoneHist.slice(-12);
        const winsZ = last12z.filter(x => x === 'win').length;
        document.getElementById('sup-w').innerText = winsZ;
        document.getElementById('sup-l').innerText = last12z.length - winsZ;
        document.getElementById('sup-rate').innerText = last12z.length > 0 ? ((winsZ / last12z.length) * 100).toFixed(1) + '%' : '0.0%';
        document.getElementById('sup-perf').innerHTML = last12z.map(r => `<span class="${r==='win'?'perf-w':'perf-l'}">${r==='win'?'W':'L'}</span>`).join('');
        
        renderDozens();
    } } catch (err) { 
        document.body.innerHTML += `<div style="color:red;z-index:9999;position:fixed;top:50px">${err.stack}</div>`;
        console.error('Error in renderShadowPanel:', err); 
    }
}

function renderDozens() {
    try {
        if (history.length < 18) return;

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
            
            const sorted = [1,2,3].sort((a,b) => counts[b] - counts[a]);
            const top2 = [sorted[0], sorted[1]].sort();

            if (cur.length === 0) {
                cur = top2;
                spins = 0;
            } else {
                if (JSON.stringify(top2) !== JSON.stringify(cur)) {
                    // Dominance Shift
                    prev = [...cur];
                    cur = top2;
                    spins = 0;
                } else {
                    spins++;
                }
            }
        }
        
        // Sync to global vars for safety
        dzCurrent = cur;
        dzPrevious = prev;
        dzSpinsSinceChange = spins;

        // UI Update: Balls
        [1,2,3].forEach(dz => {
            const el = document.getElementById(`dz-${dz}`);
            if(el) {
                if (cur.includes(dz)) el.classList.add('dominant');
                else el.classList.remove('dominant');
            }
        });

        // UI Update: Text
        const infoEl = document.getElementById('doc-info');
        const badgeEl = document.getElementById('doc-memory-badge');

        if (infoEl) {
            infoEl.innerText = `Dominancia mantenida por ${spins} tirada(s).`;
        }

        if (badgeEl) {
            if (prev.length > 0) {
                badgeEl.innerText = `PREV: ${prev.map(d => d+'°').join(' y ')}`;
            } else {
                badgeEl.innerText = 'PREV: --';
            }
        }
    } catch (err) { 
        document.body.innerHTML += `<div style="color:red;z-index:9999;position:fixed;top:0">${err.stack}</div>`;
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

// ─── BUTTON LISTENERS ─────────────────────────────────────
document.addEventListener('click', (e) => {
    // SWITCH DIR SIDE (CW ↔ CCW)
    if (e.target && e.target.id === 'btn-switch-dir') {
        currentView = currentView === 'CW' ? 'CCW' : 'CW';
        renderShadowPanel();
    }
    // SWITCH SUP ZONE (BIG ↔ SMALL)
    if (e.target && e.target.id === 'btn-switch-sup') {
        zoneView = zoneView === 'BIG' ? 'SMALL' : 'BIG';
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
                
                // JUGADAS Sniper automatically reads the table
                if (typeof predictZonePattern === 'function') {
                    jugView = predictZonePattern(history, patternStatsCache);
                }

                if (!batch && history.length > 0) {
                    fetchPatternMemory(history);
                }
            } catch(e) { console.error('Predict error:', e); }
        }
    }

    if (!batch) {
        renderShadowPanel();
        renderWheelAndHistory();
        renderTravelPanel();
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

    // Pattern badge
    if (patEl) {
        const last5 = history.slice(-5);
        const bigCount   = last5.filter(n => n >= 10 && n <= 19).length;
        const smallCount = last5.filter(n => n >= 1 && n <= 9).length;
        const dirs = [];
        const scanLength = 7; // Last 7 numbers gives up to 6 directions
        const startIndex = Math.max(1, history.length - scanLength);
        for (let i = startIndex; i < history.length; i++) {
            const dist = calcDist(history[i-1], history[i]);
            if (dist !== 0) {
                dirs.push(dist > 0 ? 'D' : 'I');
            }
        }
        
        let changes = 0;
        for (let i = 1; i < dirs.length; i++) {
            if (dirs[i] !== dirs[i-1]) changes++;
        }
        
        // ZIG ZAG (Volátil): Al menos 4 direcciones registradas, y cambia constantemente (>= 3 cortes)
        const isZigZagDir = dirs.length >= 4 && changes >= 3;
        
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
            for (const s of spins) submitNumber(s.number, true, true);
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
                tableSelect.innerHTML = ts.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                tableSelect.addEventListener('change', () => {
                    currentTableId = tableSelect.value;
                    
                    // Switch the table thumbnail image
                    const tImg = document.querySelector('.table-image-container img');
                    if (tImg) {
                        tImg.src = currentTableId == 1 ? 'table-1.jpg' : 'table-2.jpg';
                    }

                    history.length = 0;
                    cwHistory.length = 0;
                    ccwHistory.length = 0;
                    lastSignal = null;
                    renderWheelAndHistory();
                    syncData().then(() => connectSSE(currentTableId));
                });
                currentTableId = ts[0].id;
                const tImgInit = document.querySelector('.table-image-container img');
                if (tImgInit) tImgInit.src = currentTableId == 1 ? 'table-1.jpg' : 'table-2.jpg';
                await syncData();
                connectSSE(currentTableId);
            }
        }
    } catch (e) { console.warn('API not reachable, offline mode.'); }
});
