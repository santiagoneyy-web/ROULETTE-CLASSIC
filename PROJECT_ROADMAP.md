# ROULETTE-CLASSIC Roadmap

## Vision

Una web que:

- captura resultados reales de ruleta desde `casino.org`
- guarda big data en `JSON + Mongo`
- calcula metricas, travel, dominancia, momentum y patrones
- genera predicciones automaticas con IA
- mantiene una biblioteca central de estrategias humanas y de IA
- aprende con el tiempo evaluando efectividad real
- controla acceso por codigo con rol `master` y rol `member`

## What Already Exists

- API Express con historial, spins, SSE y endpoints base
- crawler DOM para `casino.org` en `crawler.js`
- fallback JSON operativo en `roulette_db.json`
- modelos Mongo iniciales de `Spin`, `Table`, `Pattern`, `ExpertRule`
- predictor automatico y chat IA
- biblioteca central de estrategias en `strategy_library.json`

## Data Layers

### Current active layers

- `roulette_db.json`: fallback local
- `strategy_library.json`: biblioteca central de estrategias
- modelos Mongo: listos para base de datos persistente

### Core entities

- `tables`
- `spins`
- `patterns`
- `expertRules`
- `users`
- `strategies`
- `metricSnapshots`
- `aiPredictions`

## Ordered Build Steps

1. Stabilize ingestion
- usar `crawler.js` como fuente principal de `casino.org`
- llenar historial real en `spins`
- verificar duplicados, reloads y continuidad

2. Lock the database schema [DONE: schema v2]
- cerrar entidades y campos finales
- mantener compatibilidad `JSON + Mongo`

3. Persist analytic snapshots
- guardar por giro: dominancia, momentum, estabilidad, performance, rutas y contexto

4. Persist AI predictions
- guardar por giro: modo, ruta, zona, N9, N4, analysis y resultado posterior

5. Formalize strategy library
- estrategia humana
- estrategia sugerida por IA
- estrategia validada por efectividad

6. Add access system
- codigo master
- codigos member
- permisos por rol

7. Add master chat powers
- consultar data interna
- guardar y editar estrategias
- revisar efectividad

8. Add evaluation engine
- medir exito real por estrategia
- medir contexto donde funciona o falla

9. Add continuous learning
- la IA propone estrategias nuevas
- el sistema las valida con datos

10. Build admin views
- panel de usuarios
- panel de estrategias
- panel de efectividad

## Immediate Next Step

El siguiente paso recomendado es:

- guardar snapshots de metricas por giro
- guardar predicciones IA por giro

Eso convierte la web en una base viva de big data y prepara el aprendizaje real.
