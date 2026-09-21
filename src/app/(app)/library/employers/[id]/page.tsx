import { EmployerDetail } from "@/components/library/EmployerDetail";

export default async function LibraryEmployerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployerDetail id={id} />;
}
