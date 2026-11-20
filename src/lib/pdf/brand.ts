/** PKL branded PDF tokens — match existing demo navy/gold system. */
export const PDF_BRAND = {
  navy: { r: 11, g: 31, b: 58 },
  gold: { r: 201, g: 162, b: 39 },
  ink: { r: 40, g: 50, b: 65 },
  muted: { r: 100, g: 110, b: 125 },
  surface: { r: 248, g: 250, b: 252 },
  white: { r: 255, g: 255, b: 255 },
  danger: { r: 180, g: 40, b: 40 },
  company: "PKL Management LLC",
  product: "PKL Rent Intelligence",
  pageFormat: "letter" as const,
  /** Reference 855 PDF is US Letter (612×792 pt). */
  pageSizePt: { width: 612, height: 792 },
  marginPt: 48,
};

export const PDF_SECTION_ORDER = [
  "cover_subject",
  "recommendation_narrative",
  "comps_table",
  "comp_cards_strongest",
  "comp_cards_moderate",
  "comp_cards_context",
  "excluded_and_weekly",
  "tours_actions_sources",
] as const;
