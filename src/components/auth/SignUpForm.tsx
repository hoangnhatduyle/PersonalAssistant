"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { authCredentialsSchema, type AuthCredentials } from "@/components/auth/auth-schema";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthCredentials>({ resolver: zodResolver(authCredentialsSchema) });

  const onSubmit = async (values: AuthCredentials) => {
    setFormError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp(values);
    if (error) {
      setFormError(error.message);
      return;
    }
    if (data.session) {
      router.refresh();
      router.push("/");
      return;
    }
    // Email-confirmation is required by this Supabase project's auth
    // settings — no session yet, so proxy.ts would just bounce a redirect
    // to "/" straight back to sign-in.
    setNeedsConfirmation(true);
  };

  if (needsConfirmation) {
    return (
      <p className="text-sm text-text-secondary">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={Boolean(errors.email)} {...register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </FormField>
      {formError && (
        <p role="alert" className="text-sm text-status-urgent">
          {formError}
        </p>
      )}
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Sign up
      </Button>
    </form>
  );
}
