import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center pt-8">
      <SignIn />
    </div>
  );
}
