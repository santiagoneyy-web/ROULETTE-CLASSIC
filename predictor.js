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

const STRATEGIES = [
    { strategy: '-',     betZone: [1, 2, 4, 5, 6, 10, 11, 13, 14, 15, 16, 23, 24, 25, 27, 30, 33, 36] },
    { strategy: '+',     betZone: [0, 2, 3, 4, 7, 8, 10, 12, 13, 15, 17, 18, 21, 22, 25, 26, 28, 29, 31, 32, 35] },
    { strategy: '-,-1',  betZone: [1, 5, 8, 10, 11, 13, 16, 23, 24, 27, 30, 33, 36] },
    { strategy: '-,+1',  betZone: [1, 2, 4, 6, 13, 14, 15, 16, 24, 25, 33, 36] },
    { strategy: '+,-1',  betZone: [0, 2, 3, 4, 7, 12, 15, 17, 18, 21, 25, 26, 28, 32, 35] },
    { strategy: '+,+1',  betZone: [0, 3, 7, 8, 10, 12, 13, 18, 21, 22, 26, 28, 29, 31, 32, 35] }
];

function getDistance(a, b) {
    const iA = WHEEL_INDEX[a], iB = WHEEL_INDEX[b];
    let d = iB - iA;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

function analyzeSpin(history, stats) {
    if (history.length < 3) return [];
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const prev2 = history[history.length - 3];
    
    const results = [];
    STRATEGIES.forEach(s => {
        const key = s.strategy;
        if (!stats[key]) stats[key] = { wins: 0, losses: 0, attempts: 0, outcomes: [] };
        
        const win = s.betZone.includes(last);
        stats[key].attempts++;
        if (win) stats[key].wins++; else stats[key].losses++;
        stats[key].outcomes.push(win);
        if (stats[key].outcomes.length > 20) stats[key].outcomes.shift();
        
        results.push({ strategy: key, win, wins: stats[key].wins, losses: stats[key].losses, attempts: stats[key].attempts, outcomes: stats[key].outcomes, betZone: s.betZone });
    });
    return results;
}

function projectNextRound(history, stats) {
    if (history.length < 2) return [];
    return STRATEGIES.map(s => {
        const key = s.strategy;
        const st = stats[key] || { wins: 0, losses: 0, attempts: 0, outcomes: [] };
        const hitRate = st.attempts > 0 ? (st.wins / st.attempts) * 100 : 0;
        
        let streakWin = 0, streakLoss = 0;
        for (let i = st.outcomes.length - 1; i >= 0; i--) {
            if (st.outcomes[i]) { if (streakLoss > 0) break; streakWin++; }
            else { if (streakWin > 0) break; streakLoss++; }
        }
        
        return { strategy: key, hitRate, streakWin, streakLoss, tp: s.betZone[0], cor: s.betZone.slice(1, 5), betZone: s.betZone, rule: 'MOMENTUM', targetPattern: 'neutral' };
    });
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
    
    // A stable dealer has a low standard deviation in their throw distance
    const state = stdDev <= 6 ? 'STABLE' : (stdDev <= 10 ? 'ZIGZAG' : 'CHAOS');
    
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
if (typeof window !== 'undefined') {
    window.analyzeSpin = analyzeSpin;
    window.projectNextRound = projectNextRound;
    window.computeDealerSignature = computeDealerSignature;
    window.getIAMasterSignals = getIAMasterSignals;
    window.predictZonePattern = predictZonePattern;
    window.WHEEL_ORDER = WHEEL_ORDER;
    window.WHEEL_INDEX = WHEEL_INDEX;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WHEEL_ORDER, WHEEL_INDEX, TERMINALS_MAP,
        analyzeSpin, projectNextRound, computeDealerSignature, getIAMasterSignals, predictZonePattern
    };
}
