"use client";

import { useState } from "react";
import { useAppointments, useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from "@/hooks/useAppointments";
import { useCourses } from "@/hooks/useCourses";
import { AppointmentForm } from "@/components/calendar/AppointmentForm";
import { EventTransitionButtons } from "@/components/calendar/EventTransitionButtons";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { findConflictingAppointmentIds } from "@/lib/appointments/conflicts";
import { findCourseConflictingAppointmentIds } from "@/lib/appointments/course-conflicts";
import { formatAppointmentDate, isPastAppointment, matchesSearch, paginate } from "@/lib/appointments/list-view";
import { formatBlocksSummary } from "@/lib/calendar/recurrence";
import { EVENT_STATUS_TONE } from "@/lib/status-colors";
import type { AppointmentRow } from "@/lib/api/entity-types";
import type { AppointmentPayload } from "@/lib/api/schemas";

const PAGE_SIZE = 10;

export function AppointmentsTimeline() {
  const { data, isLoading } = useAppointments({ limit: 100 });
  // Deadline Sessions (category "Session") are managed through their own
  // dedicated flow (SessionsSection/SessionForm on a Deadline's page, with
  // a free-text time field) — excluded here so this generic form's required
  // structured time + duration (needed for conflict detection) never applies
  // to a Session row edited through this list.
  const appointments = (data?.rows ?? []).filter((row) => row.category !== "Session");
  const { data: coursesData } = useCourses({ limit: 100 });
  const createMutation = useCreateAppointment();

  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(1);

  const editingAppointment = appointments.find((item) => item.id === editingId);
  const deletingAppointment = appointments.find((item) => item.id === deletingId);
  const conflictingIds = findConflictingAppointmentIds(appointments);
  const courseConflictingIds = findCourseConflictingAppointmentIds(appointments, coursesData?.rows ?? []);

  // Conflicts above are computed over the full set on purpose — a hidden past
  // or non-matching appointment can still be what a visible one conflicts with.
  const now = new Date();
  const timeVisible = showPast ? appointments : appointments.filter((item) => !isPastAppointment(item, now));
  const filtered = timeVisible.filter((item) => matchesSearch(item, search));
  const hiddenPastCount = appointments.length - timeVisible.length;
  const currentPage = paginate(filtered, page, PAGE_SIZE);
  const isFiltering = search.trim() !== "";

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (appointment: AppointmentRow) => {
    setEditingId(appointment.id);
    setFormOpen(true);
  };

  const handleSubmit = (values: AppointmentPayload) => {
    if (editingId) {
      updateMutation.mutate(values, {
        onSuccess: () => {
          setFormOpen(false);
          setEditingId(null);
        },
      });
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          setFormOpen(false);
          setEditingId(null);
        },
      });
    }
  };

  const updateMutation = useUpdateAppointment(editingId ?? "");
  const deleteMutation = useDeleteAppointment(deletingId ?? "");

  return (
    <GlassPanel id="appointments-timeline" className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Appointments &amp; Events Timeline</p>
        <Button size="sm" onClick={openCreate}>
          + Add Appointment
        </Button>
      </div>

      {!isLoading && appointments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            type="search"
            aria-label="Search appointments"
            placeholder="Search title, category, location, date…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
          <Switch
            label="Show past"
            checked={showPast}
            onCheckedChange={(checked) => {
              setShowPast(checked);
              setPage(1);
            }}
          />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : appointments.length === 0 ? (
        <EmptyState title="No appointments yet" description='Click "+ Add Appointment" to create one.' />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={isFiltering ? "No matching appointments" : "No upcoming appointments"}
          description={
            isFiltering
              ? showPast || hiddenPastCount === 0
                ? "Try a different keyword."
                : `Try a different keyword, or turn on "Show past" (${hiddenPastCount} hidden).`
              : `${hiddenPastCount} past ${hiddenPastCount === 1 ? "appointment is" : "appointments are"} hidden. Turn on "Show past" to see ${hiddenPastCount === 1 ? "it" : "them"}.`
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-panel-border">
          {currentPage.items.map((appointment) => (
            <li
              key={appointment.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm text-text-primary">{appointment.title}</p>
                  <Badge tone="neutral">{appointment.category}</Badge>
                  {appointment.meeting_blocks.length > 0 && <Badge tone="purple">Recurring</Badge>}
                  {appointment.event_status && (
                    <Badge tone={EVENT_STATUS_TONE[appointment.event_status]}>{appointment.event_status}</Badge>
                  )}
                  {conflictingIds.has(appointment.id) && <Badge tone="urgent">Conflict</Badge>}
                  {courseConflictingIds.has(appointment.id) && <Badge tone="purple">Course Conflict</Badge>}
                </div>
                <span className="font-mono text-xs text-text-secondary">
                  {appointment.meeting_blocks.length > 0
                    ? formatBlocksSummary(appointment.meeting_blocks)
                    : `${formatAppointmentDate(appointment.date)}${appointment.time ? ` · ${appointment.time}` : ""}${
                        appointment.duration_minutes ? ` (${appointment.duration_minutes}m)` : ""
                      }`}
                  {appointment.location ? ` · ${appointment.location}` : ""}
                </span>
                <EventTransitionButtons appointment={appointment} suggestMissed={courseConflictingIds.has(appointment.id)} />
              </div>
              <div className="flex shrink-0 gap-1 self-end sm:self-start">
                <Button variant="ghost" size="sm" onClick={() => openEdit(appointment)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingId(appointment.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={currentPage.page}
        totalPages={currentPage.totalPages}
        total={currentPage.total}
        rangeStart={currentPage.rangeStart}
        rangeEnd={currentPage.rangeEnd}
        onPageChange={setPage}
        itemLabel="appointments"
      />

      <Dialog
        open={isFormOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        title={editingAppointment ? "Edit Appointment" : "Add Appointment"}
        size="xl"
      >
        <AppointmentForm
          appointment={editingAppointment}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) {
            deleteMutation.mutate(undefined, {
              onSuccess: () => setDeletingId(null),
            });
          }
        }}
        title="Delete this appointment?"
        description={deletingAppointment ? `"${deletingAppointment.title}" will be permanently removed.` : ""}
        confirmLabel="Delete"
      />
    </GlassPanel>
  );
}
