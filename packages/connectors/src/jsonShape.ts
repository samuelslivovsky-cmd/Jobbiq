/** Helpers for reading JSON whose exact shape isn't documented. */

export type Json = Record<string, unknown>;

/** First non-empty string among keys (also reads {nazwa|name|value|…} objects). */
export function pickText(obj: Json, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Json;
      const inner =
        nested.nazwa ?? nested.name ?? nested.value ?? nested.miejscowosc ?? nested.bezeichnung ?? nested.ort;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) return first;
      if (first && typeof first === "object") {
        const text = pickText(first as Json, "name", "nazwa", "bezeichnung", "ort", "city", "value");
        if (text) return text;
      }
    }
  }
  return "";
}

/** The largest array of objects anywhere in the value (shape-tolerant). */
export function findOfferArray(node: unknown, depth = 0): Json[] {
  if (Array.isArray(node)) {
    return node.length && node[0] && typeof node[0] === "object" ? (node as Json[]) : [];
  }
  if (!node || typeof node !== "object" || depth > 5) return [];
  let best: Json[] = [];
  for (const value of Object.values(node as Json)) {
    const found = findOfferArray(value, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}
