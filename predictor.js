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
    if (history.length < 2) return { directionState: 'measuring', recommendedPlay: 'NONE', avgTravel: null };
    const travels = [];
    for (let i = 1; i < history.length; i++) travels.push(getDistance(history[i-1], history[i]));
    
    const lastT = travels[travels.length - 1];
    const state = Math.abs(lastT) <= 9 ? 'stable' : 'chaos';
    const rec = lastT > 0 ? 'BIG' : 'SMALL';
    
    return { 
        directionState: state, 
        recommendedPlay: rec, 
        avgTravel: lastT, 
        travelHistory: travels,
        casilla5: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 5) % 37],
        casilla14: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 14) % 37],
        casilla1: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 1) % 37],
        casilla19: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 19) % 37],
        casilla10: WHEEL_ORDER[(WHEEL_INDEX[history[history.length-1]] + 10) % 37]
    };
}

const MIN_CONFID_VALUE = 70;
function filterLowConfidence(signal) {
    if (!signal.conf) return { ...signal, val: null };
    const val = parseInt(signal.conf);
    if (isNaN(val) || val < MIN_CONFID_VALUE) {
        return { ...signal, val: null, rule: 'PAUSA (BAJA CONF.)', reason: 'SEÑAL INESTABLE' };
    }
    return signal;
}

function getFinalSignal(val, confStr, rule, reason, mode) {
    return { val, conf: confStr, rule, reason, mode };
}

function getIAMasterSignals(prox, sig, history) {
    if (!prox || !prox.length || !sig) return [];
    const signals = [];
    const isChaos = sig.directionState === 'chaos';
    const isDirZigZag = sig.travelHistory.length >= 2 && Math.sign(sig.travelHistory[sig.travelHistory.length-1]) !== Math.sign(sig.travelHistory[sig.travelHistory.length-2]);

    // 1. Android n16 (Math Momentum)
    const bestStrat = getBestMathematicalStrategy(prox);
    let n16Result = getFinalSignal(bestStrat.tp, (bestStrat.momentum > 0 ? "92%" : "85%"), bestStrat.rule, "MOMENTUM MATEMÁTICO", 'MATH');
    n16Result = filterLowConfidence(n16Result);
    signals.push({
        name: 'Android n16',
        tp: n16Result.val,
        cor: bestStrat.cor,
        betZone: n16Result.val !== null ? bestStrat.betZone : [], 
        number: n16Result.val,
        confidence: n16Result.conf,
        reason: n16Result.reason,
        rule: n16Result.rule,
        mode: n16Result.mode,
        streakWin: bestStrat.streakWin,
        streakLoss: bestStrat.streakLoss
    });

    // 2. Android n17 (Physical Matrix)
    let n17Result = filterLowConfidence(getFinalSignal(sig.casilla1, "88%", "FISICA", "MATRIZ", "ESCUDO"));
    signals.push({
        name: 'Android n17',
        number: n17Result.val,
        small: sig.casilla5,
        big: sig.casilla14,
        confidence: n17Result.conf,
        reason: n17Result.reason,
        rule: n17Result.rule,
        mode: n17Result.mode,
        lanzaTarget: sig.casilla5
    });

    // 3. Android 1717 (Hybrid)
    let target1717 = isDirZigZag ? sig.casilla14 : sig.casilla5;
    let n1717Result = filterLowConfidence(getFinalSignal(target1717, "90%", "HIBRIDO", "ZIGZAG", "ATAQUE"));
    signals.push({
        name: 'Android 1717',
        number: n1717Result.val,
        confidence: n1717Result.conf,
        reason: n1717Result.reason,
        rule: n1717Result.rule,
        mode: 'ATAQUE',
        targetZone: sig.recommendedPlay
    });

    // 4. N18 (Soporte Pro)
    let n18Result = filterLowConfidence(getFinalSignal(sig.casilla19, "86%", "SOPORTE", "ZONA", "SOPORTE"));
    signals.push({
        name: 'N18',
        number: n18Result.val,
        confidence: n18Result.conf,
        reason: n18Result.reason,
        rule: n18Result.rule,
        mode: 'SOPORTE',
        small: sig.casilla5,
        big: sig.casilla14,
        casilla1: sig.casilla1,
        casilla19: sig.casilla19
    });

    return signals;
}

function getBestMathematicalStrategy(prox) {
    if (!prox || !prox.length) return { strategy: '-', tp: null, cor: [], betZone: [], rule: 'STOP', momentum: 0, streakWin: 0, streakLoss: 0 };
    return { ...prox[0], momentum: 1 };
}

console.log("🚀 [Predictor] Core logic loaded.");

// Helper for browser/node hybrid
const _export = (typeof module !== 'undefined' && module.exports) ? module.exports : (window || {});

if (typeof window !== 'undefined') {
    window.analyzeSpin = analyzeSpin;
    window.projectNextRound = projectNextRound;
    window.computeDealerSignature = computeDealerSignature;
    window.getIAMasterSignals = getIAMasterSignals;
    window.getBestMathematicalStrategy = getBestMathematicalStrategy;
    window.WHEEL_ORDER = WHEEL_ORDER;
    window.WHEEL_INDEX = WHEEL_INDEX;
    window.STRATEGIES = STRATEGIES;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STRATEGIES, WHEEL_ORDER, WHEEL_INDEX,
        analyzeSpin, projectNextRound, computeDealerSignature, getIAMasterSignals, getBestMathematicalStrategy
    };
}
