import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { toFile } from "openai";
import { db, schema } from "@/db";
import { assertBudget, MODELS, openai, recordUsage } from "./client";

const VOICE = process.env.OPENAI_TTS_VOICE ?? "alloy";

/**
 * Text-to-speech with a permanent cache: each text is paid for once.
 * English content is read with an English instruction so exam wording sounds natural.
 */
export async function speak(text: string, lang: "en" | "es"): Promise<Buffer> {
  const key = createHash("sha256").update(`${MODELS.tts}|${VOICE}|${lang}|${text}`).digest("hex");
  const [hit] = await db.select().from(schema.audioCache).where(eq(schema.audioCache.key, key));
  if (hit) return hit.data;

  await assertBudget();
  const res = await openai().audio.speech.create({
    model: MODELS.tts,
    voice: VOICE,
    input: text,
    response_format: "mp3",
    instructions:
      lang === "en"
        ? "Read clearly at a moderate pace, like an exam proctor reading a question. Pronounce AWS service names correctly."
        : "Habla en español neutro latinoamericano, claro y a ritmo moderado. Pronuncia los nombres de servicios de AWS en inglés.",
  });
  const data = Buffer.from(await res.arrayBuffer());
  await db.insert(schema.audioCache).values({ key, mime: "audio/mpeg", data }).onConflictDoNothing();
  // ~150 words per minute
  await recordUsage({
    purpose: "tts",
    model: MODELS.tts,
    kind: "tts",
    audioSeconds: (text.split(/\s+/).length / 150) * 60,
  });
  return data;
}

export async function transcribe(audio: Blob, durationSec: number): Promise<string> {
  await assertBudget();
  // The extension must match the container: Chrome records webm, Safari/iOS records mp4.
  const type = (audio.type || "audio/webm").split(";")[0];
  const ext = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" }[type] ?? "webm";
  const file = await toFile(audio, `answer.${ext}`, { type });
  const res = await openai().audio.transcriptions.create({
    model: MODELS.stt,
    file,
    prompt:
      "AWS Solutions Architect exam answer. May mix Spanish and English. Terms: S3, EC2, VPC, NAT Gateway, Aurora, DynamoDB, SQS, SNS, EventBridge, Kinesis, CloudFront, Route 53, EFS, FSx, EBS, KMS, IAM.",
  });
  await recordUsage({ purpose: "stt", model: MODELS.stt, kind: "stt", audioSeconds: durationSec });
  return res.text;
}
