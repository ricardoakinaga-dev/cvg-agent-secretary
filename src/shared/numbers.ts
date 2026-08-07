export function clampInteger(
  value: number | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
