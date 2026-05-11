const { WHEEL_ORDER, WHEEL_INDEX } = require('./predictor');

function wheelNumberAt(from, offset) {
    const idx = WHEEL_INDEX[from];
    if (idx === undefined) return null;
    return WHEEL_ORDER[(idx + offset + 37 * 2) % 37];
}

function calcDistance(from, to) {
    const i1 = WHEEL_INDEX[from];
    const i2 = WHEEL_INDEX[to];
    if (i1 === undefined || i2 === undefined) return 0;

    let d = i2 - i1;
    if (d > 18) d -= 37;
    if (d < -18) d += 37;
    return d;
}

function wheelNeighbors(num, radius) {
    const idx = WHEEL_INDEX[num];
    if (idx === undefined) return [];

    const result = [];
    for (let i = -radius; i <= radius; i++) {
        result.push(WHEEL_ORDER[(idx + i + 37) % 37]);
    }
    return result;
}

function getRoutes(lastNumber) {
    return {
        cw: {
            n9: wheelNumberAt(lastNumber, 9),
            n4Small: wheelNumberAt(lastNumber, 4),
            n4Big: wheelNumberAt(lastNumber, 14),
            hitRate: 0
        },
        ccw: {
            n9: wheelNumberAt(lastNumber, -9),
            n4Small: wheelNumberAt(lastNumber, -4),
            n4Big: wheelNumberAt(lastNumber, -14),
            hitRate: 0
        }
    };
}

function classifyTravel(distance) {
    return {
        dir: distance >= 0 ? 'CW' : 'CCW',
        zone: Math.abs(distance) >= 10 ? 'BIG' : 'SMALL'
    };
}

function buildTravelEvents(history) {
    const events = [];
    for (let i = 1; i < history.length; i++) {
        const distance = calcDistance(history[i - 1], history[i]);
        events.push({
            from: history[i - 1],
            to: history[i],
            distance,
            ...classifyTravel(distance)
        });
    }
    return events;
}

function countWindow(events, size) {
    const sample = events.slice(-size);
    return sample.reduce((acc, event) => {
        acc.cw += event.dir === 'CW' ? 1 : 0;
        acc.ccw += event.dir === 'CCW' ? 1 : 0;
        acc.big += event.zone === 'BIG' ? 1 : 0;
        acc.small += event.zone === 'SMALL' ? 1 : 0;
        return acc;
    }, { cw: 0, ccw: 0, big: 0, small: 0 });
}

function detectPattern(events) {
    const dirs = events.slice(-8).map(e => e.dir === 'CW' ? 'R' : 'L').join('');
    if (!dirs) return { label: 'Cargando historial', stability: 'red' };

    const last4 = dirs.slice(-4);
    const last6 = dirs.slice(-6);
    const last8 = dirs.slice(-8);
    const counts = countWindow(events, 8);
    const maxDir = Math.max(counts.cw, counts.ccw);

    if (/RRRR$/.test(last4) || /LLLL$/.test(last4)) {
        return { label: 'Bloque direccional fuerte', stability: 'green' };
    }
    if (last8 === 'RRLLRRLL' || last8 === 'LLRRLLRR') {
        return { label: 'Ola 2-2 clara', stability: 'green' };
    }
    if (last6 === 'RLRLRL' || last6 === 'LRLRLR') {
        return { label: 'Zigzag perfecto', stability: 'yellow' };
    }
    if (maxDir >= 6) {
        return { label: 'Dominancia direccional', stability: 'green' };
    }
    if (maxDir >= 5) {
        return { label: 'Transicion con ventaja parcial', stability: 'yellow' };
    }
    return { label: 'Mesa mixta', stability: 'red' };
}

function detectDominance(dominance8) {
    const dirDiff = Math.abs(dominance8.cw - dominance8.ccw);
    const zoneDiff = Math.abs(dominance8.big - dominance8.small);

    if (dirDiff === 0 && zoneDiff === 0) {
        return { dominant_axis: 'none', dominant_signal: 'Sin dominancia clara', dominance_score: 0 };
    }

    if (dirDiff >= zoneDiff) {
        const signal = dominance8.cw >= dominance8.ccw ? 'CW' : 'CCW';
        return { dominant_axis: 'direction', dominant_signal: signal, dominance_score: dirDiff };
    }

    const signal = dominance8.big >= dominance8.small ? 'BIG' : 'SMALL';
    return { dominant_axis: 'size', dominant_signal: signal, dominance_score: zoneDiff };
}

function hitInRadius(target, number, radius) {
    if (target === null || number === null) return false;
    return wheelNeighbors(target, radius).includes(number);
}

function getRouteTargets(previousNumber) {
    return {
        cw: {
            n9: wheelNumberAt(previousNumber, 9),
            n4Small: wheelNumberAt(previousNumber, 4),
            n4Big: wheelNumberAt(previousNumber, 14)
        },
        ccw: {
            n9: wheelNumberAt(previousNumber, -9),
            n4Small: wheelNumberAt(previousNumber, -4),
            n4Big: wheelNumberAt(previousNumber, -14)
        }
    };
}

function buildPerformance(history, routeKey, targetKey, limit = 8) {
    const marks = [];
    const start = Math.max(1, history.length - limit);

    for (let i = start; i < history.length; i++) {
        const targets = getRouteTargets(history[i - 1]);
        const target = targets[routeKey][targetKey];
        const radius = targetKey === 'n9' ? 4 : 2;
        marks.push(hitInRadius(target, history[i], radius) ? 'W' : 'L');
    }

    return marks.join('');
}

function routeHitRate(history, routeKey, limit = 8) {
    const marks = buildPerformance(history, routeKey, 'n9', limit);
    if (!marks) return 0;
    const wins = marks.split('').filter(x => x === 'W').length;
    return Number(((wins / marks.length) * 100).toFixed(0));
}

function buildMetricSnapshot({ tableId, tableCode = 'AUTO', spinId = null, history, mode = 'AUTO' }) {
    const cleanHistory = (Array.isArray(history) ? history : [])
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 36);

    const lastNumber = cleanHistory[cleanHistory.length - 1];
    const events = buildTravelEvents(cleanHistory);
    const dominance8 = countWindow(events, 8);
    const momentum15 = countWindow(events, 15);
    const pattern = detectPattern(events);
    const dominance = detectDominance(dominance8);
    const routes = getRoutes(lastNumber);

    routes.cw.hitRate = routeHitRate(cleanHistory, 'cw');
    routes.ccw.hitRate = routeHitRate(cleanHistory, 'ccw');

    return {
        table_id: Number(tableId),
        table_code: tableCode,
        spin_id: spinId,
        window_size: Math.min(15, Math.max(0, events.length)),
        recent_numbers: cleanHistory.slice(-15),
        stability_level: pattern.stability,
        pattern_label: pattern.label,
        dominant_axis: dominance.dominant_axis,
        dominant_signal: dominance.dominant_signal,
        dominance_score: dominance.dominance_score,
        dominance8,
        momentum15,
        performance8: {
            cwN9: buildPerformance(cleanHistory, 'cw', 'n9'),
            cwN4: [
                buildPerformance(cleanHistory, 'cw', 'n4Small'),
                buildPerformance(cleanHistory, 'cw', 'n4Big')
            ].join('/'),
            ccwN9: buildPerformance(cleanHistory, 'ccw', 'n9'),
            ccwN4: [
                buildPerformance(cleanHistory, 'ccw', 'n4Small'),
                buildPerformance(cleanHistory, 'ccw', 'n4Big')
            ].join('/')
        },
        routes,
        context: {
            source: 'server_ingest',
            notes: `mode=${mode}; dominance-first snapshot`
        },
        captured_at: new Date().toISOString()
    };
}

module.exports = {
    buildMetricSnapshot,
    calcDistance,
    wheelNumberAt,
    wheelNeighbors
};
