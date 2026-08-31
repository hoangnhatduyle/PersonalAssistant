import { DeadlineDetailContainer } from "@/components/deadlines/DeadlineDetailContainer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeadlineDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <DeadlineDetailContainer deadlineId={id} />;
}
