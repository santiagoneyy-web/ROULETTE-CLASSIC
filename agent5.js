// ============================================================
// agent5.js — Autonomous AI Pattern Matching (Backend Node)
// ============================================================
const Spin = require('./models/Spin');

const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const WHEEL_INDEX = {};
WHEEL_ORDER.forEach((n, i) => { WHEEL_INDEX[n] = i; });

function getSector(number) {
    if (number === 0) return 'Zero';
    const voisins = [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25];
    const tiers = [27,13,36,11,30,8,23,10,5,24,16,33];
    const orphelins = [1,20,14,31,9,17,34,6];
    
    if (voisins.includes(number)) return 'Voisins';
    if (tiers.includes(number)) return 'Tiers';
    if (orphelins.includes(number)) return 'Orphelins';
    return null;
}

// Calculate distance and direction between two numbers
function getPhysics(prev, current) {
    if (prev === null || current === null) return { distance: null, direction: null };
    
    const iPrev = WHEEL_INDEX[prev];
    const iCurr = WHEEL_INDEX[current];
    
    if (iPrev === iCurr) return { distance: 'Zero', direction: null };
    
    let dist = iCurr - iPrev;
    if (dist > 18) dist -= 37;
    if (dist < -18) dist += 37;
    
    const direction = dist > 0 ? 'CW' : 'CCW';
    const absDist = Math.abs(dist);
    const distanceClass = absDist <= 9 ? 'Small' : 'Big';
    
    return { distance: distanceClass, direction };
}

// Agent 5: Similarity Search + DNA Absorption
// Looks for historical instances where the exact same sequence occurred.
// Also 'absorbs' DNA from other agents to check for alignment.
async function predictAgent5(tableId, currentHistoryNumbers, otherAgentsDNA = []) {
    // CRITICAL: We need at least 50 spins to have a statistically relevant base for similarity search
    if (currentHistoryNumbers.length < 50) return null;
    
    // We base our search on the last 3 spin numbers
    const seq = currentHistoryNumbers.slice(-3);
    
    // We want to find cases in MongoDB where this exact 3-number sequence played out, 
    // and see what the *next* number was mostly.
    
    try {
        let history = [];
        if (Spin.db.readyState === 1) { // 1 = connected
            history = await Spin.find({ table_id: tableId }).sort({ id: 1 }).limit(5000).exec();
        } else {
            // Fallback to local file if Mongo is not connected
            const db = require('./database');
            history = await new Promise((resolve, reject) => {
                db.getHistory(tableId, 5000, (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });
        }
        const nums = history.map(h => h.number);
        const physicsData = history.map(h => ({ dist: h.distance, dir: h.direction }));
        
        // Current Physics sequence
        const currentPhys = [];
        for (let i = currentHistoryNumbers.length - 3; i < currentHistoryNumbers.length - 1; i++) {
            currentPhys.push(getPhysics(currentHistoryNumbers[i], currentHistoryNumbers[i+1]));
        }

        // --- 1. EXTRACT EXPERT DNA (Proactive Influence) ---
        let dnaPower = {}; // Points for numbers suggested by other elite agents
        otherAgentsDNA.forEach(ag => {
            if (ag.number !== null && ag.number !== undefined) {
                dnaPower[ag.number] = (dnaPower[ag.number] || 0) + 3; // Direct number: High DNA Weight
                
                // Neighbor boost (N1 range on wheel)
                const i = WHEEL_INDEX[ag.number];
                [WHEEL_ORDER[(i+36)%37], WHEEL_ORDER[(i+1)%37]].forEach(n => {
                    dnaPower[n] = (dnaPower[n] || 0) + 1;
                });
            }
            if (ag.tp !== null && ag.tp !== undefined) dnaPower[ag.tp] = (dnaPower[ag.tp] || 0) + 2;
            if (Array.isArray(ag.cor)) ag.cor.forEach(n => dnaPower[n] = (dnaPower[n] || 0) + 1);
            if (ag.small !== undefined) dnaPower[ag.small] = (dnaPower[ag.small] || 0) + 1;
            if (ag.big !== undefined) dnaPower[ag.big] = (dnaPower[ag.big] || 0) + 1;
        });

        let nextNumberFrequencies = {};
        let matches = 0;
        
        // --- 1. DEEP PATTERN MATCHING (Numbers + Physics) ---
        for (let i = 0; i < nums.length - 3; i++) {
            // Check Number Sequence (3 spins)
            const numMatch = (nums[i] === seq[0] && nums[i+1] === seq[1] && nums[i+2] === seq[2]);
            
            // Check Physics Sequence (Last 2 transitions)
            const p1 = getPhysics(nums[i], nums[i+1]);
            const p2 = getPhysics(nums[i+1], nums[i+2]);
            const physMatch = (p1.distance === currentPhys[0].distance && p1.direction === currentPhys[0].direction &&
                               p2.distance === currentPhys[1].distance && p2.direction === currentPhys[1].direction);

            if (numMatch || physMatch) {
                const nextNum = nums[i+3];
                if (!nextNumberFrequencies[nextNum]) nextNumberFrequencies[nextNum] = 0;
                
                // Weight: Number match is strong, Physics match is subtle, Both is "Perfect"
                let weight = 0;
                if (numMatch) weight += 2;
                if (physMatch) weight += 1;
                
                nextNumberFrequencies[nextNum] += weight;
                matches++;
            }
        }
        
        // --- 2. FALLBACK 1 (2-Number Sequence) ---
        if (matches === 0) {
            for (let i = 0; i < nums.length - 2; i++) {
                if (nums[i] === seq[1] && nums[i+1] === seq[2]) {
                    const nextNum = nums[i+2];
                    if (!nextNumberFrequencies[nextNum]) nextNumberFrequencies[nextNum] = 0;
                    nextNumberFrequencies[nextNum]++;
                    matches++;
                }
            }
        }
        
        // --- 3. FALLBACK 2 (Last Number Only) ---
        if (matches === 0) {
            for (let i = 0; i < nums.length - 1; i++) {
                if (nums[i] === seq[2]) {
                    const nextNum = nums[i+1];
                    if (!nextNumberFrequencies[nextNum]) nextNumberFrequencies[nextNum] = 0;
                    nextNumberFrequencies[nextNum]++;
                    matches++;
                }
            }
        }

        // If still no matches, foolproof fallback: Global Frequencies for this table
        if (matches === 0) {
            console.log(`⚠️ [Célula] No sequence matches. Falling back to global table frequencies.`);
            for (let i = 0; i < nums.length; i++) {
                const n = nums[i];
                if (!nextNumberFrequencies[n]) nextNumberFrequencies[n] = 0;
                nextNumberFrequencies[n]++;
                matches++;
            }
        }

        // If even global fails (empty table?), return null
        if (matches === 0) {
            console.log(`❌ [Célula] Critical: No history found for table ${tableId}.`);
            return null;
        }
        
        // --- 4. DATA FUSION (Combine Patterns + DNA Power) ---
        if (matches > 0 || Object.keys(dnaPower).length > 0) {
            Object.keys(dnaPower).forEach(n => {
                if (nextNumberFrequencies[n] !== undefined) {
                    nextNumberFrequencies[n] += dnaPower[n]; // Synergetic power!
                } else {
                    nextNumberFrequencies[n] = dnaPower[n] * 0.5; // DNA influence
                }
            });
        }
        
        let topNum = null;
        let maxScore = 0;
        for (const [numStr, score] of Object.entries(nextNumberFrequencies)) {
            if (score > maxScore) {
                maxScore = score;
                topNum = parseInt(numStr);
            }
        }
        
        // Final Synergy Check for UI
        let dnaMatchFound = false;
        if (topNum !== null && otherAgentsDNA.some(a => a.number === topNum || a.tp === topNum)) {
            console.log(`🧬 [Célula] Deep DNA Synergy: Prediction ${topNum} is backed by the team experts.`);
            dnaMatchFound = true;
        }

        return { topNum, dnaMatch: dnaMatchFound };
        
    } catch (e) {
        console.error("Agent 5 execution error:", e);
        return null;
    }
}

function evaluatePrediction(realNumber, predictedNumber) {
    if (predictedNumber === null || realNumber === null) return null;
    if (realNumber === predictedNumber) return 'Direct';
    
    const iReal = WHEEL_INDEX[realNumber];
    const iPred = WHEEL_INDEX[predictedNumber];
    
    let dist = Math.abs(iReal - iPred);
    dist = Math.min(dist, 37 - dist);
    
    if (dist <= 2) return 'Neighbor'; // N2
    return 'Loss';
}

module.exports = {
    getSector,
    getPhysics,
    predictAgent5,
    evaluatePrediction,
    WHEEL_ORDER,
    WHEEL_INDEX
};
