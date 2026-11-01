// Days are local calendar days because that is how hours get reported, not UTC days.
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export function localMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Accepts the forms people and agents actually type: today, yesterday, or YYYY-MM-DD.
export function parseDay(value: string, now: number): string | undefined {
  if (value === "today") return dayKey(now);
  if (value === "yesterday") return dayKey(localMidnight(dayKey(now)) - 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const ms = localMidnight(value);
  return Number.isNaN(ms) || dayKey(ms) !== value ? undefined : value;
}

// HH:MM is read on the given local day; a full ISO timestamp is taken as-is.
export function parseClock(value: string, day: string): number | undefined {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (hm) {
    const [h, m] = [Number(hm[1]), Number(hm[2])];
    if (h > 23 || m > 59) return undefined;
    const [y, mo, d] = day.split("-").map(Number);
    return new Date(y, mo - 1, d, h, m).getTime();
  }
  const ms = Date.parse(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(ms) ? ms : undefined;
}

// Weeks start on Monday, which is how hour reporting weeks usually run.
export function weekStart(now: number): string {
  const d = new Date(localMidnight(dayKey(now)));
  const offset = (d.getDay() + 6) % 7;
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime());
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days).getTime());
}
