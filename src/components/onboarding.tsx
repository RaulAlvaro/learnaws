import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { FeedbackButton, PrivacyNotice } from "./onboarding-client";

/** Privacy notice on first visit + the feedback button, for signed-in users. */
export async function Onboarding() {
  const bypass = process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS === "1";
  if (!bypass && !(await auth()).userId) return null;
  const userId = await requireUser();
  const [u] = await db
    .select({ ack: schema.users.privacyAckAt, key: schema.users.openaiKeyLast4 })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return (
    <>
      {!u?.ack && <PrivacyNotice />}
      <FeedbackButton />
    </>
  );
}
