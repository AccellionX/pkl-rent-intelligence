# Task #18B — Property Information Extraction Verification

**Date:** 2026-11-18  
**Clarification (Kent):** Uploaded reports already contain property names and addresses; staff must not re-enter information that was successfully extracted. Automatically discovering missing listing links online is **Phase 2** (out of scope).

**Verdict:** Phase 1 extraction for **names and addresses** satisfies the clarification for applicable source types. **Existing listing URL extraction** is implemented where links genuinely appear in source files; authorized Rentometer / HelloData / MLS / Zillow / Apartments packages largely **do not contain** subject Zillow/Apartments listing URLs (those live in finished manual reports, not Phase 1 parsers). Optional manual entry remains available and never blocks workflows.

---

## 1. Return summary

| Area | Status |
|------|--------|
| Property name extraction | **PASS** (HelloData subject + comps; Apartments/Zillow marketed names; Rentometer when name column present) |
| Address extraction | **PASS** (Rentometer, HelloData, RI/CT MLS — city/state/ZIP when present in source) |
| Existing listing URL extraction | **PASS with source limits** — plain-text URL columns, Excel hyperlinks, PDF annotation URLs (non-vendor) |
| Embedded hyperlink extraction | **PASS** — PDF Annots + Excel `cell.l` targets; vendor chrome ignored |
| Data persistence | **PASS** — extractions → review → comparable create; subject marketing/links fill empty fields only |
| Browser verification | **PASS** — review shows names, full addresses, listing links; property website field present |
| Defects found & fixed | See §7 |
| Automated tests | **208** passed · typecheck/lint/build **PASS** |

---

## 2. What authorized source files actually contain

Inspected: 855 package + Veterans package + CT MLS PDF + synthetic Rentometer fixtures.

| Source | Names | Addresses | Listing / website URLs |
|--------|-------|-----------|-------------------------|
| Rentometer CSV/XLSX | Usually **absent** (address-only export) | **Present** | **Absent** in authorized files; supported when column/hyperlink exists |
| Rentometer PDF | Subject address in summary | Comp listing addresses (supplemental) | Vendor only (`rentometer.com`, maps) — **not** property listings |
| HelloData PDF | Subject + comp **names** | Subject + comp street/city/state/ZIP | Overview may show bare domains (e.g. `pilgrimpark.com`) jammed in a summary strip; **card pages** in authorized files rarely include per-building websites. Footer = HelloData vendor |
| RI MLS PDF | Address-as-name | Street (+ unit); city often thin on summary | **None** |
| CT MLS PDF | Address-as-name | Street, city, state, ZIP | Internal `javascript:` MLS chrome only — ignored |
| Zillow XLSX | Property **name** for weekly match | Not structured address | **None** |
| Apartments.com XLSX | Property **name** from Lead Summary | **None** | **None** |
| Finished PKL branded PDFs/HTML | Names + links | Addresses | Zillow/Apartments URLs — **not** a Phase 1 upload source type |

**No fabrication:** parsers never invent missing names, addresses, or URLs.

---

## 3. Parser audit (post-fix)

### Names
- **HelloData:** `subjectName` + building `name` → extractions; empty `properties.marketing_name` filled on upload.
- **Rentometer tabular:** optional `name` / `property_name` / `community` columns.
- **MLS:** display name = address (± unit).
- **Zillow / Apartments:** marketed name used for matching; fills empty `marketing_name` when matched.

### Addresses
- **Rentometer / HelloData / MLS:** normalized `line1`, `city`, `state`, `postalCode` when present.
- Subject address from HelloData / Rentometer PDF summary applied only to **blank** property address fields (never overwrites staff street lines).

### Listing URLs / hyperlinks
New shared module: `src/lib/extraction/listing-links.ts`

| Mechanism | Behavior |
|-----------|----------|
| Plain-text `http(s)` + bare domains | Extracted; vendor hosts ignored |
| PDF annotations (`getAnnotations`) | Merged for HelloData (and available for other PDFs) |
| Excel hyperlinks (`cell.l.Target`) | Mapped onto Rentometer XLSX rows when address cell is linked |
| URL / website columns | Rentometer aliases: `url`, `listing_url`, `website`, `zillow_url`, … |

Classification: `zillow` · `apartments` · `website` · `ignored` (Rentometer, HelloData, Google Maps, etc.).

### Persistence
- Candidates store `name`, `address`, `listingUrl` / `websiteUrl` in `extracted_values.normalized_value`.
- Accept creates `comparable_properties` with name + address; website appended to `notes` when present (no migration).
- `applyExtractedSubjectIdentity` fills **empty** `marketing_name` / address parts / `external_links` keys only.

### Review UI
- Pending rows show **label (name)**, **full address**, rent/distance, and **Listing / website link** when extracted.
- Evidence: `tmp/task18b/comparables-review.png`.

### Manual entry (optional)
- Property Overview: Zillow, Apartments.com, **Property website** — optional; does not block uploads or pricing.
- Staff corrections preserved on re-upload (`Staff Verified Marketing Name` survived HelloData re-upload).

---

## 4. Browser verification (isolated)

Property: **Eighteen B Identity** (controlled, PKL Management LLC).

| Check | Result |
|-------|--------|
| Upload Rentometer CSV with name + URL columns | Names + Zillow/website URLs extracted |
| Upload Rentometer XLSX with address hyperlink | Apartments.com URL extracted from hyperlink |
| Upload HelloData PDF | Subject name → `marketing_name`; comps show names + full addresses |
| Re-upload after staff marketing edit | Staff value **preserved** |
| Comparables review browser | Names, addresses, listing links visible |
| Property details | Website field present; marketed name shown |

Machine log: `tmp/task18b/evidence.json` · script `scripts/task18b-verify-identity.mjs`.

---

## 5. Duplicate addresses & missing URLs

- Duplicate property address create still requires explicit confirm (existing Phase 1 behavior).
- Missing listing URL: workflows continue; optional manual fields remain empty — **no blocking**, **no invented URL**.

---

## 6. Phase 2 explicitly not done

- No online discovery, scraping, Apify, or web search for missing listing links.
- No automatic enrichment of Zillow/Apartments URLs when absent from the uploaded file.

---

## 7. Defects found and fixed

| Sev | Defect | Fix |
|-----|--------|-----|
| **High** | Listing/website URLs never extracted from text, PDF annots, or Excel hyperlinks | `listing-links.ts` + Rentometer column/hyperlink wiring + HelloData PDF annot merge |
| **High** | HelloData subject name not applied to property record | `applyExtractedSubjectIdentity` on HelloData / Rentometer PDF / weekly uploads |
| **Medium** | Review UI showed city only (not full address) and no links | Review API + `live-comparables-review` show address + link |
| **Medium** | `villadelrioapartments.com` misclassified as Apartments.com host | Hostname match uses exact / subdomain suffix, not substring |
| **Low** | No property website field in Overview | Optional “Property website” input → `external_links.website` |

---

## 8. Automated verification

| Command | Result |
|---------|--------|
| `npm test` | **40 files / 208 tests PASS** (+ listing-links, apply-subject-identity) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

---

## 9. Alignment with Kent clarification

| Requirement | Met? |
|-------------|------|
| Auto-extract names/addresses from uploaded reports | **Yes** for Phase 1 source types that contain them |
| Auto-extract existing listing links when present in those files | **Yes** |
| Do not require re-entry of successfully extracted fields | **Yes** (review auto-populated; subject marketing/links fill empties) |
| Preserve staff corrections on later uploads | **Yes** |
| Optional manual entry when URL absent | **Yes** |
| Never fabricate | **Yes** |
| No Phase 2 online discovery | **Yes** |

**Residual (honest):** HelloData overview “website strip” domains are not reliably attributable per building in authorized PDFs; card-level `websiteUrl` stays null until a card block contains a domain/URL. Finished client PDFs with listing URLs are not Phase 1 upload parsers.
