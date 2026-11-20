import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/domain/database.types";
import { normalizeAddress } from "@/lib/extraction/normalize";
import { haversineMiles } from "./haversine";

export type GeocodeStatus = "ok" | "failed" | "uncertain" | "skipped_no_key";

export interface GeocodeResult {
  status: GeocodeStatus;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  cached: boolean;
  provider: "google" | "cache" | "none";
  message?: string;
}

function getGoogleGeocodeKey(): string | null {
  const key =
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null;
  return key && key.length > 10 ? key : null;
}

export function buildGeocodeCacheKey(parts: {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string | null {
  const raw = [parts.line1, parts.city, parts.state, parts.postalCode]
    .filter(Boolean)
    .join(", ");
  return normalizeAddress(raw)?.normalized ?? null;
}

type Client = SupabaseClient<Database>;

/**
 * Geocode an address with Google Geocoding API when configured.
 * Always checks `geocode_cache` first. Never fabricates coordinates.
 */
export async function geocodeAddress(opts: {
  supabase: Client;
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): Promise<GeocodeResult> {
  const cacheKey = buildGeocodeCacheKey(opts);
  if (!cacheKey) {
    return {
      status: "failed",
      latitude: null,
      longitude: null,
      formattedAddress: null,
      cached: false,
      provider: "none",
      message: "Address too incomplete to geocode",
    };
  }

  const { data: cached } = await opts.supabase
    .from("geocode_cache")
    .select("*")
    .eq("address_normalized", cacheKey)
    .maybeSingle();

  if (cached) {
    return {
      status: cached.status as GeocodeStatus,
      latitude: cached.latitude,
      longitude: cached.longitude,
      formattedAddress: cached.formatted_address,
      cached: true,
      provider: "cache",
      message: cached.status === "ok" ? undefined : "Cached geocode was not successful",
    };
  }

  const apiKey = getGoogleGeocodeKey();
  if (!apiKey) {
    return {
      status: "skipped_no_key",
      latitude: null,
      longitude: null,
      formattedAddress: null,
      cached: false,
      provider: "none",
      message: "Distance calculation is currently unavailable.",
    };
  }

  const address = [opts.line1, opts.city, opts.state, opts.postalCode]
    .filter(Boolean)
    .join(", ");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  let payload: {
    status: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number }; location_type?: string };
      partial_match?: boolean;
    }>;
    error_message?: string;
  };

  try {
    const res = await fetch(url.toString());
    payload = (await res.json()) as typeof payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geocode request failed";
    await opts.supabase.from("geocode_cache").upsert(
      {
        address_normalized: cacheKey,
        latitude: null,
        longitude: null,
        formatted_address: null,
        provider: "google",
        status: "failed",
        raw_response: { error: message } as Json,
      },
      { onConflict: "address_normalized" },
    );
    return {
      status: "failed",
      latitude: null,
      longitude: null,
      formattedAddress: null,
      cached: false,
      provider: "google",
      message,
    };
  }

  const top = payload.results?.[0];
  const lat = top?.geometry?.location?.lat ?? null;
  const lng = top?.geometry?.location?.lng ?? null;
  const locationType = top?.geometry?.location_type ?? null;
  const uncertain =
    payload.status !== "OK" ||
    !top ||
    lat == null ||
    lng == null ||
    top.partial_match === true ||
    locationType === "APPROXIMATE";

  const status: GeocodeStatus =
    payload.status !== "OK" || lat == null || lng == null
      ? "failed"
      : uncertain
        ? "uncertain"
        : "ok";

  await opts.supabase.from("geocode_cache").upsert(
    {
      address_normalized: cacheKey,
      latitude: lat,
      longitude: lng,
      formatted_address: top?.formatted_address ?? null,
      provider: "google",
      status,
      raw_response: {
        status: payload.status,
        location_type: locationType,
        partial_match: top?.partial_match ?? false,
        error_message: payload.error_message ?? null,
      } as Json,
    },
    { onConflict: "address_normalized" },
  );

  return {
    status,
    latitude: status === "failed" ? null : lat,
    longitude: status === "failed" ? null : lng,
    formattedAddress: top?.formatted_address ?? null,
    cached: false,
    provider: "google",
    message:
      status === "ok"
        ? undefined
        : status === "uncertain"
          ? "Geocode result marked uncertain for manual review"
          : payload.error_message ?? `Geocode status ${payload.status}`,
  };
}

export async function distanceMilesBetweenAddresses(opts: {
  supabase: Client;
  subject: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  comparable: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
}): Promise<{
  miles: number | null;
  subject: GeocodeResult | null;
  comparable: GeocodeResult | null;
  flagged: boolean;
  message?: string;
}> {
  let subjectLat = opts.subject.latitude ?? null;
  let subjectLon = opts.subject.longitude ?? null;
  let compLat = opts.comparable.latitude ?? null;
  let compLon = opts.comparable.longitude ?? null;
  let subjectGeo: GeocodeResult | null = null;
  let compGeo: GeocodeResult | null = null;

  if (subjectLat == null || subjectLon == null) {
    subjectGeo = await geocodeAddress({ supabase: opts.supabase, ...opts.subject });
    if (subjectGeo.status === "ok" || subjectGeo.status === "uncertain") {
      subjectLat = subjectGeo.latitude;
      subjectLon = subjectGeo.longitude;
    }
  }
  if (compLat == null || compLon == null) {
    compGeo = await geocodeAddress({ supabase: opts.supabase, ...opts.comparable });
    if (compGeo.status === "ok" || compGeo.status === "uncertain") {
      compLat = compGeo.latitude;
      compLon = compGeo.longitude;
    }
  }

  if (
    subjectLat == null ||
    subjectLon == null ||
    compLat == null ||
    compLon == null
  ) {
    return {
      miles: null,
      subject: subjectGeo,
      comparable: compGeo,
      flagged: true,
      message: "Distance unavailable — geocoding incomplete or failed",
    };
  }

  try {
    const miles = haversineMiles(subjectLat, subjectLon, compLat, compLon);
    const flagged =
      subjectGeo?.status === "uncertain" || compGeo?.status === "uncertain";
    return {
      miles,
      subject: subjectGeo,
      comparable: compGeo,
      flagged,
      message: flagged ? "Distance uses uncertain geocode — review manually" : undefined,
    };
  } catch (error) {
    return {
      miles: null,
      subject: subjectGeo,
      comparable: compGeo,
      flagged: true,
      message: error instanceof Error ? error.message : "Haversine failed",
    };
  }
}
