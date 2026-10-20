import type { z } from 'zod'

export type FieldErrors<TField extends string> = Partial<Record<TField, { message: string }[]>>

export type FormValidation<TField extends string, TRequest> =
  | { request: TRequest; errors: null }
  | { request: null; errors: { fields: FieldErrors<TField>; form: string | null } }

/**
 * Runs form input through the shared request contract, so the client accepts exactly what the
 * server does. An issue on a field the form shows lands on that field. Any other issue goes to
 * the form level, so the form never looks valid while it silently refuses to submit.
 */
export function validateWithSchema<TField extends string, TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
  fieldNames: ReadonlyArray<TField>,
): FormValidation<TField, z.output<TSchema>> {
  const result = schema.safeParse(input)
  if (result.success) return { request: result.data, errors: null }

  const fields: FieldErrors<TField> = {}
  const formMessages: string[] = []
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && fieldNames.includes(field as TField)) {
      const name = field as TField
      fields[name] = [...(fields[name] ?? []), { message: issue.message }]
    } else {
      formMessages.push(issue.message)
    }
  }
  return {
    request: null,
    errors: { fields, form: formMessages.length ? formMessages.join('; ') : null },
  }
}
