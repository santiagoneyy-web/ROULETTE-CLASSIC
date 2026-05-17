const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const URLS = [
    'https://www.casino.org/casinoscores/es/auto-roulette/',
    'https://gamblingcounting.com/evolution-auto-roulette'
];

async function diagnoseCrawler() {
    console.log('=== DIAGNÓSTICO DEL CRAWLER ===\n');
    
    for (const url of URLS) {
        console.log(`\n--- Probando: ${url} ---`);
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            );

            console.log('1. Navegando a la página...');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            const title = await page.title();
            console.log(`   ✓ Página cargada: "${title}"`);

            // Esperar a que cargue el contenido dinámico
            await new Promise(r => setTimeout(r, 5000));

            console.log('2. Buscando datos de ruleta...');

            // Estrategia 1: Buscar spans con números
            const strategy1 = await page.evaluate(() => {
                const spans = Array.from(document.querySelectorAll('span'));
                const numbers = spans
                    .map(s => s.textContent.trim())
                    .filter(t => /^\d{1,2}$/.test(t))
                    .map(t => parseInt(t))
                    .filter(n => n >= 0 && n <= 36);
                return numbers.slice(0, 20);
            });
            console.log(`   Spans con números: [${strategy1.join(', ')}]`);

            // Estrategia 2: Buscar elementos con clases relacionadas a historial
            const strategy2 = await page.evaluate(() => {
                const selectors = [
                    '[class*="history"]',
                    '[class*="result"]',
                    '[class*="number"]',
                    '[data-testid*="history"]',
                    '[data-testid*="result"]'
                ];
                
                for (const sel of selectors) {
                    const elements = document.querySelectorAll(sel);
                    if (elements.length > 0) {
                        const numbers = Array.from(elements)
                            .map(el => el.textContent.trim())
                            .filter(t => /^\d{1,2}$/.test(t))
                            .map(t => parseInt(t))
                            .filter(n => n >= 0 && n <= 36);
                        if (numbers.length >= 5) {
                            return { selector: sel, numbers: numbers.slice(0, 15) };
                        }
                    }
                }
                return null;
            });
            
            if (strategy2) {
                console.log(`   Selector "${strategy2.selector}": [${strategy2.numbers.join(', ')}]`);
            } else {
                console.log('   No se encontraron números con selectores de clase');
            }

            // Estrategia 3: Buscar en iframes
            const frames = await page.frames();
            console.log(`   Número de iframes: ${frames.length}`);
            
            for (let i = 0; i < frames.length; i++) {
                try {
                    const frameNumbers = await frames[i].evaluate(() => {
                        return Array.from(document.querySelectorAll('span, div'))
                            .map(el => el.textContent.trim())
                            .filter(t => /^\d{1,2}$/.test(t))
                            .map(t => parseInt(t))
                            .filter(n => n >= 0 && n <= 36)
                            .slice(0, 10);
                    });
                    if (frameNumbers.length > 0) {
                        console.log(`   Iframe ${i} números: [${frameNumbers.join(', ')}]`);
                    }
                } catch(e) {
                    // Frame puede tener CORS
                }
            }

            // Estrategia 4: Intentar detectar la API
            console.log('3. Analizando requests de red...');
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');
            
            const requests = [];
            client.on('Network.responseReceived', ({ response }) => {
                if (response.url.includes('api') || response.url.includes('json')) {
                    requests.push(response.url);
                }
            });

            // Refrescar para capturar requests
            await page.reload({ waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 3000));

            if (requests.length > 0) {
                console.log(`   APIs detectadas:`);
                requests.slice(0, 5).forEach(url => console.log(`     - ${url}`));
            } else {
                console.log('   No se detectaron APIs');
            }

            // Verificar si hay elementos visuales de ruleta
            const visualCheck = await page.evaluate(() => {
                const rouletteTerms = ['roulette', 'ruleta', 'casino', 'bet', 'spin'];
                const bodyText = document.body.innerText.toLowerCase();
                return rouletteTerms.some(term => bodyText.includes(term));
            });
            console.log(`   Contenido de ruleta detectado: ${visualCheck ? 'SÍ' : 'NO'}`);

        } catch (error) {
            console.error(`   ✗ ERROR: ${error.message}`);
        } finally {
            await browser.close();
        }
    }
    
    console.log('\n=== FIN DEL DIAGNÓSTICO ===');
    process.exit(0);
}

diagnoseCrawler();
