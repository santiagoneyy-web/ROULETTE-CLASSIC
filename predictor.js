// ============================================================
// predictor.js — Advanced Pattern Recognition & Trend Analysis
// ============================================================

const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const WHEEL_INDEX = {};
WHEEL_ORDER.forEach((n, i) => { WHEEL_INDEX[n] = i; });

// User Terminal Correlation Chart
const TERMINALS_MAP = {
    0:  [4, 6],         1:  [8],            2:  [7, 9],         3:  [8], 
    4:  [11],           5:  [12, 10],       6:  [11],           7:  [14, 2], 
    8:  [15, 13, 3, 1], 9:  [14, 2],        10: [17, 5],        11: [18, 16, 6, 4], 
    12: [17, 5],        13: [20, 23],       14: [9, 21, 7, 19], 15: [8, 20], 
    16: [11],           17: [12, 24, 10, 22],18: [11, 23],      19: [14, 26], 
    20: [13, 25, 15, 27],21: [14, 26],      22: [17, 29],       23: [18, 30, 16, 28], 
    24: [17, 29],       25: [20, 32],       26: [19, 31, 33, 21],27: [20, 32], 
    28: [23, 35],       29: [22, 34, 24, 36],30: [23, 35],      31: [26], 
    32: [25, 27],       33: [26],           34: [29],           35: [28, 30], 
    36: [29]
};

function getDistance(a, b) {
    const iA = WHEEL_INDEX[a], iB = WHEEL_INDEX[b];
    if (iA === undefined || iB === undefined) return 0;
    let d = iB - iA;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

// (Estrategias antiguas eliminadas para optimización)

function analyzeSpin(history, stats) {
    // Deprecated: Ya no se escanean 400 números
    return [];
}

function projectNextRound(history, stats) {
    // Deprecated: Dummy function for compatibility
    return [];
}

function computeDealerSignature(history) {
    if (history.length < 12) return { directionState: 'measuring', recommendedPlay: 'CHARGING', avgTravel: 0 };
    
    const travels = [];
    for (let i = 1; i < history.length; i++) travels.push(getDistance(history[i-1], history[i]));
    
    // Recent sample (last 10 travels)
    const recentTravels = travels.slice(-10);
    const avg = recentTravels.reduce((a,b) => a+b, 0) / recentTravels.length;
    
    // Calculate variability (Stability)
    const variance = recentTravels.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / recentTravels.length;
    const stdDev = Math.sqrt(variance);

    // Calculate RUNS (direction blocks) over the last 20 throws to detect "SOLID" tables
    let isSolid = false;
    let runsCount = 0;
    if (travels.length >= 20) {
        const last20 = travels.slice(-20);
        runsCount = 1;
        for (let i = 1; i < last20.length; i++) {
            const currentDir = last20[i] >= 0;
            const prevDir = last20[i-1] >= 0;
            if (currentDir !== prevDir) runsCount++;
        }
        // If it changes direction <= 10 times in 20 spins, the blocks average 2+ in size (WWLLWW...)
        if (runsCount <= 10) isSolid = true;
    }
    
    // Determine strict state
    let state = 'CHAOS';
    if (isSolid) {
        state = 'SÓLIDA';
    } else if (stdDev <= 6) {
        state = 'ESTABLE';
    } else if (stdDev <= 10) {
        state = 'ZIGZAG';
    }
    
    // Recommendation based on the weighted trend
    const rec = avg > 0 ? 'BIG (CW)' : 'SMALL (CCW)';
    
    return { 
        directionState: state, 
        recommendedPlay: rec, 
        avgTravel: Math.round(avg * 10) / 10, 
        stdDev: Math.round(stdDev * 10) / 10,
        travelHistory: recentTravels,
        casilla5: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 5) % 37],
        casilla14: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 14) % 37],
        casillaNeg5: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] - 5 + 37) % 37],
        casillaNeg14: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] - 14 + 37) % 37],
        casilla1: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 1) % 37],
        casilla19: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 19) % 37],
        casilla10: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 10) % 37]
    };
}

function getWheelNeighbors(num, radius) {
    const idx = WHEEL_INDEX[num];
    if (idx === undefined) return [num];
    const neighbors = [];
    for (let i = -radius; i <= radius; i++) {
        let nIdx = (idx + i + 37) % 37;
        neighbors.push(WHEEL_ORDER[nIdx]);
    }
    return neighbors;
}

function getIAMasterSignals(prox, sig, history) {
    if (!sig || history.length === 0) return [];
    const lastNum = history[history.length - 1];
    // CW Targets (+ to the right)
    const idx = WHEEL_INDEX[lastNum];
    const targetCW = WHEEL_ORDER[(idx + 9) % 37];
    const targetOverCW = WHEEL_ORDER[(idx + 5) % 37];
    const targetBigCW = WHEEL_ORDER[(idx + 14) % 37];
    
    // CCW Targets (- to the left)
    const targetCCW = WHEEL_ORDER[(idx - 9 + 37) % 37];
    const targetOverCCW = WHEEL_ORDER[(idx - 5 + 37) % 37];
    const targetBigCCW = WHEEL_ORDER[(idx - 14 + 37) % 37];

    const signals = [];

    // Return the dual n1717 signal
    signals.push({
        name: 'Android 1717',
        targetCW: targetCW,
        targetCCW: targetCCW,
        targetOverCW: targetOverCW,
        targetBigCW: targetBigCW,
        targetOverCCW: targetOverCCW,
        targetBigCCW: targetBigCCW,
        betZoneCW: getWheelNeighbors(targetCW, 4), // n4
        betZoneCCW: getWheelNeighbors(targetCCW, 4), // n4
        rule: "DISTANCE 9",
        mode: 'DUAL'
    });

    return signals;
}

function predictZonePattern(history, patternStats = null) {
    if (history.length < 4) return { magnitude: 'SMALL', direction: 'CW', confidence: 0, isCharging: true };

    const distances = [];
    for (let i = 1; i < history.length; i++) {
        distances.push(getDistance(history[i-1], history[i]));
    }

    const recent = distances.slice(-12);
    if (recent.length < 3) return { magnitude: 'SMALL', direction: 'CW', confidence: 0, isCharging: true };

    const mags = recent.map(d => Math.abs(d) >= 10 ? 'B' : 'S');
    const dirs = recent.map(d => d >= 0 ? 'CW' : 'CCW');

    // ════════════════════════════════════════════════
    // SIGNAL 1: MARKOV — Transition probabilities
    // ════════════════════════════════════════════════
    function markovProb(seq, stateA, stateB) {
        const trans = {};
        trans[stateA] = {}; trans[stateA][stateA] = 0; trans[stateA][stateB] = 0;
        trans[stateB] = {}; trans[stateB][stateA] = 0; trans[stateB][stateB] = 0;
        for (let i = 0; i < seq.length - 1; i++) trans[seq[i]][seq[i+1]]++;
        const last = seq[seq.length - 1];
        const total = trans[last][stateA] + trans[last][stateB];
        if (total === 0) return 0.5;
        return trans[last][stateA] / total; // P(stateA | last)
    }
    const markovPBig = markovProb(mags, 'B', 'S');
    const markovPCW  = markovProb(dirs, 'CW', 'CCW');

    // ════════════════════════════════════════════════
    // SIGNAL 2: RUN-LENGTH — Streak break prediction
    // ════════════════════════════════════════════════
    function runLengthProb(seq, target) {
        // Measure all run lengths of `target` in history
        const runs = [];
        let currentRun = 0;
        for (const s of seq) {
            if (s === target) { currentRun++; }
            else { if (currentRun > 0) runs.push(currentRun); currentRun = 0; }
        }
        // Current active streak
        let activeStreak = 0;
        for (let i = seq.length - 1; i >= 0; i--) {
            if (seq[i] === target) activeStreak++; else break;
        }
        if (runs.length === 0) return 0.5;
        const avgRun = runs.reduce((a,b) => a+b, 0) / runs.length;
        // If active streak exceeds average, predict a break
        if (activeStreak >= avgRun) {
            const overshoot = activeStreak / avgRun;
            return Math.max(0.1, 1 - (overshoot * 0.3)); // Declines as streak grows
        }
        return 0.5 + (activeStreak / avgRun) * 0.2; // Building confidence
    }
    const rlPBig = runLengthProb(mags, 'B');
    const rlPCW  = runLengthProb(dirs, 'CW');

    // ════════════════════════════════════════════════
    // SIGNAL 3: GLOBAL FREQUENCY — Overall ratio
    // ════════════════════════════════════════════════
    const globalPBig = mags.filter(m => m === 'B').length / mags.length;
    const globalPCW  = dirs.filter(d => d === 'CW').length / dirs.length;

    // ════════════════════════════════════════════════
    // SIGNAL 4: PATTERN MEMORY — MongoDB historical matches
    // ════════════════════════════════════════════════
    let memPBig = 0.5, memPCW = 0.5;
    let memWeight = 0; // Starts at 0 until we have database matches

    if (patternStats && patternStats.mag && patternStats.dir) {
        const magStats = patternStats.mag;
        const totalMag = (magStats.B || 0) + (magStats.S || 0);
        if (totalMag > 0) {
            memPBig = (magStats.B || 0) / totalMag;
            memWeight = Math.min(0.40, totalMag * 0.05); // Up to 40% weight if >= 8 matches
        }

        const dirStats = patternStats.dir;
        const totalDir = (dirStats.CW || 0) + (dirStats.CCW || 0);
        if (totalDir > 0) {
            memPCW = (dirStats.CW || 0) / totalDir;
            // Use highest weight found between mag and dir matches
            memWeight = Math.max(memWeight, Math.min(0.40, totalDir * 0.05));
        }
    }

    // ════════════════════════════════════════════════
    // BAYESIAN BLEND — Dynamically weighted combination
    // ════════════════════════════════════════════════
    // If memory is strong (memWeight=0.40), other weights scale down proportionally
    const wMark = 0.50 - (memWeight * 0.50);
    const wRun  = 0.30 - (memWeight * 0.25);
    const wGlob = 0.20 - (memWeight * 0.25);

    const blendPBig = (markovPBig * wMark) + (rlPBig * wRun) + (globalPBig * wGlob) + (memPBig * memWeight);
    const blendPCW  = (markovPCW  * wMark) + (rlPCW  * wRun) + (globalPCW  * wGlob) + (memPCW  * memWeight);

    const finalMagProb = blendPBig >= 0.5 ? blendPBig : 1 - blendPBig;
    const finalDirProb = blendPCW >= 0.5 ? blendPCW : 1 - blendPCW;

    const predMag = blendPBig >= 0.5 ? 'BIG' : 'SMALL';
    const predDir = blendPCW >= 0.5 ? 'CW' : 'CCW';

    const magProb = Math.round(finalMagProb * 100);
    const dirProb = Math.round(finalDirProb * 100);
    const confidence = Math.round(Math.sqrt(magProb * dirProb));

    // Solo cargar batería si no hay suficiente historial
    let isCharging = false;
    if (history.length < 5) {
        isCharging = true;
    }

    return { magnitude: predMag, direction: predDir, confidence: confidence, isCharging: isCharging };
}

// Ensure calcDist is available globally if needed by predictor.js
function calcDist(from, to) {
    const i1 = WHEEL_INDEX[from];
    const i2 = WHEEL_INDEX[to];
    if (i1 === undefined || i2 === undefined) return 0;
    let d = i2 - i1;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

// Helper for browser/node hybrid
// ─────────────────────────────────────────────────────────────────────────────
// TRAVEL ANALYST AGENT — Technical Analysis (Trading Style)
// ─────────────────────────────────────────────────────────────────────────────
function analyzeTravelWave(travels) {
    if (travels.length < 8) return { 
        signal: 'BUSCANDO PATRÓN CLARO...', targetDir: null, size: null,
        reason: 'Recolectando datos iniciales...', type: 'neutral', res: 0, sup: 0 
    };

    const abs = Math.abs;
    const sample = travels.slice(-30);
    const lastMoves = travels.slice(-10);

    // ─── 1. SOPORTES Y RESISTENCIAS ───
    const peaks   = sample.filter(v => v > 0).sort((a,b) => b - a).slice(0, 3);
    const valleys = sample.filter(v => v < 0).sort((a,b) => a - b).slice(0, 4);
    const res = peaks.length   > 0 ? peaks.reduce((a,b)=>a+b,0)   / peaks.length   : 14;
    const sup = valleys.length > 0 ? valleys.reduce((a,b)=>a+b,0) / valleys.length : -14;

    const m3 = travels[travels.length - 3] ?? 0;
    const m2 = travels[travels.length - 2] ?? 0;
    const m1 = travels[travels.length - 1]; 

    // ─── 2. DETECTOR DE FRACTALES (MODO CONSERVADOR) ───
    // Convertimos los últimos 4 movimientos en un vector de "ADN"
    const getDNA = (arr) => arr.map(v => (abs(v) >= 10 ? 'B' : 'S') + (v >= 0 ? '+' : '-')).join('|');
    const currentDNA = getDNA(travels.slice(-4));
    let fractalTarget = null;
    let fractalReason = '';

    // Escaneamos el pasado buscando el mismo ADN (necesitamos histórico largo para esto)
    if (travels.length > 20) {
        for (let i = 0; i < travels.length - 8; i++) {
            const pastDNA = getDNA(travels.slice(i, i + 4));
            if (pastDNA === currentDNA) {
                const nextMove = travels[i + 4];
                fractalTarget = { dir: nextMove >= 0 ? 'CW' : 'CCW', size: abs(nextMove) >= 10 ? 'BIG' : 'SMALL' };
                fractalReason = `Figura fractal detectada en tiro #${i+1}. Repetición geométrica probable.`;
                break; // Encontramos la primera coincidencia clara
            }
        }
    }

    // ─── 3. DETECTOR DE CANAL / TENDENCIA (SLOPE) ───
    // Calculamos el "centro" de los últimos 10 tiros para ver si sube o baja
    const firstHalfAvg = lastMoves.slice(0, 5).reduce((a,b)=>a+b,0) / 5;
    const secondHalfAvg = lastMoves.slice(5).reduce((a,b)=>a+b,0) / 5;
    const slope = secondHalfAvg - firstHalfAvg;
    const isTrendingUp = slope > 3.5; 
    const isTrendingDown = slope < -3.5;

    // ─── 4. COMPRESIÓN DE VOLATILIDAD ───
    const recentSD = Math.sqrt(lastMoves.reduce((s, x) => s + x*x, 0) / 10);
    const isCompressed = recentSD < 4.5 && travels.length > 15;

    // ──────────────── SELECCIÓN DE SEÑAL (PRIORIDAD V3: TENDENCIA > RESISTENCIA) ────────────────
    let signal    = 'BUSCANDO PATRÓN CLARO...';
    let targetDir = null; 
    let size      = null; 
    let reason    = 'Analizando flujo de ondas...';
    let type      = 'neutral';

    // A. Prioridad 1: FRACTAL (Señal de memoria específica)
    if (fractalTarget) {
        signal    = '🔄 FRACTAL REPETITIVO';
        targetDir = fractalTarget.dir;
        size      = fractalTarget.size;
        reason    = fractalReason;
        type      = targetDir === 'CW' ? 'bullish' : 'bearish';
    }
    // B. Prioridad 2: RUPTURAS (BREAKOUTS)
    // Si choca con resistencia PERO hay tendencia alcista fuerte -> Rompe resistencia
    else if (m1 >= res - 1.5 && isTrendingUp) {
        signal    = '🚀 RUPTURA ALCISTA';
        targetDir = 'CW'; // Sigue la tendencia
        size      = 'BIG';
        reason    = `Inercia (+) superior a resistencia (+${res.toFixed(1)}p). Se espera ruptura.`;
        type      = 'bullish';
    }
    // Si choca con soporte PERO hay tendencia bajista fuerte -> Rompe soporte
    else if (m1 <= sup + 1.5 && isTrendingDown) {
        signal    = '💥 RUPTURA BAJISTA';
        targetDir = 'CCW'; // Sigue la tendencia
        size      = 'BIG';
        reason    = `Presión (-) superior a soporte (${sup.toFixed(1)}p). Se espera ruptura.`;
        type      = 'bearish';
    }
    // C. Prioridad 3: CANALES (Continuación de Tendencia con hondas)
    else if (isTrendingUp) {
        signal    = '📈 CANAL ALCISTA';
        targetDir = 'CW';
        size      = abs(m1) < 5 ? 'BIG' : 'SMALL';
        reason    = 'Hondas en ascenso constante. El dealer mantiene inercia de subida.';
        type      = 'bullish';
    }
    else if (isTrendingDown) {
        signal    = '📉 CANAL BAJISTA';
        targetDir = 'CCW';
        size      = abs(m1) < 5 ? 'BIG' : 'SMALL';
        reason    = 'Hondas en descenso constante. El dealer mantiene inercia de caída.';
        type      = 'bearish';
    }
    // D. Prioridad 4: REBOTES (Solo si NO hay tendencia fuerte)
    else if (m1 >= res - 1.2) {
        signal    = '🔴 RESISTENCIA TOCADA';
        targetDir = 'CCW';
        size      = 'BIG';
        reason    = `Techo en +${res.toFixed(1)}p sin tendencia definida. Posible rebote.`;
        type      = 'bearish';
    }
    else if (m1 <= sup + 1.2) {
        signal    = '🟢 SOPORTE TOCADO';
        targetDir = 'CW';
        size      = 'BIG';
        reason    = `Suelo en ${sup.toFixed(1)}p sin tendencia definida. Posible rebote.`;
        type      = 'bullish';
    }
    // E. Compresión y Agotamiento
    else if (isCompressed) {
        signal    = '⚠️ COMPRESIÓN';
        targetDir = null;
        size      = 'BIG';
        reason    = 'Varianza mínima. Energía acumulada para un salto brusco.';
        type      = 'neutral';
    }
    else if (isCW(m3) && isCW(m2) && isCW(m1) && abs(m3) > abs(m2) && abs(m2) > abs(m1)) {
        signal    = '📉 AGOTAMIENTO';
        targetDir = 'CCW';
        size      = 'SMALL';
        reason    = `Impulso alcista perdiendo fuerza gradualmente.`;
        type      = 'bearish';
    }

    return { signal, targetDir, size, reason, type, res: +res.toFixed(1), sup: +sup.toFixed(1) };
}

if (typeof window !== 'undefined') {
    window.analyzeSpin = analyzeSpin;
    window.projectNextRound = projectNextRound;
    window.computeDealerSignature = computeDealerSignature;
    window.getIAMasterSignals = getIAMasterSignals;
    window.predictZonePattern = predictZonePattern;
    window.analyzeTravelWave = analyzeTravelWave;
    window.WHEEL_ORDER = WHEEL_ORDER;
    window.WHEEL_INDEX = WHEEL_INDEX;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WHEEL_ORDER, WHEEL_INDEX, TERMINALS_MAP,
        analyzeSpin, projectNextRound, computeDealerSignature, getIAMasterSignals, predictZonePattern, analyzeTravelWave
    };
}
