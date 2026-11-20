import { extractImages, getDocumentProxy } from "unpdf";
import { sha256Hex } from "./hash";
import type { MlsListing, MlsListingPhotoCandidate } from "./mls-types";

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;
const MIN_PIXELS = 220 * 160;
const MAX_ASPECT = 2.6; // skip ultra-wide banners / page headers
const MIN_ASPECT = 0.55;
/** Report comps need a few primary shots — not entire MLS galleries. */
export const MAX_PHOTOS_PER_LISTING = 4;
/** Prefer 3:2 framing used by PKL report layouts. */
export const TARGET_PHOTO_ASPECT = 1.5;

/** CRC32 for PNG chunks */
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = u32(data.length);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = u32(crc32(body));
  const out = new Uint8Array(4 + body.length + 4);
  out.set(len, 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

/**
 * Minimal PNG encoder for raw grayscale/RGB/RGBA buffers from unpdf extractImages.
 * Avoids adding a sharp dependency for Phase 1 photo persistence.
 */
export function encodePngRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
): Uint8Array {
  const stride = width * channels;
  // Convert to RGBA filter-none scanlines
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const src = y * stride + x * channels;
      const dst = rowStart + 1 + x * 4;
      if (channels === 1) {
        const v = data[src] ?? 0;
        raw[dst] = v;
        raw[dst + 1] = v;
        raw[dst + 2] = v;
        raw[dst + 3] = 255;
      } else if (channels === 3) {
        raw[dst] = data[src] ?? 0;
        raw[dst + 1] = data[src + 1] ?? 0;
        raw[dst + 2] = data[src + 2] ?? 0;
        raw[dst + 3] = 255;
      } else {
        raw[dst] = data[src] ?? 0;
        raw[dst + 1] = data[src + 1] ?? 0;
        raw[dst + 2] = data[src + 2] ?? 0;
        raw[dst + 3] = data[src + 3] ?? 255;
      }
    }
  }

  // zlib store blocks (uncompressed) — compatible PNG IDAT
  const maxBlock = 65535;
  const zlibParts: Uint8Array[] = [new Uint8Array([0x78, 0x01])]; // zlib header, stored
  let adler = 1;
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i++) {
    s1 = (s1 + raw[i]!) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  adler = ((s2 << 16) | s1) >>> 0;

  for (let offset = 0; offset < raw.length; offset += maxBlock) {
    const slice = raw.subarray(offset, Math.min(offset + maxBlock, raw.length));
    const last = offset + maxBlock >= raw.length;
    const block = new Uint8Array(5 + slice.length);
    block[0] = last ? 1 : 0;
    block[1] = slice.length & 255;
    block[2] = (slice.length >>> 8) & 255;
    block[3] = ~slice.length & 255;
    block[4] = (~slice.length >>> 8) & 255;
    block.set(slice, 5);
    zlibParts.push(block);
  }
  zlibParts.push(u32(adler));

  let zlibLen = 0;
  for (const p of zlibParts) zlibLen += p.length;
  const zlibData = new Uint8Array(zlibLen);
  let zOff = 0;
  for (const p of zlibParts) {
    zlibData.set(p, zOff);
    zOff += p.length;
  }

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibData),
    chunk("IEND", new Uint8Array()),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function classifyPropertyPhoto(opts: {
  width: number;
  height: number;
}): { ok: boolean; reason?: string } {
  const { width, height } = opts;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return { ok: false, reason: "too_small_likely_icon" };
  }
  if (width * height < MIN_PIXELS) {
    return { ok: false, reason: "too_few_pixels" };
  }
  const aspect = width / height;
  if (aspect > MAX_ASPECT || aspect < MIN_ASPECT) {
    return { ok: false, reason: "extreme_aspect_likely_banner" };
  }
  return { ok: true };
}

export function photoAspectScore(width: number, height: number): number {
  if (height <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(width / height - TARGET_PHOTO_ASPECT);
}

/**
 * Keep a small set of primary listing photos: closest to 3:2, then largest.
 * Surplus accepted candidates are marked rejected (over_cap) for auditability.
 */
export function selectPrimaryListingPhotos<
  T extends { width: number; height: number; rejectedAsNonProperty?: boolean },
>(candidates: T[], max = MAX_PHOTOS_PER_LISTING): T[] {
  const accepted = candidates.filter((c) => !c.rejectedAsNonProperty);
  if (accepted.length <= max) return candidates;

  const ranked = [...accepted].sort((a, b) => {
    const aspectDelta =
      photoAspectScore(a.width, a.height) - photoAspectScore(b.width, b.height);
    if (aspectDelta !== 0) return aspectDelta;
    return b.width * b.height - a.width * a.height;
  });
  const keep = new Set(ranked.slice(0, max));
  return candidates.map((c) => {
    if (c.rejectedAsNonProperty || keep.has(c)) return c;
    return {
      ...c,
      rejectedAsNonProperty: true,
      rejectReason: "over_cap_primary_photos",
    };
  });
}

/**
 * Extract embedded images from MLS PDF pages and attach candidates to listings
 * whose pageRefs include that page. Does not assign logos/icons.
 */
export async function attachMlsPhotoCandidates(opts: {
  bytes: Uint8Array;
  listings: MlsListing[];
}): Promise<{
  listings: MlsListing[];
  rejectedCount: number;
  acceptedCount: number;
}> {
  const pdf = await getDocumentProxy(opts.bytes.slice());
  const pageToListings = new Map<number, MlsListing[]>();
  for (const listing of opts.listings) {
    for (const page of listing.pageRefs) {
      const arr = pageToListings.get(page) ?? [];
      arr.push(listing);
      pageToListings.set(page, arr);
    }
  }

  let rejectedCount = 0;
  let acceptedCount = 0;
  const seenHashes = new Set<string>();

  for (const [page, listings] of pageToListings) {
    let images;
    try {
      images = await extractImages(pdf, page);
    } catch {
      continue;
    }
    for (const image of images) {
      const verdict = classifyPropertyPhoto({
        width: image.width,
        height: image.height,
      });
      const candidate: MlsListingPhotoCandidate = {
        page,
        imageKey: image.key,
        width: image.width,
        height: image.height,
      };
      if (!verdict.ok) {
        candidate.rejectedAsNonProperty = true;
        candidate.rejectReason = verdict.reason ?? "rejected";
        rejectedCount += 1;
        // Still record rejection on first listing for auditability
        listings[0]?.photoCandidates.push(candidate);
        continue;
      }
      let png: Uint8Array;
      try {
        png = encodePngRgba(image.data, image.width, image.height, image.channels);
      } catch {
        candidate.rejectedAsNonProperty = true;
        candidate.rejectReason = "png_encode_failed";
        rejectedCount += 1;
        listings[0]?.photoCandidates.push(candidate);
        continue;
      }
      const hash = sha256Hex(png);
      candidate.contentSha256 = hash;
      if (seenHashes.has(hash)) {
        candidate.rejectedAsNonProperty = true;
        candidate.rejectReason = "duplicate_image";
        rejectedCount += 1;
        listings[0]?.photoCandidates.push(candidate);
        continue;
      }
      seenHashes.add(hash);
      // Prefer single-listing pages; if multiple share a page, leave unassigned uncertainty
      if (listings.length === 1) {
        listings[0]!.photoCandidates.push({
          ...candidate,
          // stash encoded bytes via key namespace on object for persist layer
          ...( { _pngBytes: png } as object),
        });
        acceptedCount += 1;
      } else {
        candidate.rejectedAsNonProperty = true;
        candidate.rejectReason = "ambiguous_page_multi_listing";
        rejectedCount += 1;
        for (const l of listings) l.photoCandidates.push(candidate);
      }
    }
  }

  // Cap gallery dumps so RI multi-page Photo Gallery PDFs do not flood report_photos.
  let capped = 0;
  for (const listing of opts.listings) {
    const before = listing.photoCandidates.filter((p) => !p.rejectedAsNonProperty).length;
    listing.photoCandidates = selectPrimaryListingPhotos(listing.photoCandidates);
    const after = listing.photoCandidates.filter((p) => !p.rejectedAsNonProperty).length;
    capped += Math.max(0, before - after);
  }
  acceptedCount = Math.max(0, acceptedCount - capped);
  rejectedCount += capped;

  return { listings: opts.listings, rejectedCount, acceptedCount };
}

export function getPngBytesFromCandidate(
  candidate: MlsListingPhotoCandidate,
): Uint8Array | null {
  const bytes = (candidate as MlsListingPhotoCandidate & { _pngBytes?: Uint8Array })
    ._pngBytes;
  return bytes ?? null;
}
