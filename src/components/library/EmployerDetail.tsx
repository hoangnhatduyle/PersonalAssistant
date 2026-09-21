"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationForm } from "@/components/library/ApplicationForm";
import { ApplicationPanel } from "@/components/library/ApplicationPanel";
import { ContactsPanel } from "@/components/library/ContactsPanel";
import { EmployerForm } from "@/components/library/EmployerForm";
import { LinkedPostsPanel } from "@/components/library/LinkedPostsPanel";
import { PipelineFunnel } from "@/components/library/PipelineFunnel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCreateLibraryApplication } from "@/hooks/useLibraryApplications";
import { useDeleteLibraryEmployer, useLibraryEmployer, useUpdateLibraryEmployer } from "@/hooks/useLibraryEmployers";
import { ApiError } from "@/lib/http/client";
import { funnelCounts } from "@/lib/library/application-status";
import { safeExternalHref } from "@/lib/library/url";
import type { LibraryApplicationPayload, LibraryEmployerPayload } from "@/lib/api/library-schemas";
import type { LibraryEmployerDetail } from "@/lib/api/entity-types";

type Props = {
  id: string;
};

export function EmployerDetail({ id }: Props) {
  const router = useRouter();
  const { data: employer, isLoading, error } = useLibraryEmployer(id);

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/library/employers"));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !employer) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        title={notFound ? "Employer not found" : "Could not load this employer"}
        description={notFound ? "It may have been deleted." : "Check your connection and try again."}
        action={
          <Button variant="secondary" onClick={goBack}>
            Back to Library
          </Button>
        }
      />
    );
  }

  return <EmployerDetailBody employer={employer} onBack={goBack} />;
}

function ExternalLink({ url, label }: { url: string | null; label: string }) {
  const href = safeExternalHref(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-accent-indigo underline underline-offset-4 hover:text-text-primary">
      {label} ↗
    </a>
  );
}

function EmployerDetailBody({ employer, onBack }: { employer: LibraryEmployerDetail; onBack: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isEditOpen, setEditOpen] = useState(false);
  const [isAddRoleOpen, setAddRoleOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const updateEmployer = useUpdateLibraryEmployer(employer.id);
  const deleteEmployer = useDeleteLibraryEmployer(employer.id);
  const createApplication = useCreateLibraryApplication();

  const handleEdit = async (values: LibraryEmployerPayload) => {
    await updateEmployer.mutateAsync(values);
    showToast("Employer updated", "success");
    setEditOpen(false);
  };

  const handleArchive = async () => {
    try {
      await updateEmployer.mutateAsync({ archived: !employer.archived_at });
      showToast(employer.archived_at ? "Employer restored" : "Employer archived", "success");
    } catch {
      showToast("Could not update the employer", "error");
    }
  };

  const handleAddRole = async (values: LibraryApplicationPayload) => {
    await createApplication.mutateAsync(values);
    showToast("Role added", "success");
    setAddRoleOpen(false);
  };

  const handleDelete = async () => {
    try {
      await deleteEmployer.mutateAsync();
      showToast("Employer deleted", "success");
      router.push("/library/employers");
    } catch {
      showToast("Could not delete the employer", "error");
    }
  };

  const added = new Date(employer.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <article className="library-atmosphere flex flex-col gap-6 rounded-panel">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Library
        </Button>
      </div>

      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
          Employer · added {added}
          {employer.archived_at && <span className="text-status-warn"> · Archived</span>}
        </p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-text-primary">{employer.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <ExternalLink url={employer.website} label="Website" />
          <ExternalLink url={employer.careers_url} label="Careers page" />
        </div>
      </header>

      <PipelineFunnel counts={funnelCounts(employer.applications)} />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAddRoleOpen(true)}>Add role</Button>
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={handleArchive} disabled={updateEmployer.isPending}>
          {employer.archived_at ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      </div>

      {employer.notes && (
        <section aria-labelledby="employer-notes-heading" className="max-w-2xl">
          <h2 id="employer-notes-heading" className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-eyebrow">
            Notes
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{employer.notes}</p>
        </section>
      )}

      <section aria-labelledby="employer-roles-heading" className="flex flex-col gap-3">
        <h2 id="employer-roles-heading" className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
          Roles
        </h2>
        {employer.applications.length === 0 ? (
          <EmptyState title="No roles tracked" description="Add the roles you're eyeing or have applied for." />
        ) : (
          employer.applications.map((application) => <ApplicationPanel key={application.id} application={application} />)
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <ContactsPanel employerId={employer.id} contacts={employer.contacts} />
        <LinkedPostsPanel employerId={employer.id} posts={employer.posts} />
      </div>

      <Dialog open={isEditOpen} onClose={() => setEditOpen(false)} title="Edit employer" size="lg">
        <EmployerForm employer={employer} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} submitLabel="Save changes" />
      </Dialog>

      <Dialog open={isAddRoleOpen} onClose={() => setAddRoleOpen(false)} title={`Add a role at ${employer.name}`} size="lg">
        <ApplicationForm employerId={employer.id} onSubmit={handleAddRole} onCancel={() => setAddRoleOpen(false)} submitLabel="Add role" />
      </Dialog>

      <ConfirmDialog
        open={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${employer.name}?`}
        description={`Its ${employer.applications.length} tracked ${employer.applications.length === 1 ? "role" : "roles"}, interview logs and contact links will go with it. Your saved posts and People are untouched.`}
        confirmLabel="Delete employer"
        isConfirming={deleteEmployer.isPending}
      />
    </article>
  );
}
