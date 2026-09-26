import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { arcadeAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn appearance={arcadeAppearance} />
    </AuthShell>
  );
}
