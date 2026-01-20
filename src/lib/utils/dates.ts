import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isBefore,
  isAfter,
  isToday,
  parseISO,
  startOfDay
} from 'date-fns';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export function getDaysInMonth(date: Date): Date[] {
  return eachDayOfInterval({
    start: startOfMonth(date),
    end: endOfMonth(date)
  });
}

export function isPastDay(date: Date): boolean {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  return isBefore(checkDate, today);
}

export function isTodayDate(date: Date): boolean {
  return isToday(date);
}

export function isDateInRange(
  date: Date | string,
  startDate: string,
  endDate: string | null
): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const start = parseISO(startDate);
  const dDay = startOfDay(d);
  const startDay = startOfDay(start);

  if (isBefore(dDay, startDay)) return false;

  if (endDate) {
    const end = parseISO(endDate);
    const endDay = startOfDay(end);
    if (isAfter(dDay, endDay)) return false;
  }

  return true;
}

export function getWeekdayNames(): string[] {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

export function getFirstDayOfMonthWeekday(date: Date): number {
  return startOfMonth(date).getDay();
}
