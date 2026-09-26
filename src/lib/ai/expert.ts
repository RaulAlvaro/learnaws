import "server-only";
import { getContent } from "../content/load";
import { ownAttempt } from "../study/attempts";

/**
 * "Pregúntale al experto": a conversational AWS expert grounded in retrieved,
 * verified material. Only reachable after the learner answered (the attempt exists),
 * so it never replaces the retrieval attempt itself.
 */
export const EXPERT_INSTRUCTIONS = `Eres un Solutions Architect de AWS con años de experiencia que ayuda a un estudiante a aprobar el examen SAA-C03.
Hablas en español neutro (tú), claro y cercano, y dejas en inglés los nombres de servicios, features y frases clave del examen (least operational overhead, cost-effective, highly available...).
Reglas:
- Basa los datos técnicos en las FUENTES que recibes (fichas verificadas, explicaciones verificadas y extractos de la documentación de AWS) y cítalas con [n] cuando las uses. Si algo no está en las fuentes y no estás seguro de que sea actual, dilo en vez de inventar límites, precios o números.
- Responde a lo que pregunta el estudiante, corto por defecto (máx. ~120 palabras) y con un ejemplo concreto cuando ayude. Prioriza el modelo mental: qué problema resuelve, en qué se diferencia de lo que se confunde y qué palabra del enunciado lo delata.
- Si el estudiante eligió una opción incorrecta, explica por qué esa opción no cumple el requisito del escenario.
- De vez en cuando, cierra con una pregunta breve para que el estudiante lo explique con sus palabras (así se aprende más que solo escuchando).`;

export const VOICE_ADDENDUM = `Estás en una conversación por VOZ: frases cortas y naturales, sin listas ni markdown, sin leer las citas en voz alta (no digas "[1]"). Deja que el estudiante interrumpa. Si necesitas un dato técnico que no está en el contexto, usa la herramienta search_aws_notes antes de responder.`;

export async function questionContext(userId: string, attemptId: number) {
  const a = await ownAttempt(userId, attemptId);
  if (!a) return null;
  const { questions, content, concepts } = getContent();
  const q = questions.get(a.questionId);
  if (!q) return null;
  const concept = concepts.get(q.conceptId);
  const card = content.get(q.conceptId)?.card.en;
  const picked = q.options.filter((o) => a.selected.includes(o.id)).map((o) => `${o.id}) ${o.text}`);
  const text = `PREGUNTA QUE EL ESTUDIANTE ACABA DE RESPONDER (${a.correct ? "acertó" : "falló"}):
${q.stem}
Opciones:
${q.options.map((o) => `${o.id}) ${o.text} [${o.correct ? "CORRECTA" : "incorrecta"}] — ${o.why}`).join("\n")}
El estudiante eligió: ${picked.join(", ") || "(nada)"}
Explicación verificada: ${q.explanation}
Concepto: ${concept?.title ?? q.conceptId}${card ? `\nFicha: ${card.tldr} Datos clave: ${card.keyFacts.join("; ")}. Trampas: ${card.gotchas.join("; ")}` : ""}`;
  return { text, question: q, conceptId: q.conceptId, conceptTitle: concept?.titleEs ?? concept?.title ?? "", correct: a.correct };
}
