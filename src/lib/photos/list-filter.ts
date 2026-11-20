/** Rows used when listing photos for the subject or comparable gallery. */
export type PhotoListRow = {
  source: string;
  comparable_property_id: string | null;
};

/**
 * Subject gallery: subject-scoped non-MLS rows only.
 * Comparable gallery: rows for that comparable id only.
 */
export function filterPhotosForGallery<T extends PhotoListRow>(
  rows: T[],
  comparableId: string | null,
): T[] {
  return rows.filter((row) => {
    if (comparableId) {
      return row.comparable_property_id === comparableId;
    }
    if (row.comparable_property_id) return false;
    return row.source !== "mls";
  });
}

/** Whether a gallery list query should exclude MLS orphans at the database layer. */
export function subjectGalleryDbFilter(): {
  comparablePropertyIdIs: null;
  excludeSource: "mls";
} {
  return { comparablePropertyIdIs: null, excludeSource: "mls" };
}

/**
 * Sign storage paths with bounded concurrency so MLS floods cannot serialize
 * the subject gallery behind hundreds of sequential signed-URL round-trips.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
