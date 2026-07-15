export function formatDurationNano(durationNano: number): string {
  if (durationNano >= 1_000_000_000) {
    return `${(durationNano / 1_000_000_000).toFixed(durationNano >= 10_000_000_000 ? 1 : 2)}s`
  }
  if (durationNano >= 1_000_000) {
    return `${(durationNano / 1_000_000).toFixed(durationNano >= 100_000_000 ? 0 : 1)}ms`
  }
  if (durationNano >= 1_000) {
    return `${(durationNano / 1_000).toFixed(durationNano >= 100_000 ? 0 : 1)}us`
  }
  return `${durationNano}ns`
}

export function formatTraceStart(unixNanoTimestamp: number): string {
  return new Date(Math.floor(unixNanoTimestamp / 1_000_000)).toLocaleTimeString()
}

export function formatTraceStartFull(unixNanoTimestamp: number): string {
  return new Date(Math.floor(unixNanoTimestamp / 1_000_000)).toLocaleString()
}