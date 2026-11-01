/** Days and times as the App says them, in the reader's own time zone. */

const sameDay = (a: Date, b: Date): boolean =>
  a.toDateString() === b.toDateString();

const yesterdayOf = (today: Date): Date => {
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return yesterday;
};

/** "Today", "Yesterday", "3 November", or "3 November 2025" in another year. */
export const dayName = (iso: string, today = new Date()): string => {
  const date = new Date(iso);
  if (sameDay(date, today)) {
    return "Today";
  }
  if (sameDay(date, yesterdayOf(today))) {
    return "Yesterday";
  }
  return date.getFullYear() === today.getFullYear()
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
};

/** "Today, 14:06", "Yesterday, 09:12", "3 November, 18:40". */
export const madeAt = (iso: string, today = new Date()): string => {
  const time = new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dayName(iso, today)}, ${time}`;
};
