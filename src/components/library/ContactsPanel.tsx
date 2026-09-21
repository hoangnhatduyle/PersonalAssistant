"use client";

import { useState } from "react";
import { useAddEmployerContact, useRemoveEmployerContact, useUpdateEmployerContact } from "@/hooks/useLibraryEmployerContacts";
import { usePeople } from "@/hooks/usePeople";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CONTACT_KINDS, type ContactKind } from "@/lib/library/constants";
import { CONTACT_KIND_LABEL } from "@/lib/library/labels";
import type { LibraryEmployerContact } from "@/lib/api/entity-types";

const PICKER_LIMIT = 100;

function ContactRow({ employerId, contact }: { employerId: string; contact: LibraryEmployerContact }) {
  const { showToast } = useToast();
  const updateContact = useUpdateEmployerContact(employerId);
  const removeContact = useRemoveEmployerContact(employerId);
  const [isEditing, setEditing] = useState(false);
  const [kind, setKind] = useState<ContactKind>(contact.kind);
  const [note, setNote] = useState(contact.note);

  const save = async () => {
    try {
      await updateContact.mutateAsync({ personId: contact.person.id, patch: { kind, note } });
      setEditing(false);
    } catch {
      showToast("Could not update the contact", "error");
    }
  };

  const remove = async () => {
    try {
      await removeContact.mutateAsync(contact.person.id);
    } catch {
      showToast("Could not remove the contact", "error");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-control border border-panel-border p-3">
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-sm font-semibold text-text-primary">{contact.person.name}</p>
          <Select aria-label={`Role of ${contact.person.name}`} value={kind} onChange={(event) => setKind(event.target.value as ContactKind)}>
            {CONTACT_KINDS.map((option) => (
              <option key={option} value={option}>
                {CONTACT_KIND_LABEL[option]}
              </option>
            ))}
          </Select>
          <Input aria-label={`Note about ${contact.person.name}`} placeholder="Note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} isLoading={updateContact.isPending}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-text-primary">{contact.person.name}</p>
            <Badge tone="accent">{CONTACT_KIND_LABEL[contact.kind]}</Badge>
          </div>
          {contact.note && <p className="text-sm text-text-secondary">{contact.note}</p>}
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${contact.person.name}`}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} isLoading={removeContact.isPending} aria-label={`Remove ${contact.person.name}`}>
              Remove
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

type Props = {
  employerId: string;
  contacts: LibraryEmployerContact[];
};

/** People linked to an employer (recruiter, referral, hiring manager…). Picked from the existing People list. */
export function ContactsPanel({ employerId, contacts }: Props) {
  const { showToast } = useToast();
  const { data: people, isLoading } = usePeople({ limit: PICKER_LIMIT });
  const addContact = useAddEmployerContact(employerId);
  const [personId, setPersonId] = useState("");
  const [kind, setKind] = useState<ContactKind>("recruiter");

  const linked = new Set(contacts.map((contact) => contact.person.id));
  const available = (people?.rows ?? []).filter((person) => !linked.has(person.id));

  const add = async () => {
    if (!personId) return;
    try {
      await addContact.mutateAsync({ person_id: personId, kind });
      setPersonId("");
    } catch {
      showToast("Could not add the contact", "error");
    }
  };

  return (
    <section aria-labelledby="employer-contacts-heading" className="flex flex-col gap-3">
      <h2 id="employer-contacts-heading" className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
        Contacts
      </h2>

      {contacts.length === 0 ? (
        <p className="text-sm text-text-secondary">No one linked yet. Link a recruiter, a referral or the hiring manager from your People.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <ContactRow key={contact.person.id} employerId={employerId} contact={contact} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[10rem] flex-1">
          <Select aria-label="Person to link" value={personId} disabled={isLoading || available.length === 0} onChange={(event) => setPersonId(event.target.value)}>
            <option value="">{isLoading ? "Loading…" : available.length === 0 ? "No one left to link" : "Choose a person"}</option>
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Contact type" value={kind} onChange={(event) => setKind(event.target.value as ContactKind)}>
            {CONTACT_KINDS.map((option) => (
              <option key={option} value={option}>
                {CONTACT_KIND_LABEL[option]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={add} disabled={!personId} isLoading={addContact.isPending}>
          Link person
        </Button>
      </div>
    </section>
  );
}
