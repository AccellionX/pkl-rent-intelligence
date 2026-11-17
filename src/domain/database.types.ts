/**
 * Hand-maintained Supabase Database typing for Phase 1 foundation tables.
 * Includes Relationships arrays required by @supabase/supabase-js generics.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
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
          external_links: Json;
          drive_folder_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          marketing_name?: string | null;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          country?: string;
          latitude?: number | null;
          longitude?: number | null;
          year_built?: number | null;
          stories?: number | null;
          unit_count?: number | null;
          amenities?: string[];
          external_links?: Json;
          drive_folder_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          marketing_name?: string | null;
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
          latitude?: number | null;
          longitude?: number | null;
          year_built?: number | null;
          stories?: number | null;
          unit_count?: number | null;
          amenities?: string[];
          external_links?: Json;
          drive_folder_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      unit_types: {
        Row: {
          id: string;
          property_id: string;
          organization_id: string;
          label: string;
          beds: number;
          baths: number;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          organization_id: string;
          label: string;
          beds: number;
          baths: number;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          organization_id?: string;
          label?: string;
          beds?: number;
          baths?: number;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "unit_types_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      report_runs: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_type_id: string;
          title: string;
          status:
            | "in_progress"
            | "waiting_on_review"
            | "sent"
            | "saved_to_drive";
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
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          unit_type_id: string;
          title: string;
          status?:
            | "in_progress"
            | "waiting_on_review"
            | "sent"
            | "saved_to_drive";
          period_start: string;
          period_end: string;
          prepared_by?: string | null;
          created_by?: string | null;
          recommended_rent_low?: number | null;
          recommended_rent_high?: number | null;
          narrative_draft?: string | null;
          narrative_approved?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
          saved_to_drive_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          property_id?: string;
          unit_type_id?: string;
          title?: string;
          status?:
            | "in_progress"
            | "waiting_on_review"
            | "sent"
            | "saved_to_drive";
          period_start?: string;
          period_end?: string;
          prepared_by?: string | null;
          created_by?: string | null;
          recommended_rent_low?: number | null;
          recommended_rent_high?: number | null;
          narrative_draft?: string | null;
          narrative_approved?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
          saved_to_drive_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_runs_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      comparable_properties: {
        Row: {
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
        };
        Insert: {
          id?: string;
          subject_property_id: string;
          organization_id: string;
          name: string;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          year_built?: number | null;
          stories?: number | null;
          total_units?: number | null;
          distance_miles?: number | null;
          is_active?: boolean;
          addition_note?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          subject_property_id?: string;
          organization_id?: string;
          name?: string;
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          year_built?: number | null;
          stories?: number | null;
          total_units?: number | null;
          distance_miles?: number | null;
          is_active?: boolean;
          addition_note?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comparable_properties_subject_property_id_fkey";
            columns: ["subject_property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      comparable_unit_data: {
        Row: {
          id: string;
          comparable_property_id: string;
          unit_type_id: string;
          organization_id: string;
          source_type: string;
          match_tier: "strongest" | "moderate" | "context" | null;
          rent_min: number | null;
          rent_max: number | null;
          sqft_min: number | null;
          sqft_max: number | null;
          psf: number | null;
          days_on_market: number | null;
          status: "pending" | "approved" | "rejected" | "missing";
          has_available_data: boolean;
          community_amenities: string[];
          unit_amenities: string[];
          notes: string | null;
          source_document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          comparable_property_id: string;
          unit_type_id: string;
          organization_id: string;
          source_type?: string;
          match_tier?: "strongest" | "moderate" | "context" | null;
          rent_min?: number | null;
          rent_max?: number | null;
          sqft_min?: number | null;
          sqft_max?: number | null;
          psf?: number | null;
          days_on_market?: number | null;
          status?: "pending" | "approved" | "rejected" | "missing";
          has_available_data?: boolean;
          community_amenities?: string[];
          unit_amenities?: string[];
          notes?: string | null;
          source_document_id?: string | null;
        };
        Update: {
          id?: string;
          comparable_property_id?: string;
          unit_type_id?: string;
          organization_id?: string;
          source_type?: string;
          match_tier?: "strongest" | "moderate" | "context" | null;
          rent_min?: number | null;
          rent_max?: number | null;
          sqft_min?: number | null;
          sqft_max?: number | null;
          psf?: number | null;
          days_on_market?: number | null;
          status?: "pending" | "approved" | "rejected" | "missing";
          has_available_data?: boolean;
          community_amenities?: string[];
          unit_amenities?: string[];
          notes?: string | null;
          source_document_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comparable_unit_data_comparable_property_id_fkey";
            columns: ["comparable_property_id"];
            referencedRelation: "comparable_properties";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_org_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      report_run_status:
        | "in_progress"
        | "waiting_on_review"
        | "sent"
        | "saved_to_drive";
      org_member_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Keep Relationship exported for future generated FK metadata.
export type { Relationship };
