import { PostDetail } from "@/components/library/PostDetail";

export default async function LibraryPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail id={id} />;
}
