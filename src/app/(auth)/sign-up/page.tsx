import Link from "next/link";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <SignUpForm />
      <p className="text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent-indigo hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
