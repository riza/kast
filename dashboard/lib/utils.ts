import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatInTZ(
  date: Date,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" }
): string {
  try {
    return date.toLocaleTimeString([], { ...opts, timeZone: timezone })
  } catch {
    return date.toLocaleTimeString([], opts)
  }
}
