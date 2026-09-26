/** Live check of every runtime AI feature (uses TEST_DATABASE_URL for usage rows). */
import { getContent } from "../src/lib/content/load";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

async function main() {
  const tutor = await import("../src/lib/ai/tutor");
  const voice = await import("../src/lib/ai/voice");
  const { monthSpend } = await import("../src/lib/ai/client");
  const { content } = getContent();
  const cc = content.get("security-groups")!;
  const q = cc.questions[0];
  const wrong = q.options.find((o) => !o.correct)!.id;
  for (const level of [1, 2, 3] as const) {
    console.log(`\nPISTA ${level}:`, await tutor.hint({ question: q, content: cc, selected: [wrong], level }));
  }
  console.log("\nEXPLICACIÓN:", await tutor.gradeExplanation({ question: q, content: cc, explanation: "porque el security group de la app como origen sigue a las instancias aunque cambien las IP; NACL es por subred y las IP cambian" }));
  console.log("\nERROR:", await tutor.diagnoseError({ question: q, selected: [wrong], confidence: 2 }));
  const r = cc.recall[0];
  const audio = await voice.speak("Add an inbound rule on the database security group for port 3306, with the application security group as the source, because it follows the instances even when their IPs change.", "en");
  console.log("\nTTS bytes:", audio.length);
  const text = await voice.transcribe(new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), 10);
  console.log("STT:", text);
  console.log("RECALL:", await tutor.gradeRecall({ prompt: r, content: cc, transcript: text }));
  console.log("\ngasto registrado (test db): $", (await monthSpend()).toFixed(4));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
