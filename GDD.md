# AWS Quest (learnaws)

> Eres un arquitecto en formación que recorre 8 islas de servicios AWS jugando rondas cortas y armando diagramas, para llegar al examen SAA-C03 con dominio real — no con suerte.

| | |
| --- | --- |
| Engine | React + Motion dentro de la app Next.js 16 existente (sin canvas; Phaser no aporta a un juego de UI) |
| Platform | web móvil primero (PWA) + escritorio; multiusuario con registro abierto (Clerk) |
| View | UI 2D: mapa de islas + tarjetas de ronda + diagramas SVG |
| Scope | small release por hitos jugables sobre el motor de estudio actual |
| References | Duolingo (camino, racha, sonidos), Kahoot (botones enormes de color, ritmo), Brilliant (diagramas interactivos en vez de párrafos) |

## Principios (no negociables, vienen de la evidencia)

- El motor de aprendizaje manda: FSRS por concepto, successive relearning 3+3, pretest, interleaving, confianza. El juego es la piel.
- Menos lectura: narración + diagrama (modalidad/pre-training de Mayer), texto a pedido. Letra ≥ 20 px.
- Sin cronómetro ni puntos por velocidad mientras se aprende (la presión de tiempo baja la precisión). El tiempo solo como señal interna.
- Sin rankings ni premios por completar (bajan motivación intrínseca). Feedback informativo, progreso real, racha que no castiga.
- Construir el diagrama uno mismo > verlo hecho (Nesbit & Adesope 2006: g 0.82 vs 0.37).
- Progresión corto → largo: el examen es de escenarios largos; los jefes y simulacros los entrenan con ritmo real.

## Core loop

Tocar **Jugar** → el motor elige una ronda (Descubrir · Repaso · Mezcla · Jefe) → ~8 ítems en 4–5 min → pantalla de resultado (XP, qué subió, sonido) → siguiente ronda. Meta diaria: 8 rondas (tune) ≈ 40 min + preguntas largas.

## First 30 seconds

1. Mapa de 8 islas con progreso y un botón **Jugar** gigante (y aviso de privacidad la primera vez).
2. Toque en Jugar → "Descubrir: Amazon SQS": una voz narra mientras el diagrama productor → cola → consumidor se arma por segmentos.
3. Arrastras (o tocas pieza → hueco) los componentes al diagrama; encajan con un "clic".
4. Primera pregunta relámpago en letra grande, leída en voz alta; aciertas → sonido + rebote + XP.

## Controls

| Acción | Teclado | Toque |
| --- | --- | --- |
| Elegir opción | 1–4 / A–D | tocar botón (≥ 56 px alto) |
| Confirmar / siguiente | Enter / Espacio | botón inferior fijo |
| Confianza | Q / W / E | 3 botones |
| Colocar pieza en diagrama | Tab + Enter | arrastrar, o tocar pieza y luego hueco |
| Repetir audio / ES-EN | R / T | botones 🔊 y ES |

## Mechanics

### Formatos de ítem (de fácil a examen)

1. **Relámpago**: ≤ 20 palabras, una restricción → servicio/feature (4 botones color+símbolo ▲◆●■).
2. **Esto o aquello**: dos opciones gigantes entre confundibles (SQS Standard | FIFO).
3. **Completa el diagrama**: arquitectura SVG con un hueco; elige la pieza.
4. **Mini escenario + chips**: 2–3 frases con chips de requisitos (💰 menor costo, ⚙️ menos operación, 🌍 multi-región).
5. **Escenario completo resaltado**: pregunta larga con las palabras clave marcadas.
6. **Examen**: escenario largo sin ayudas, ritmo 2 min/ítem (jefes y simulacros; banco reservado solo en simulacros completos).

### Rondas

- **Descubrir**: explicación narrada del servicio (segmentos de 10–15 s, avanza con toque) → construir su diagrama → 4–6 relámpago/esto-o-aquello. Desbloquea los conceptos del servicio para el motor.
- **Repaso**: conceptos debidos por FSRS, formato según nivel (bronce → relámpago; plata → mini escenario; oro → escenario).
- **Mezcla**: grupos confundibles ya conocidos.
- **Jefe** (por isla, al tener ≥ 60% plata): 8 escenarios largos, sin ayudas.
- **Contrarreloj** (opcional): solo conceptos oro, cuenta regresiva 20 s (tune), ritmo Kahoot.

### XP y niveles

- XP solo por aciertos sin ayuda: base 10; confianza "seguro" +5 si acierta, −5 si falla (calibración); "adivinando" 5 fijo (tune).
- Nivel por servicio = fases del motor: bronce (visto), plata (en repaso), oro (graduado).
- Racha diaria (≥ 1 ronda) con 1 comodín semanal automático.
- Insignias informativas por hito de dominio ("Dominaste mensajería desacoplada").

## Win, fail, restart

- **Fallo en un ítem**: sonido suave, pista graduada (si hay API key) o explicación verificada; el concepto se reprograma. Nunca "game over".
- **Ronda**: siempre termina con resultado; Jefe perdido (< 70%) → se reintenta tras repasar sus conceptos.
- **Victoria final**: gate de reserva (2 simulacros ≥ 80%, ningún dominio < 70%, externo ≥ 80%) → "Reserva tu examen" + reporte del resultado real.

## Challenge and progression

Las islas se desbloquean por prerequisitos del syllabus; dentro de cada una los servicios suben de bronce a oro según el motor. El formato de los ítems sube con el nivel del concepto y la cercanía a la fecha meta (últimas 2 semanas: 60%+ escenarios completos).

## Game feel

Acierto: botón rebota (scale 1→1.08→1, 180 ms), destello verde, "ding", vibración 30 ms. Error: sacudida suave 6 px, tono bajo, sin rojo estridente. Pieza encaja: snap con ease-out 120 ms + "clic". Subida de nivel: confeti breve + fanfarria corta. Pantalla de resultado con contador de XP animado.

## Art direction

- **Estilo**: flat vector, bordes redondeados 16 px, íconos oficiales AWS Architecture Icons en diagramas.
- **Palette** (claro por defecto): fondo `#FBFAF8` · texto `#1B1A18` · acento `#D9731A` · opciones ▲`#E23D4B` ◆`#2F6FEB` ●`#E0A100` ■`#1F9D55` · islas por familia con tonos suaves. Tema oscuro cálido opcional.
- **Legibilidad**: preguntas 20 px, opciones 24 px (botón A+ hasta 150%), contraste ≥ 4.5:1, líneas ≤ 60 caracteres, color nunca como único código (símbolos ▲◆●■).
- **HUD de ronda**: barra de progreso de la ronda, XP, botones 🔊 / ES / A+ arriba; botón de acción fijo abajo.

## Audio

- **Narración**: OpenAI TTS pre-generada y cacheada para contenido compartido (explicaciones y preguntas); auto-lectura activable.
- **Música**: apagada por defecto; opción lo-fi suave.
- **SFX**: ver tabla de assets. Vibración en móvil.

## Multiusuario

- Registro abierto (Clerk). Todo dato de progreso tiene `userId`; los datos actuales se migran al dueño.
- **API key de OpenAI por usuario** (BYOK), cifrada AES-256-GCM, nunca devuelta al cliente. Sin key la app funciona; se apagan tutor, corrección y voz.
- La key del servidor solo se usa para el pipeline de contenido y el audio compartido.
- Admin (dueño): panel con usuarios, actividad, avance, predicción vs resultado real, feedback. Aviso de privacidad y borrado de cuenta.
- Rate limiting por usuario; TTS de texto libre no se cachea.

## Assets

| Key | Description | Source | Status |
| --- | --- | --- | --- |
| sfx-correct | acierto corto brillante | kenney:interface-sounds | todo |
| sfx-wrong | error suave grave | kenney:interface-sounds | todo |
| sfx-snap | pieza encaja | kenney:interface-sounds | todo |
| sfx-levelup | fanfarria corta | kenney:interface-sounds / generate | todo |
| sfx-streak | whoosh de racha | kenney:interface-sounds | todo |
| aws-icons | AWS Architecture Icons (SVG) | aws.amazon.com/architecture/icons | todo |
| narration-* | narración por servicio | generate (OpenAI TTS, cache) | todo |
| font-ui | Geist (ya incluida) | next/font | done |

## Milestones

0. **M0: Multiusuario** — `userId` en el esquema + migración, BYOK cifrada, admin, feedback, reporte de examen, rate limits, privacidad/borrado.
1. **M1: Rondas relámpago** — botón Jugar, ronda de 8 ítems estilo Kahoot con letra grande, auto-audio, XP, SFX y resultado, usando el contenido actual + chips de palabras clave.
2. **M2: Descubrir servicios** — ~70 explicaciones narradas con diagrama + ~900 ítems relámpago/esto-o-aquello nuevos (genera Claude, audita OpenAI).
3. **M3: Diagramas** — completar/construir diagramas (~100) con piezas arrastrables.
4. **M4: Mapa y jefes** — 8 islas, bronce/plata/oro, jefes, contrarreloj, racha con comodín, tema claro/oscuro.

## Out of scope for v1

Multijugador, rankings, grupos de estudio cooperativos (candidato v2), música adaptativa, avatar/personaje.

## Changelog

- 2026-09-26: GDD inicial (entrevista de diseño + investigación de gamificación, multimedia y legibilidad).
- 2026-09-26: M0 multiusuario (userId en todo, BYOK cifrada, admin, feedback, resultado de examen, rate limits, privacidad/borrado).
