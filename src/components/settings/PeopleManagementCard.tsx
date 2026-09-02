"use client";

import { useState } from "react";
import { usePeople, useCreatePerson, useUpdatePerson } from "@/hooks/usePeople";
import { PersonForm } from "@/components/people/PersonForm";
import { DeletePersonButton } from "@/components/people/DeletePersonButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { PersonRow } from "@/lib/api/entity-types";
import type { PersonPayload } from "@/lib/api/schemas";

/**
 * People the account owner tracks alongside themself (e.g. a sibling or
 * partner whose Courses/Deadlines/Tasks they maintain for coordination —
 * see supabase/migrations/0013_people.sql). Not a second app user: no login,
 * no sharing/invite — this is purely a label + color the owner's own rows
 * can point at.
 */
export function PeopleManagementCard() {
  const { data, isLoading } = usePeople();
  const createPerson = useCreatePerson();
  const { showToast } = useToast();
  const [isCreateOpen, setCreateOpen] = useState(false);

  const people = data?.rows ?? [];

  const handleCreate = async (values: PersonPayload) => {
    try {
      await createPerson.mutateAsync(values);
      showToast("Person added", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not add person", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-medium text-text-primary">People</p>
          <p className="text-xs text-text-secondary">
            Track a family member or partner&apos;s Courses, Deadlines, and Tasks alongside your own.
          </p>
        </div>
        <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setCreateOpen(true)}>
          Add person
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : people.length === 0 ? (
        <p className="text-xs text-text-secondary">No one tracked yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </ul>
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="Add person">
        <PersonForm existingCount={people.length} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Add" />
      </Dialog>
    </GlassPanel>
  );
}

function PersonRow({ person }: { person: PersonRow }) {
  const [isEditOpen, setEditOpen] = useState(false);
  const updatePerson = useUpdatePerson(person.id);
  const { showToast } = useToast();

  const handleUpdate = async (values: PersonPayload) => {
    try {
      await updatePerson.mutateAsync(values);
      showToast("Person updated", "success");
      setEditOpen(false);
    } catch {
      showToast("Could not update person", "error");
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-panel-border px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-text-primary">
        <span aria-hidden="true" className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: person.color }} />
        {person.name}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <DeletePersonButton personId={person.id} personName={person.name} />
      </div>

      <Dialog open={isEditOpen} onClose={() => setEditOpen(false)} title={`Edit ${person.name}`}>
        <PersonForm person={person} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)} submitLabel="Save changes" />
      </Dialog>
    </li>
  );
}
