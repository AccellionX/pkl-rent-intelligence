import type { CanonicalReportPayload } from "@/lib/reports/types";
import { sectionsToPlainText } from "@/lib/reports/narrative-document";
import { PDF_BRAND } from "./brand";
import type { PdfMode } from "./finalization";
import { escapeHtml, money, num, psf, safeHttpUrl } from "./format";

type CropMeta = {
  aspect: "3:2";
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

/** Apply saved 3:2 crop via overflow + positioned image (no public URLs). */
function croppedImg(src: string, crop: CropMeta, alt: string): string {
  if (!crop) {
    return `<img src="${src}" alt="${escapeHtml(alt)}" />`;
  }
  const left = -(crop.x / crop.width) * 100;
  const top = -(crop.y / crop.height) * 100;
  const width = (1 / crop.width) * 100;
  const height = (1 / crop.height) * 100;
  return `<div class="crop-frame"><img src="${src}" alt="${escapeHtml(alt)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%" /></div>`;
}

/**
 * Server-side HTML for Playwright / Railway worker rendering.
 * Uses only assembly payload values — no independent calculations.
 * Escapes all user/AI text; only allows http(s) listing links.
 */
export function buildReportHtml(opts: {
  payload: CanonicalReportPayload;
  mode: PdfMode;
  photoDataUrls?: Record<string, string>;
}): string {
  const { payload, mode } = opts;
  const photos = opts.photoDataUrls ?? {};
  const draftBanner =
    mode === "draft"
      ? `<div class="draft-banner">DRAFT / INCOMPLETE — Not a finalized owner report</div>`
      : "";

  const narrative = payload.narrative.document
    ? sectionsToPlainText(payload.narrative.document.sections)
    : "Narrative not yet approved.";

  const photoRecords = payload.property.photos ?? [];
  const subjectPhotoRecord = photoRecords.find((p) => !p.comparablePropertyId);
  const subjectPhoto =
    subjectPhotoRecord && photos[subjectPhotoRecord.storagePath]
      ? croppedImg(photos[subjectPhotoRecord.storagePath]!, subjectPhotoRecord.crop, "Subject")
      : `<div class="photo-placeholder">Photo to be added</div>`;

  const unitsRows = payload.availableUnits
    .map((u) => {
      const unitPsf =
        u.askingRent != null && u.sqft != null && u.sqft > 0
          ? psf(u.askingRent / u.sqft)
          : "—";
      return `<tr>
        <td>${escapeHtml(u.unitNumber)}</td>
        <td>${payload.unitType.beds} bd / ${payload.unitType.baths} ba</td>
        <td>${num(u.sqft)}</td>
        <td>${escapeHtml(u.status)}</td>
        <td>${money(u.askingRent)}</td>
        <td>${unitPsf}</td>
      </tr>`;
    })
    .join("");

  const listingLinks = Object.entries(payload.property.listingLinks)
    .map(([k, v]) => {
      const safe = safeHttpUrl(v);
      return safe
        ? `<li>${escapeHtml(k)}: <a href="${escapeHtml(safe)}">${escapeHtml(safe)}</a></li>`
        : `<li>${escapeHtml(k)}: [listing link]</li>`;
    })
    .join("");

  const compsTable = payload.comparables.approvedIncluded
    .map((c) => {
      const rent =
        c.rentMin != null && c.rentMax != null && c.rentMin !== c.rentMax
          ? `${money(c.rentMin)}–${money(c.rentMax)}`
          : money(c.monthlyRent ?? c.rentMin ?? c.rentMax);
      const sqft =
        c.sqftMin != null && c.sqftMax != null && c.sqftMin !== c.sqftMax
          ? `${c.sqftMin}–${c.sqftMax}`
          : num(c.sqftMin ?? c.sqftMax);
      return `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.sourceType)}</td>
        <td>${escapeHtml(c.matchTier ?? "—")}</td>
        <td>${sqft}</td>
        <td>${rent}</td>
        <td>${psf(c.psf)}</td>
        <td>${num(c.daysOnMarket)}</td>
        <td>${c.distanceMiles != null ? `${c.distanceMiles} mi` : "—"}</td>
      </tr>`;
    })
    .join("");

  const cropByPath = new Map(
    photoRecords.map((p) => [p.storagePath, p.crop] as const),
  );
  const compCards = payload.comparables.approvedIncluded
    .map((c) => {
      const imgs = (c.photoPaths.length ? c.photoPaths : ["__missing__"])
        .slice(0, 3)
        .map((p) =>
          p !== "__missing__" && photos[p]
            ? croppedImg(photos[p]!, cropByPath.get(p) ?? null, "")
            : `<div class="photo-placeholder">Photo to be added</div>`,
        )
        .join("");
      return `<article class="comp-card avoid-break">
        <h3>${escapeHtml(c.name)} <span class="tier">${escapeHtml(c.matchTier ?? "")}</span></h3>
        <p class="meta">${escapeHtml(c.addressLine1)}, ${escapeHtml(c.city)}, ${escapeHtml(c.state)} · ${c.distanceMiles != null ? `${c.distanceMiles} mi` : "—"} · ${escapeHtml(c.sourceType)}</p>
        <div class="photo-row">${imgs}</div>
        <dl>
          <div><dt>Rent</dt><dd>${money(c.monthlyRent)}</dd></div>
          <div><dt>$ / sq ft</dt><dd>${psf(c.psf)}</dd></div>
          <div><dt>DOM</dt><dd>${num(c.daysOnMarket)}</dd></div>
        </dl>
        <p>${escapeHtml(c.notes ?? "No notes.")}</p>
      </article>`;
    })
    .join("");

  const excluded = [
    ...payload.comparables.approvedExcludedFromStats.map(
      (c) =>
        `<li>${escapeHtml(c.name)} — ${escapeHtml(c.exclusionReason ?? "excluded from stats")}</li>`,
    ),
  ];
  if (payload.comparables.rejectedOrUnreviewedOmittedCount > 0) {
    excluded.push(
      `<li>${payload.comparables.rejectedOrUnreviewedOmittedCount} unreviewed/rejected candidate row(s) omitted from this report</li>`,
    );
  }

  const latest = payload.weekly.latestWeek;
  const weeklyBlock = latest
    ? `<section class="avoid-break">
        <h2>Weekly listing update — ${escapeHtml(latest.weekStart)} – ${escapeHtml(latest.weekEnd)}</h2>
        <p class="note">${escapeHtml(payload.weekly.scopeNote)}</p>
        <table>
          <thead><tr><th>Metric</th><th>This week</th><th>Listing to date</th></tr></thead>
          <tbody>
            <tr><td>Zillow impressions</td><td>${num(latest.zillow.weekly.impressions)}</td><td>${num(latest.zillow.listingToDate.impressions)}</td></tr>
            <tr><td>Zillow listing views</td><td>${num(latest.zillow.weekly.listingViews)}</td><td>${num(latest.zillow.listingToDate.listingViews)}</td></tr>
            <tr><td>Zillow total leads</td><td>${num(latest.zillow.weekly.totalLeads)}</td><td>${num(latest.zillow.listingToDate.totalLeads)}</td></tr>
            <tr><td>Apartments.com phones</td><td colspan="2">${num(latest.apartments.phoneCalls)}</td></tr>
            <tr><td>Apartments.com emails</td><td colspan="2">${num(latest.apartments.emails)}</td></tr>
            <tr><td>Apartments.com tours / apps</td><td colspan="2">${num(latest.apartments.tours)} / ${num(latest.apartments.applications)}</td></tr>
          </tbody>
        </table>
        <h3>Tours and prospect feedback</h3>
        <p>Tours scheduled ${num(latest.agent.toursScheduled)} · completed ${num(latest.agent.toursCompleted)} · applications ${num(latest.agent.applicationsReceived)}</p>
        <p><strong>Agent weekly comments (not AI):</strong> ${escapeHtml(latest.agent.weeklyComments ?? "—")}</p>
        <p><strong>Prospect feedback summary:</strong> ${escapeHtml(latest.agent.prospectFeedbackSummary ?? "—")}</p>
        <p><strong>Actions planned:</strong> ${escapeHtml(latest.agent.actionsPlannedNextWeek ?? "—")}</p>
      </section>`
    : `<section><h2>Weekly listing update</h2><p>No weekly metrics uploaded.</p></section>`;

  const stats = payload.pricing.stats;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(payload.report.title)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: Helvetica, Arial, sans-serif; color: rgb(${PDF_BRAND.ink.r},${PDF_BRAND.ink.g},${PDF_BRAND.ink.b}); font-size: 10.5pt; }
  .header { background: rgb(${PDF_BRAND.navy.r},${PDF_BRAND.navy.g},${PDF_BRAND.navy.b}); color: white; padding: 18px 24px; }
  .header .gold { color: rgb(${PDF_BRAND.gold.r},${PDF_BRAND.gold.g},${PDF_BRAND.gold.b}); font-size: 10pt; font-weight: 700; letter-spacing: 0.04em; }
  .gold-rule { height: 3px; background: rgb(${PDF_BRAND.gold.r},${PDF_BRAND.gold.g},${PDF_BRAND.gold.b}); }
  .draft-banner { background: #fff3cd; color: #7a5b00; padding: 8px 16px; font-weight: 700; text-align: center; border-bottom: 1px solid #e0c35a; }
  main { padding: 20px 24px 40px; }
  h1 { font-size: 18pt; margin: 0 0 4px; color: rgb(${PDF_BRAND.navy.r},${PDF_BRAND.navy.g},${PDF_BRAND.navy.b}); }
  h2 { font-size: 13pt; color: rgb(${PDF_BRAND.navy.r},${PDF_BRAND.navy.g},${PDF_BRAND.navy.b}); margin-top: 22px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 12px 0 6px; page-break-after: avoid; }
  .rec { background: rgb(${PDF_BRAND.navy.r},${PDF_BRAND.navy.g},${PDF_BRAND.navy.b}); color: white; padding: 14px 16px; border-radius: 8px; }
  .rec .label { color: rgb(${PDF_BRAND.gold.r},${PDF_BRAND.gold.g},${PDF_BRAND.gold.b}); font-size: 9pt; font-weight: 700; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
  .kpi { background: rgb(${PDF_BRAND.surface.r},${PDF_BRAND.surface.g},${PDF_BRAND.surface.b}); padding: 10px; border-radius: 6px; }
  .kpi span { display: block; font-size: 8pt; color: rgb(${PDF_BRAND.muted.r},${PDF_BRAND.muted.g},${PDF_BRAND.muted.b}); }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 9pt; }
  th { background: rgb(${PDF_BRAND.navy.r},${PDF_BRAND.navy.g},${PDF_BRAND.navy.b}); color: white; text-align: left; padding: 6px; }
  td { padding: 6px; border-bottom: 1px solid #e6eaf0; }
  .photo-placeholder { background: #eef1f5; border: 1px dashed #b8c0cc; color: #6b7287; min-height: 72px; display: flex; align-items: center; justify-content: center; font-size: 9pt; }
  .photo-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 8px 0; }
  .photo-row img, .subject img { width: 100%; height: 90px; object-fit: cover; }
  .crop-frame { position: relative; overflow: hidden; aspect-ratio: 3 / 2; width: 100%; height: 90px; background: #eef1f5; }
  .crop-frame img { position: absolute; max-width: none; object-fit: fill; }
  .comp-card { border: 1px solid #e6eaf0; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  .tier { font-size: 9pt; color: rgb(${PDF_BRAND.gold.r},${PDF_BRAND.gold.g},${PDF_BRAND.gold.b}); }
  .note { color: rgb(${PDF_BRAND.muted.r},${PDF_BRAND.muted.g},${PDF_BRAND.muted.b}); font-size: 9pt; }
  footer { position: running(footer); font-size: 8pt; color: #8a93a3; }
</style>
</head>
<body>
${draftBanner}
<div class="header">
  <div class="gold">${escapeHtml(PDF_BRAND.company.toUpperCase())}</div>
  <div style="font-size:16pt;font-weight:700;margin-top:4px;">Rental Pricing Analysis</div>
  <div style="font-size:9pt;opacity:.85;margin-top:4px;">${escapeHtml(payload.property.name)} — ${escapeHtml(payload.unitType.label)} · ${escapeHtml(payload.report.periodStart)} – ${escapeHtml(payload.report.periodEnd)} · Prepared by ${escapeHtml(payload.report.preparedBy ?? PDF_BRAND.company)}</div>
</div>
<div class="gold-rule"></div>
<main>
  <h1>${escapeHtml(payload.property.name)}</h1>
  <p class="note">${escapeHtml(payload.property.addressLine1)}, ${escapeHtml(payload.property.city)}, ${escapeHtml(payload.property.state)} ${escapeHtml(payload.property.postalCode)}</p>
  <div class="subject avoid-break">${subjectPhoto}</div>
  <h2>Subject property</h2>
  <p>Built ${num(payload.property.yearBuilt)} · Units/stories ${num(payload.property.unitCount)} / ${num(payload.property.stories)} · ${payload.unitType.beds} / ${payload.unitType.baths}</p>
  <p><strong>Amenities:</strong> ${payload.property.amenities.map(escapeHtml).join(" · ") || "—"}</p>
  <h3>Where it is listed</h3>
  <ul>${listingLinks || "<li>No listing links on file</li>"}</ul>
  <h2>Unit currently available</h2>
  <table><thead><tr><th>Unit</th><th>Bed / bath</th><th>Sq ft</th><th>Status</th><th>Asking rent</th><th>$ / sq ft</th></tr></thead><tbody>${unitsRows || "<tr><td colspan=6>No available units</td></tr>"}</tbody></table>

  <section class="avoid-break">
    <div class="rec">
      <div class="label">OUR RECOMMENDATION</div>
      <div style="font-size:18pt;font-weight:700;margin-top:6px;">${money(payload.pricing.recommendedRentLow)} – ${money(payload.pricing.recommendedRentHigh)} / month</div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Blended average</span><strong>${money(stats.blendedAverageRent)}</strong></div>
      <div class="kpi"><span>Avg $/sq ft</span><strong>${psf(stats.averagePsf)}</strong></div>
      <div class="kpi"><span>Comp rent range</span><strong>${money(stats.rangeLow)}–${money(stats.rangeHigh)}</strong></div>
      <div class="kpi"><span>Avg DOM</span><strong>${num(stats.averageDaysOnMarket)}</strong></div>
    </div>
    <p class="note">Source-set averages — Rentometer ${money(stats.rentometerSetAverage)} · HelloData ${money(stats.hellodataSetAverage)} · MLS ${money(stats.mlsSetAverage)}. Eligible grouped comps: ${stats.eligibleGroupedCount}.</p>
    <h2>Pricing narrative</h2>
    <p>${escapeHtml(narrative)}</p>
  </section>

  <h2>The comparables side by side</h2>
  <table><thead><tr><th>Property</th><th>Source</th><th>Match</th><th>Sq ft</th><th>Rent</th><th>$/sf</th><th>DOM</th><th>Dist</th></tr></thead><tbody>${compsTable || "<tr><td colspan=8>No eligible approved comps</td></tr>"}</tbody></table>
  <h3>Methodology</h3>
  <ul>${payload.comparables.methodology.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>

  <h2>Comparable properties</h2>
  ${compCards || "<p>No approved comparable cards.</p>"}

  <h2>Reviewed and excluded</h2>
  <ul>${excluded.join("") || "<li>None listed</li>"}</ul>

  ${weeklyBlock}

  <p class="note">Sources and footnotes come from reviewed report inputs. Prospect contact details are not included.</p>
</main>
</body>
</html>`;
}
