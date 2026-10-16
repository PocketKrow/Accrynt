import { ZodError } from 'zod'
export function errorMessage(reason: unknown, fallback = 'Unable to save. Review the fields and try again.') {
  if (reason instanceof ZodError) {
    const issue = reason.issues[0]
    return issue ? `Check ${issue.path.join(' · ') || 'the record'}: ${issue.message}` : fallback
  }
  return reason instanceof Error ? reason.message : fallback
}
