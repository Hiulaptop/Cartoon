import type { Example, SearchStep, SearchTrace } from "./contracts";

export const SMALL_VALUES = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 104, 120];
export function traceBinarySearch(length: number, valueAt: (index: number) => number, target: number): SearchTrace {
  if (!Number.isSafeInteger(length) || length < 1 || !Number.isFinite(target)) throw new Error("Invalid search inputs");
  let lo = 0;
  let hi = length - 1;
  let foundIndex: number | null = null;
  const steps: SearchStep[] = [];
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const value = valueAt(mid);
    if (!Number.isFinite(value)) throw new Error("Nonfinite search value");
    const relation = value < target ? "less" : value > target ? "greater" : "equal";
    const nextLo = relation === "less" ? mid + 1 : relation === "equal" ? mid : lo;
    const nextHi = relation === "greater" ? mid - 1 : relation === "equal" ? mid : hi;
    steps.push({ ordinal: steps.length + 1, lo, hi, mid, value, relation, remainingBefore: hi - lo + 1, nextLo, nextHi, remainingAfter: Math.max(0, nextHi - nextLo + 1) });
    if (relation === "equal") { foundIndex = mid; break; }
    lo = nextLo;
    hi = nextHi;
  }
  return { length, target, steps, foundIndex };
}
export function buildEpisodeTraces(): Record<Example, SearchTrace> {
  return {
    "small-found": traceBinarySearch(12, (i) => SMALL_VALUES[i], 91),
    "million-found": traceBinarySearch(1000000, (i) => i + 1, 1000000),
    "small-missing": traceBinarySearch(12, (i) => SMALL_VALUES[i], 90),
  };
}
export function linearProgress(length: number, progress: number) {
  if (!Number.isSafeInteger(length) || length < 1 || !Number.isFinite(progress)) throw new Error("Invalid linear progress");
  const checked = Math.floor(Math.max(0, Math.min(1, progress)) * length);
  return { checked, currentIndex: checked ? checked - 1 : null, found: checked === length };
}
