export function parseStoredValue(value, fallback = null) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}
