import { TaskDetailContainer } from "@/components/tasks/TaskDetailContainer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <TaskDetailContainer taskId={id} />;
}
