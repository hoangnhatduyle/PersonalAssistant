"use client";

import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { Appointment } from "@/lib/appointments/types";

const STORAGE_KEY = "personal-assistant.appointments.v1";

export function useAppointments() {
  const [appointments, setAppointments] = useLocalStorage<Appointment[]>(STORAGE_KEY, []);

  const sorted = [...appointments].sort((a, b) => a.date.localeCompare(b.date));

  const addAppointment = (values: Omit<Appointment, "id" | "createdAt">) => {
    const appointment: Appointment = { ...values, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setAppointments([...appointments, appointment]);
  };

  const updateAppointment = (id: string, values: Omit<Appointment, "id" | "createdAt">) => {
    setAppointments(appointments.map((item) => (item.id === id ? { ...item, ...values } : item)));
  };

  const deleteAppointment = (id: string) => {
    setAppointments(appointments.filter((item) => item.id !== id));
  };

  return { appointments: sorted, addAppointment, updateAppointment, deleteAppointment };
}
