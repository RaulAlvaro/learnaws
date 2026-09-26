import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";
import { arcadeAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={arcadeAppearance} />
    </AuthShell>
  );
}
