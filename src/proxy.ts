import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/health", "/sw.js", "/manifest.webmanifest", "/icons/(.*)"]);

/** Personal app: every route requires the one allowed Clerk user. */
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  // Local UI testing only (never honoured in production builds).
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS === "1") return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  const allowed = process.env.ALLOWED_USER_ID;
  if (allowed && userId !== allowed) {
    return new NextResponse("Esta app es personal.", { status: 403 });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3)).*)",
    "/(api|trpc)(.*)",
  ],
};
