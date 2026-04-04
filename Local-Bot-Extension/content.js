// content.js - Inyectado en Casino.org (CasinoScores)
const API_URL = "https://roulette-classic-v3.onrender.com/api/spin";
let lastSentNumber = null;
let lastDetectionTime = Date.now();

// Detectar en qué mesa estamos leyendo la URL activa
const isImmersive = window.location.href.includes('immersive');
const TABLE_ID = isImmersive ? 2 : 1;

console.log(`[🤖 LO-BOT v1] Iniciado en Mesa ${TABLE_ID}`);

function extractHistory() {
    const toNum = (t) => {
        const n = parseInt((t || '').trim());
        return (!isNaN(n) && n >= 0 && n <= 36) ? n : null;
    };

    // 1. Intentar buscar por Título
    const labels = ['Historial', 'History', 'Últimos', 'Results', 'Last', 'Últimas Tiradas', 'Tiradas'];
    for (const label of labels) {
        try {
            const xr = document.evaluate(
                '//*[contains(text(),"' + label + '")]',
                document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            );
            const node = xr.singleNodeValue;
            if (!node) continue;
            
            let block = node.parentElement;
            for (let up = 0; up < 5; up++) {
                if (!block) break;
                
                const containers = block.querySelectorAll('div.flex-nowrap, div[class*="overflow-x"], div[class*="history"], ul');
                for (const container of containers) {
                    const children = container.children;
                    if (children.length < 5 || children.length > 25) continue;
                    
                    const nums = [];
                    let garbageCount = 0;
                    
                    for (const child of children) {
                        const raw = (child.textContent || '').trim();
                        if (raw === '') continue;
                        
                        if (raw.length <= 3) {
                            const v = toNum(raw);
                            if (v !== null) nums.push(v);
                            else garbageCount++;
                        } else {
                            garbageCount++;
                        }
                    }
                    
                    if (nums.length >= 5 && garbageCount <= 3) {
                        return nums.slice(0, 10);
                    }
                }
                block = block.parentElement;
            }
        } catch(e) {}
    }

    // 2. Global Fallback Rápido (Selector V24)
    const allContainers = document.querySelectorAll('div.flex-nowrap, div[class*="overflow-x"], div[class*="history"], ul');
    for (const container of allContainers) {
        const children = container.children;
        if (children.length < 8 || children.length > 25) continue;
        
        const nums = [];
        let garbageCount = 0;
        for (const child of children) {
            const raw = (child.textContent || '').trim();
            if (raw === '') continue;
            if (raw.length <= 3) {
                const v = toNum(raw);
                if (v !== null) nums.push(v);
                else garbageCount++;
            } else {
                garbageCount++;
            }
        }
        
        if (nums.length >= 8 && garbageCount <= 2) {
            return nums.slice(0, 10);
        }
    }

    return [];
}

// ── Bucle de Lectura Asesino (Cada 300 ms) ──
setInterval(() => {
    try {
        const hist = extractHistory();
        if (hist && hist.length > 0) {
            const newFirst = hist[0];
            
            if (newFirst !== lastSentNumber) {
                console.log(`[🚀 LO-BOT] ¡Cazado el ${newFirst}! (Historial Visto: ${hist.slice(0,4).join(',')})`);
                
                // Dispara el HTTP POST a Render (No hay CORS error porque la API tiene app.use(cors()))
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table_id: TABLE_ID,
                        number: newFirst,
                        source: 'LocalExt_v1'
                    })
                })
                .then(res => res.json())
                .then(data => console.log(`[✅ LO-BOT] Servidor respondió:`, data))
                .catch(e => console.error(`[❌ LO-BOT] Error de red:`, e));
                
                lastSentNumber = newFirst;
                lastDetectionTime = Date.now();
            }
        }
        
        // 🚀 ANTI-CONGELAMIENTO (V2): 
        // Si pasan más de 4 minutos (240000ms) sin detectar UN SOLO número nuevo, 
        // es muy probable que la pestaña se haya suspendido o el script de React se haya colgado.
        // Forzamos un reload para despertar al bot.
        if (Date.now() - lastDetectionTime > 240000) {
            console.warn("[⚠️ LO-BOT] Inactividad excesiva detectada. Reiniciando pestaña para despertar...");
            window.location.reload();
        }
        
    } catch(e) {}
}, 300); // 300ms es indetectable en una PC moderna, la latencia visual es casi cero.
