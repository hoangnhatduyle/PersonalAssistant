import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { SettingsPageContainer } from "@/components/settings/SettingsPageContainer";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/sign-in");

  return <SettingsPageContainer userId={user.id} userEmail={user.email ?? ""} />;
}
