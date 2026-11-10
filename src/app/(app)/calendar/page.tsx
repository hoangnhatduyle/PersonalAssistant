import { WeekGridContainer } from "@/components/calendar/WeekGridContainer";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { date } = await searchParams;
  // `?date=YYYY-MM-DD` (from search results) opens the week containing that day.
  const initialDate = typeof date === "string" && ISO_DATE.test(date) ? date : undefined;
  return <WeekGridContainer initialDate={initialDate} />;
}
