"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { unsubscribeThisDevice } from "@/lib/push/client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    // Needs the session, so it must run before signOut(); best-effort and time-boxed.
    await unsubscribeThisDevice();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} isLoading={isSigningOut}>
      Sign out
    </Button>
  );
}
