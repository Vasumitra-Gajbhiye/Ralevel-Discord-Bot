export type IdLabel = { id: string; label: string };

export function normalizeIdLabels(raw: unknown): IdLabel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      typeof item === "string"
        ? { id: item, label: "" }
        : { id: String(item?.id ?? ""), label: String(item?.label ?? "") },
    )
    .filter((e) => e.id);
}

export function idLabelsToIds(entries: IdLabel[]): string[] {
  return entries.map((e) => e.id);
}
