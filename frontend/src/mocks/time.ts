/** Mock data timestamps are relative to "now" so the demo looks live no
 * matter when it's opened, instead of a frozen date going stale. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60)
}
