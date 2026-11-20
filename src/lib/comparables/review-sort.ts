/** Prefer same-bed Rentometer rows with rent so staff see eligible comps first. */
export function sortPendingCandidatesForReview<
  T extends { sourceType: string; rent: number | null; beds?: number | null },
>(rows: T[], focusBeds: number | null): T[] {
  const rank = (c: T) => {
    const bedOk =
      focusBeds == null || c.beds == null || Number(c.beds) === Number(focusBeds);
    const hasRent = c.rent != null;
    const isRentometer = c.sourceType === "rentometer";
    if (isRentometer && hasRent && bedOk) return 0;
    if (hasRent && bedOk) return 1;
    if (hasRent) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
