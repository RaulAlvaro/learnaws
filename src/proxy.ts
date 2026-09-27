import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/health", "/sw.js", "/manifest.webmanifest", "/icons/(.*)", "/opengraph-image(.*)", "/twitter-image(.*)"]);

/** Open registration: every route requires a signed-in Clerk user (per-user data is scoped server-side). */
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  // Local UI testing only (never honoured in production builds).
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS === "1") return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3)).*)",
    "/(api|trpc)(.*)",
  ],
};
