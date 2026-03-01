export function getRequiredString(form: FormData, name: string): string {
  const value = form.get(name);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value.trim();
}

export function getRequiredFile(form: FormData, name: string): File {
  const value = form.get(name);

  if (!(value instanceof File)) {
    throw new Error(`Missing required file: ${name}`);
  }

  return value;
}
