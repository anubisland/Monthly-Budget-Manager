let counter = 0;

/**
 * Generate a unique entry id.
 *
 * Pass a `seed` to make it deterministic in tests. Without one it combines a
 * monotonic counter with a base-36 timestamp, which is collision-free within a
 * process and readable in stored JSON.
 */
export function makeId(seed?: () => number): string {
  if (seed) return String(seed());
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
