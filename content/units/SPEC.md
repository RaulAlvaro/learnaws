# Unit content spec (M2: "Descubrir" + preguntas relámpago)

One file per unit: `content/units/<unitId>.json`. Units, their concepts and islands are defined in `content/services.json`.

## Grounding (mandatory)

- Facts must match the **verified** material in `content/concepts/<conceptId>.json` (card + questions + explanations, already audited against AWS docs) and current AWS behaviour. Do not introduce numbers/limits that aren't in that material unless you are certain they're current.
- Original writing only. Never reproduce real exam questions or braindumps.
- Exam version: SAA-C03.

## Audience and language

Adult learner with tired eyes, studying 1 h/day, preparing the exam in English. Everything learner-facing is in **neutral Latin-American Spanish ("tú")** with AWS service/feature names and exam keyword phrases in **English**. Lightning prompts have both `prompt` (English, exam-style wording) and `promptEs`.

## Schema

```json
{
  "unitId": "sqs",
  "overview": {
    "title": "Amazon SQS",
    "hook": "Una fila de mensajes para que las partes de tu app no se esperen entre sí.",   // ≤ 15 words
    "diagram": {
      "nodes": [
        { "id": "prod", "label": "Productor", "kind": "actor", "x": 10, "y": 50 },
        { "id": "q", "label": "SQS", "kind": "service", "service": "Amazon SQS", "x": 50, "y": 50 },
        { "id": "cons", "label": "Consumidor", "kind": "actor", "x": 90, "y": 50 }
      ],
      "edges": [ { "from": "prod", "to": "q", "label": "SendMessage" }, { "from": "q", "to": "cons", "label": "poll" } ]
    },
    "segments": [
      { "narration": "…1–3 frases, ≤ 45 palabras…", "show": ["prod", "q"], "focus": "q" }
    ],
    "keyPoints": ["3–5 bullets ≤ 12 palabras cada uno"],
    "confusedWith": [ { "unitOrService": "Amazon SNS", "difference": "≤ 20 palabras" } ]
  },
  "items": [
    {
      "id": "sqs--l1",
      "conceptId": "sqs-standard-vs-fifo",
      "format": "lightning",                // or "thisorthat"
      "prompt": "Strict ordering and no duplicates for order events → ?",
      "promptEs": "Orden estricto y sin duplicados para eventos de pedidos → ?",
      "options": [ { "id": "A", "text": "SQS FIFO queue" }, { "id": "B", "text": "SQS Standard queue" }, { "id": "C", "text": "SNS topic" }, { "id": "D", "text": "Kinesis Data Streams" } ],
      "answer": "A",
      "why": "Explicación en español, 1–2 frases: el requisito que decide y por qué la tentadora no sirve."
    }
  ]
}
```

### Diagram rules
- 3–7 nodes. Coordinates are percentages (x 0–100 left→right, y 0–100 top→bottom) laid out to read left→right without overlaps (keep ≥ 18 units apart).
- `kind`: `service` (an AWS service; set `service` to its official name), `actor` (users, clients, on-prem, app), `data` (objects, messages, records), `zone` (AZ/Region/VPC boundary label), `note`.
- Labels ≤ 18 characters.

### Segment rules (the narration drives learning — Mayer's modality + pre-training + segmenting)
- 4–7 segments; each 1–3 sentences, ≤ 45 words, spoken style (it is read aloud by TTS), no lists, no markdown.
- `show`: node ids visible from this segment on (cumulative build-up); `focus`: node highlighted while it is narrated.
- Order: what it is and the problem it solves → the pieces → how data/requests flow → the 1–2 key choices/variants the exam tests (e.g. Standard vs FIFO) → when NOT to use it / what it's confused with.

### Item rules (lightning = pure retrieval with minimal reading)
- ~3 items per concept of the unit (2 for examFrequency 1, 4 for examFrequency 3). Cover every concept of the unit.
- `prompt` ≤ 20 words, one requirement → answer. Arrow style ("… → ?") or very short question.
- `lightning`: exactly 4 options (A–D), one correct, distractors are real look-alike services/features. `thisorthat`: exactly 2 options (A, B) contrasting two confusables. Mix ~70% lightning / 30% thisorthat.
- Options ≤ 8 words; the correct option must not be systematically longer than distractors; vary the correct letter.
- `why` in Spanish ≤ 35 words.
- ids: `<unitId>--l<n>`.

## Validate before finishing
With node: JSON parses; every concept of the unit (per services.json) has ≥ 2 items; option counts/answers valid; node ids referenced by segments/edges exist; ids unique.
