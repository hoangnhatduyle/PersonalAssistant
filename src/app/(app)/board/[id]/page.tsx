import { BoardCardDetailContainer } from "@/components/board/BoardCardDetailContainer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardCardDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <BoardCardDetailContainer taskId={id} />;
}
