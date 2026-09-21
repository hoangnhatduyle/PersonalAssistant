import { Suspense } from "react";
import { PostsBrowser } from "@/components/library/PostsBrowser";

export default function LibraryPostsPage() {
  // PostsBrowser reads filters from the URL (useSearchParams), which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <PostsBrowser />
    </Suspense>
  );
}
