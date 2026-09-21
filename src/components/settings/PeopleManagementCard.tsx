"use client";

import { useState } from "react";
import { usePeople, useCreatePerson, useUpdatePerson } from "@/hooks/usePeople";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { PersonForm } from "@/components/people/PersonForm";
import { DeletePersonButton } from "@/components/people/DeletePersonButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import type { PersonRow } from "@/lib/api/entity-types";
import type { PersonPayload } from "@/lib/api/schemas";

// Matches the indigo accent the owner's Courses use until a color is chosen.
const DEFAULT_OWNER_COLOR = "#6366f1";

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
      ) : (
        <ul className="flex flex-col gap-2">
          <OwnerRow />
          {people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </ul>
      )}
      {!isLoading && people.length === 0 && <p className="text-xs text-text-secondary">No one else tracked yet.</p>}

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

/**
 * The signed-in account owner's own row — unlike a tracked Person there's no
 * name/relationship/delete, just the color their Courses use on Calendar and
 * Courses (user_preferences.owner_color). "Reset" clears it back to the
 * built-in colors.
 */
function OwnerRow() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();
  const [isEditOpen, setEditOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(DEFAULT_OWNER_COLOR);

  const savedColor = settings?.owner_color ?? null;

  const save = async (color: string | null, message: string) => {
    try {
      await updateSettings.mutateAsync({ owner_color: color });
      showToast(message, "success");
      setEditOpen(false);
    } catch {
      showToast("Could not save that color", "error");
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-panel-border px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-text-primary">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full border border-white/20"
          style={{ backgroundColor: savedColor ?? DEFAULT_OWNER_COLOR }}
        />
        Mine
        <span className="text-xs text-text-secondary">{savedColor ? "(you)" : "(you · default color)"}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={!settings}
        onClick={() => {
          setDraftColor(savedColor ?? DEFAULT_OWNER_COLOR);
          setEditOpen(true);
        }}
      >
        Edit
      </Button>

      <Dialog open={isEditOpen} onClose={() => setEditOpen(false)} title="Your color">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Used for your own Courses on the Calendar and Courses pages, alongside the colors of the people you track.
          </p>
          <FormField label="Color" htmlFor="owner-color">
            <input
              id="owner-color"
              type="color"
              value={draftColor}
              onChange={(event) => setDraftColor(event.target.value)}
              className="h-10 w-16 cursor-pointer rounded-control border border-panel-border bg-bg-void-elevated p-1"
            />
          </FormField>
          <div className="flex justify-between gap-2">
            <Button
              variant="secondary"
              disabled={savedColor === null || updateSettings.isPending}
              onClick={() => save(null, "Color reset to default")}
            >
              Reset to default
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={updateSettings.isPending}>
                Cancel
              </Button>
              <Button isLoading={updateSettings.isPending} onClick={() => save(draftColor, "Color saved")}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </li>
  );
}
