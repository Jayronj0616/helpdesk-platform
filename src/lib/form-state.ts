// Shape returned by server actions used with useActionState. `values` refills non-secret fields,
// because React clears a form after every submit. Never put a password in it.
export interface FormState {
  error?: string;
  message?: string;
  values?: Record<string, string>;
}
