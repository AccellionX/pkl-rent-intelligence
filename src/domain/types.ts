/**
 * Phase 1 persistent domain types (Supabase / live mode).
 * Kept separate from src/data/types.ts so the Veterans demo UI remains unchanged.
 */

export type AppMode = "demo" | "live";

export type OrgMemberRole = "owner" | "admin" | "member";

export type ReportRunStatus =
  | "in_progress"
  | "waiting_on_review"
  | "sent"
  | "saved_to_drive";

export type SourceDocumentType =
  | "rentometer_csv"
  | "rentometer_xlsx"
  | "rentometer_pdf"
  | "hellodata_pdf"
  | "mls_ri_pdf"
  | "mls_ct_pdf"
  | "zillow_xlsx"
  | "apartments_xlsx"
  | "photo"
  | "other";

export type ParseStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "failed"
  | "needs_review";

export type ExtractionReviewStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "overridden";

export type MatchTier = "strongest" | "moderate" | "context";

export type CompUnitDataStatus = "pending" | "approved" | "rejected" | "missing";

export type PhotoSource = "upload" | "paste" | "mls" | "prior_week" | "placeholder";

export type SubjectUnitStatus = "available" | "leased" | "pending" | "offline";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  created_at: string;
}

export interface PropertyExternalLinks {
  zillow?: string;
  apartments?: string;
  mls?: string;
  [key: string]: string | undefined;
}

export interface Property {
  id: string;
  organization_id: string;
  name: string;
  marketing_name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  year_built: number | null;
  stories: number | null;
  unit_count: number | null;
  amenities: string[];
  external_links: PropertyExternalLinks;
  drive_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnitType {
  id: string;
  property_id: string;
  organization_id: string;
  label: string;
  beds: number;
  baths: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectUnit {
  id: string;
  property_id: string;
  unit_type_id: string;
  organization_id: string;
  unit_number: string;
  sqft: number | null;
  asking_rent: number | null;
  market_rent: number | null;
  status: SubjectUnitStatus;
  available_date: string | null;
  floor: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComparableProperty {
  id: string;
  subject_property_id: string;
  organization_id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  year_built: number | null;
  stories: number | null;
  total_units: number | null;
  distance_miles: number | null;
  is_active: boolean;
  addition_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComparableUnitData {
  id: string;
  comparable_property_id: string;
  unit_type_id: string;
  organization_id: string;
  source_type: string;
  match_tier: MatchTier | null;
  rent_min: number | null;
  rent_max: number | null;
  sqft_min: number | null;
  sqft_max: number | null;
  psf: number | null;
  days_on_market: number | null;
  status: CompUnitDataStatus;
  has_available_data: boolean;
  community_amenities: string[];
  unit_amenities: string[];
  notes: string | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRun {
  id: string;
  organization_id: string;
  property_id: string;
  unit_type_id: string;
  title: string;
  status: ReportRunStatus;
  period_start: string;
  period_end: string;
  prepared_by: string | null;
  created_by: string | null;
  recommended_rent_low: number | null;
  recommended_rent_high: number | null;
  narrative_draft: string | null;
  narrative_approved: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  saved_to_drive_at: string | null;
}

export interface AuthUserContext {
  id: string;
  email: string | null;
}

export interface OrgAccessContext {
  user: AuthUserContext;
  organizationId: string;
  role: OrgMemberRole;
}
