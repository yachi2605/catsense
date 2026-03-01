export const STATIC_MACHINE_SERIALS = [
  "ZAR00512",
  "DKS01847",
  "FMG02291",
] as const;

export const STATIC_MACHINE_SERIAL_SET = new Set<string>(STATIC_MACHINE_SERIALS);

export function normalizeMachineSerial(value: string): string {
  return value.trim().toUpperCase();
}
