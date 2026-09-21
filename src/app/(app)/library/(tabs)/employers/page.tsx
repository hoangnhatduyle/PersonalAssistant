import { Suspense } from "react";
import { EmployersBrowser } from "@/components/library/EmployersBrowser";

export default function LibraryEmployersPage() {
  // EmployersBrowser reads filters and the view from the URL (useSearchParams), which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <EmployersBrowser />
    </Suspense>
  );
}
