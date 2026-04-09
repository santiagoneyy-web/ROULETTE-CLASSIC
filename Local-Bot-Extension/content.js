// content.js - Inyectado en Casino.org (CasinoScores)
const API_URL = "https://roulette-classic-v3.onrender.com/api/spin";
let lastSentNumber = null;
let lastDetectionTime = Date.now();

// Detectar en qué mesa estamos leyendo la URL activa
const isImmersive = window.location.href.includes('immersive');
const TABLE_ID = isImmersive ? 2 : 1;

console.log(`[🤖 LO-BOT v1] Iniciado en Mesa ${TABLE_ID}`);

// ─── HACK MASTER: ENGAÑAR A CASINO.ORG (React/SPA) ───
// Los sitios modernos detienen la renderización cuando la pestaña está oculta.
// Este código anula las propiedades globales e intercepta listenings.
const hijackCode = `
    try {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        Object.defineProperty(document, 'hidden', { get: () => false });
        
        // Bloquear completamente cualquier intento del casino de registrar un evento de visibilidad
        const originalAddEventListener = document.addEventListener;
        document.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'webkitvisibilitychange') {
                console.log('[👁️ LO-BOT] Bloqueado intento del sitio web de detectar visibilidad.');
                return; // drop silently
            }
            return originalAddEventListener.call(document, type, listener, options);
        };
        const origWindowAdd = window.addEventListener;
        window.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'webkitvisibilitychange' || type === 'blur') {
                return; 
            }
            return origWindowAdd.call(window, type, listener, options);
        };
    } catch(e) {}
`;
const scriptEl = document.createElement('script');
scriptEl.textContent = hijackCode;
(document.head || document.documentElement).appendChild(scriptEl);
scriptEl.remove();
// ──────────────────────────────────────────────

// ─── UI HACK ANTI-CONGELAMIENTO (AUDIO BLOB) ───
let audioHackEnabled = false;

function injectWakeUI() {
    if (!document.body) { setTimeout(injectWakeUI, 100); return; }
    
    const wakeUI = document.createElement('div');
    wakeUI.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999999;background:#f04060;color:white;padding:20px;border-radius:8px;font-family:sans-serif;font-weight:bold;font-size:18px;cursor:pointer;box-shadow:0 0 20px rgba(0,0,0,0.8); text-align:center; transition: all 0.5s;';
    wakeUI.innerHTML = '🔴 CLÁSICO BOT<br><span style="font-size:12px;font-weight:normal;">Haz CLIC AQUÍ para evitar que la pestaña se congele en segundo plano</span>';
    document.body.appendChild(wakeUI);

    wakeUI.addEventListener('click', () => {
        if(!audioHackEnabled) {
             audioHackEnabled = true;
             const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
             audio.loop = true;
             audio.play().then(() => {
                 console.log('[🚀 LO-BOT] Anti-Throttling activado.');
                 wakeUI.style.background = '#30e090';
                 wakeUI.innerHTML = '🟢 BOT ACTIVO AL 100%<br><span style="font-size:12px;font-weight:normal;">Ya puedes cambiar de pestaña tranquilamente.</span>';
                 setTimeout(() => { wakeUI.style.opacity = '0'; setTimeout(()=>wakeUI.remove(), 500); }, 2500);
             }).catch(e => console.error("Audio hack falló", e));
        }
    });
}
injectWakeUI();
// ──────────────────────────────────────────

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
