"use client";

import { useState } from "react";
import { useAppointments } from "@/hooks/useAppointments";
import { AppointmentForm, type AppointmentFormValues } from "@/components/calendar/AppointmentForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { Appointment } from "@/lib/appointments/types";

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function AppointmentsTimeline() {
  const { appointments, addAppointment, updateAppointment, deleteAppointment } = useAppointments();
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editingAppointment = appointments.find((item) => item.id === editingId);
  const deletingAppointment = appointments.find((item) => item.id === deletingId);

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (appointment: Appointment) => {
    setEditingId(appointment.id);
    setFormOpen(true);
  };

  const handleSubmit = (values: AppointmentFormValues) => {
    if (editingId) {
      updateAppointment(editingId, values);
    } else {
      addAppointment(values);
    }
    setFormOpen(false);
    setEditingId(null);
  };

  return (
    <GlassPanel className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Appointments &amp; Events Timeline</p>
        <Button size="sm" onClick={openCreate}>
          + Add Appointment
        </Button>
      </div>

      {appointments.length === 0 ? (
        <EmptyState title="No appointments yet" description='Click "+ Add Appointment" to create one.' />
      ) : (
        <ul className="flex flex-col divide-y divide-panel-border">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm text-text-primary">{appointment.title}</p>
                  <Badge tone="neutral">{appointment.category}</Badge>
                </div>
                <span className="font-mono text-xs text-text-secondary">
                  {formatDate(appointment.date)}
                  {appointment.time ? ` · ${appointment.time}` : ""}
                  {appointment.location ? ` · ${appointment.location}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
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

      <Dialog
        open={isFormOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        title={editingAppointment ? "Edit Appointment" : "Add Appointment"}
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
          if (deletingId) deleteAppointment(deletingId);
          setDeletingId(null);
        }}
        title="Delete this appointment?"
        description={deletingAppointment ? `"${deletingAppointment.title}" will be removed from this browser.` : ""}
        confirmLabel="Delete"
      />
    </GlassPanel>
  );
}
