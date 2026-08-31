import { CourseDetailContainer } from "@/components/courses/CourseDetailContainer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CourseDetailContainer courseId={id} />;
}
