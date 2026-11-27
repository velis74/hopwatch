function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local date and time as a `datetime-local` input value, `YYYY-MM-DDTHH:MM`. */
export function toLocalInput(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A `datetime-local` value as ISO 8601 with the local offset (`2026-11-27T10:05:00+01:00`); null when invalid. */
export function toOffsetIso(localInput: string): string | null {
  const date = new Date(localInput);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/u.test(localInput) || Number.isNaN(date.getTime())) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${toLocalInput(date)}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
}
