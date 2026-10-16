export function checkEdit(row: { updatedAt: string } | undefined, expectedUpdatedAt?: string): asserts row is { updatedAt: string } {
  if (!row) throw new Error('This record no longer exists. Close the editor and refresh your view.')
  if (expectedUpdatedAt !== undefined && row.updatedAt !== expectedUpdatedAt) {
    throw new Error('This record changed while you were editing it. Close and reopen the editor before saving.')
  }
}

// A per-record monotonic timestamp also detects edits made within the same millisecond.
export function nextTimestamp(previous: string) {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}
