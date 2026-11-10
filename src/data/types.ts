export type OccupancyStatus = "occupied" | "vacant" | "notice" | "down";
export type UnitStatus = "available" | "leased" | "pending" | "offline";
export type MatchStrength = "strongest" | "moderate" | "context";
export type ReportFrequency = "weekly" | "twice-monthly";
export type ReportStatus = "generated" | "scheduled" | "draft";
export type LeadSource = "zillow" | "apartments";

export interface Amenity {
  label: string;
  category: "community" | "unit";
}

export interface Unit {
  id: string;
  buildingId: string;
  unitNumber: string;
  beds: number;
  baths: number;
  sqft: number;
  askingRent: number;
  marketRent: number;
  status: UnitStatus;
  availableDate: string | null;
  floor: number;
  psf: number;
  notes?: string;
}

export interface Building {
  id: string;
  name: string;
  marketingName?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  yearBuilt: number | null;
  stories: number | null;
  unitCount: number;
  lat: number;
  lng: number;
  imageUrl: string;
  amenities: string[];
  occupancyRate: number;
  avgRent: number;
  avgPsf: number;
  vacancyCount: number;
  portfolio: "core" | "value-add" | "lease-up" | "stabilized";
  manager: string;
  isFeatured?: boolean;
  listingUrls?: {
    zillow?: string;
    apartments?: string;
    mls?: string;
  };
}

export interface Comparable {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  yearBuilt: number | null;
  units: number | null;
  stories: number | null;
  beds: number;
  baths: number;
  sqftMin: number;
  sqftMax: number;
  rentMin: number;
  rentMax: number;
  psf: number;
  daysOnMarket: number | null;
  distanceMiles: number;
  match: MatchStrength;
  source: string;
  communityAmenities: string[];
  unitAmenities: string[];
  notes: string;
  imageUrl: string;
}

export interface ExcludedComp {
  id: string;
  name: string;
  reason: string;
}

export interface PricingRecommendation {
  low: number;
  high: number;
  blendedAverage: number;
  averagePsf: number;
  rangeLow: number;
  rangeHigh: number;
  avgDaysOnMarket: number;
  narrative: string;
  actions: string[];
}

export interface LeadMetrics {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  zillow: {
    impressions: { week: number; toDate: number };
    listingViews: { week: number; toDate: number };
    webReferrals: { week: number; toDate: number };
    totalLeads: { week: number; toDate: number };
    phoneLeads: { week: number; toDate: number };
    emailLeads: { week: number; toDate: number };
    adImpressions: { week: number; toDate: number };
    adClicks: { week: number; toDate: number };
  };
  apartments: {
    phoneCalls: number;
    emails: number;
    toursBooked: number;
    applications: number;
    callLog: { datetime: string; duration: string }[];
    emailInquiries: { date: string; note: string }[];
  };
  toursScheduled: number;
  toursCompleted: number;
  applicationsReceived: number;
  conversionRateWeek: number;
  conversionRateToDate: number;
}

export interface GeneratedReport {
  id: string;
  buildingId: string;
  buildingName: string;
  unitIds: string[];
  unitLabels: string[];
  title: string;
  createdAt: string;
  preparedBy: string;
  recommendedLow: number;
  recommendedHigh: number;
  status: ReportStatus;
  notes?: string;
}

export interface ScheduledReport {
  id: string;
  buildingId: string;
  buildingName: string;
  frequency: ReportFrequency;
  nextRun: string;
  recipients: string[];
  enabled: boolean;
  createdAt: string;
}

export interface PricingOverride {
  buildingId: string;
  unitId: string;
  askingRent: number;
  updatedAt: string;
}

export interface UploadedExtraction {
  id: string;
  fileName: string;
  fileType: "pdf" | "xlsx" | "csv";
  uploadedAt: string;
  buildingId?: string;
  status: "processing" | "complete" | "failed";
  extractedFields: Record<string, string | number>;
  confidence: number;
}

export interface PortfolioStats {
  buildingCount: number;
  unitCount: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  avgRent: number;
  avgPsf: number;
  monthlyRevenue: number;
  reportsThisMonth: number;
}
