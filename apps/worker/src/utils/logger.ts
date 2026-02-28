export function logError(message: string, context?: unknown): void {
  if (context !== undefined) {
    console.error(message, context);
    return;
  }

  console.error(message);
}
