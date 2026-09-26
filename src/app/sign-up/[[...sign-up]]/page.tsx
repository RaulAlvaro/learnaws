import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex justify-center pt-8">
      <SignUp />
    </div>
  );
}
