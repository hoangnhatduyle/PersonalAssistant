import Link from "next/link";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <SignInForm />
      <p className="text-center text-sm text-text-secondary">
        No account?{" "}
        <Link href="/sign-up" className="text-accent-indigo hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
