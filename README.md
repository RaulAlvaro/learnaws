# learnaws

App personal para aprobar **AWS Certified Solutions Architect – Associate (SAA-C03)** con 1 h/día, usando métodos con evidencia: pretesting, práctica de recuperación, repetición espaciada (FSRS-6) por concepto, successive relearning, interleaving de servicios confundibles, calibración de confianza y un tutor de IA que solo da pistas después de tu intento.

El método y la estrategia de examen están en [GUIDE.md](GUIDE.md) (también dentro de la app, en *Más → Método y estrategia*).

## Setup

```bash
pnpm install
pnpm secrets      # wizard: OpenAI, Clerk, VAPID → .env.local y Dokploy
pnpm dev
```

`pnpm secrets` corre [`scripts/setup-secrets.sh`](scripts/setup-secrets.sh): abre cada dashboard, te dice qué copiar, guarda los valores en `.env.local` y los sube a la app en Dokploy. Puedes re-ejecutarlo cuando quieras (recuerda lo ya guardado).

## Contenido

El banco (fichas, ~800 preguntas originales, preguntas de voz) se genera con OpenAI a partir de la guía oficial y la documentación de AWS, y se verifica con un segundo paso (un modelo resuelve sin ver la clave + una auditoría contra la documentación). Solo se publica lo que pasa ambos.

```bash
pnpm content docs        # descarga extractos de documentación AWS por concepto
pnpm content gen         # genera (Batch API, 50% más barato; --direct --limit 3 para probar)
pnpm content collect     # recoge batches terminados
pnpm content verify      # verificación (batch)
pnpm content collect
pnpm content finalize    # filtra, reserva 1 pregunta por concepto (≥3) para simulacros → content/concepts/*.json
pnpm content status
bash scripts/content/run-all.sh   # todo lo anterior en modo directo (reanudable)
```

- `content/syllabus.json` — 4 dominios, 14 tareas oficiales, 259 conceptos, 32 grupos de servicios confundibles.
- `content/concepts/*.json` — contenido publicado.
- `content/labs.json` — 10 labs guiados para tu cuenta de AWS.

## Motor

- `src/lib/engine/` — lógica pura y testeada (`pnpm test`): scheduler FSRS con fecha de examen, dominio por successive relearning, planificador de la sesión diaria, estimador de probabilidad de aprobar y gate de reserva.
- `src/lib/study/` — persistencia (Postgres + Drizzle), sesión, simulacros, voz y métricas.
- `src/lib/ai/` — tutor (pistas graduadas, evaluación de autoexplicaciones y respuestas por voz), TTS con caché y transcripción, con tope de gasto mensual.

## Deploy

Dokploy (VPS crafter) construye el `Dockerfile` desde `main`. Las migraciones se aplican solas al arrancar.
