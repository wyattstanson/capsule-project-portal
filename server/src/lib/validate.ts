import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import { badRequest } from './errors.js';

// Parse unknown input against a schema, converting Zod errors into a 400.
// Uses z.infer so schema defaults surface as required (non-optional) fields.
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): ZodInfer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('validation_error', 'Invalid request', result.error.flatten());
  }
  return result.data;
}
