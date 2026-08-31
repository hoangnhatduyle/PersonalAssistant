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

export function SignInForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthCredentials>({ resolver: zodResolver(authCredentialsSchema) });

  const onSubmit = async (values: AuthCredentials) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setFormError(error.message);
      return;
    }
    // Re-reads the now-authenticated session in the (app) layout's server check.
    router.refresh();
    router.push("/");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" invalid={Boolean(errors.email)} {...register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
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
        Sign in
      </Button>
    </form>
  );
}
