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
          drive_reports_root_folder_id: string | null;
          drive_reports_root_folder_name: string | null;
          drive_connection_checked_at: string | null;
          drive_connection_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          drive_reports_root_folder_id?: string | null;
          drive_reports_root_folder_name?: string | null;
          drive_connection_checked_at?: string | null;
          drive_connection_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          drive_reports_root_folder_id?: string | null;
          drive_reports_root_folder_name?: string | null;
          drive_connection_checked_at?: string | null;
          drive_connection_error?: string | null;
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
          drive_folder_name: string | null;
          drive_folder_verified_at: string | null;
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
          drive_folder_name?: string | null;
          drive_folder_verified_at?: string | null;
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
          drive_folder_name?: string | null;
          drive_folder_verified_at?: string | null;
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
      subject_units: {
        Row: {
          id: string;
          property_id: string;
          unit_type_id: string;
          organization_id: string;
          unit_number: string;
          sqft: number | null;
          asking_rent: number | null;
          market_rent: number | null;
          status: "available" | "pending" | "leased" | "offline";
          available_date: string | null;
          floor: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          unit_type_id: string;
          organization_id: string;
          unit_number: string;
          sqft?: number | null;
          asking_rent?: number | null;
          market_rent?: number | null;
          status?: "available" | "pending" | "leased" | "offline";
          available_date?: string | null;
          floor?: number | null;
          notes?: string | null;
        };
        Update: {
          unit_number?: string;
          sqft?: number | null;
          asking_rent?: number | null;
          market_rent?: number | null;
          status?: "available" | "pending" | "leased" | "offline";
          available_date?: string | null;
          floor?: number | null;
          notes?: string | null;
        };
        Relationships: [];
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
          drive_file_id: string | null;
          drive_web_view_link: string | null;
          drive_backup_error: string | null;
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
          drive_file_id?: string | null;
          drive_web_view_link?: string | null;
          drive_backup_error?: string | null;
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
          drive_file_id?: string | null;
          drive_web_view_link?: string | null;
          drive_backup_error?: string | null;
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
          mls_number: string | null;
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
          mls_number?: string | null;
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
          mls_number?: string | null;
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
      source_documents: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          report_run_id: string | null;
          unit_type_id: string | null;
          source_type:
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
          file_format: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          byte_size: number | null;
          content_type: string | null;
          parse_status:
            | "uploaded"
            | "parsing"
            | "parsed"
            | "failed"
            | "needs_review";
          parse_error: string | null;
          external_report_id: string | null;
          content_sha256: string | null;
          parser_version: string | null;
          warnings: Json;
          summary_metrics: Json;
          superseded_by: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          report_run_id?: string | null;
          unit_type_id?: string | null;
          source_type:
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
          file_format: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          byte_size?: number | null;
          content_type?: string | null;
          parse_status?:
            | "uploaded"
            | "parsing"
            | "parsed"
            | "failed"
            | "needs_review";
          parse_error?: string | null;
          external_report_id?: string | null;
          content_sha256?: string | null;
          parser_version?: string | null;
          warnings?: Json;
          summary_metrics?: Json;
          superseded_by?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          parse_status?:
            | "uploaded"
            | "parsing"
            | "parsed"
            | "failed"
            | "needs_review";
          parse_error?: string | null;
          external_report_id?: string | null;
          content_sha256?: string | null;
          parser_version?: string | null;
          warnings?: Json;
          summary_metrics?: Json;
          superseded_by?: string | null;
          unit_type_id?: string | null;
          report_run_id?: string | null;
        };
        Relationships: [];
      };
      extracted_values: {
        Row: {
          id: string;
          organization_id: string;
          source_document_id: string;
          report_run_id: string | null;
          field_key: string;
          raw_value: string | null;
          normalized_value: Json | null;
          confidence: number | null;
          uncertainty_notes: string | null;
          page_ref: string | null;
          row_ref: string | null;
          comparable_property_id: string | null;
          subject_unit_id: string | null;
          review_status: "pending" | "accepted" | "rejected" | "overridden";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_document_id: string;
          report_run_id?: string | null;
          field_key: string;
          raw_value?: string | null;
          normalized_value?: Json | null;
          confidence?: number | null;
          uncertainty_notes?: string | null;
          page_ref?: string | null;
          row_ref?: string | null;
          comparable_property_id?: string | null;
          subject_unit_id?: string | null;
          review_status?: "pending" | "accepted" | "rejected" | "overridden";
        };
        Update: {
          raw_value?: string | null;
          normalized_value?: Json | null;
          confidence?: number | null;
          uncertainty_notes?: string | null;
          review_status?: "pending" | "accepted" | "rejected" | "overridden";
          comparable_property_id?: string | null;
        };
        Relationships: [];
      };
      review_decisions: {
        Row: {
          id: string;
          organization_id: string;
          extracted_value_id: string;
          original_normalized_value: Json | null;
          chosen_normalized_value: Json;
          reason: string;
          reviewer_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          extracted_value_id: string;
          original_normalized_value?: Json | null;
          chosen_normalized_value: Json;
          reason: string;
          reviewer_user_id: string;
        };
        Update: {
          reason?: string;
        };
        Relationships: [];
      };
      source_value_conflicts: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_type_id: string | null;
          comparable_property_id: string | null;
          field_key: string;
          left_source: string;
          right_source: string;
          left_value: Json;
          right_value: Json;
          absolute_delta: number | null;
          status: "pending" | "resolved" | "ignored";
          chosen_value: Json | null;
          verified_listing_source: string | null;
          verified_at: string | null;
          reviewer_user_id: string | null;
          reviewer_note: string | null;
          left_extracted_value_id: string | null;
          right_extracted_value_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          unit_type_id?: string | null;
          comparable_property_id?: string | null;
          field_key: string;
          left_source: string;
          right_source: string;
          left_value: Json;
          right_value: Json;
          absolute_delta?: number | null;
          status?: "pending" | "resolved" | "ignored";
          chosen_value?: Json | null;
          verified_listing_source?: string | null;
          verified_at?: string | null;
          reviewer_user_id?: string | null;
          reviewer_note?: string | null;
          left_extracted_value_id?: string | null;
          right_extracted_value_id?: string | null;
        };
        Update: {
          status?: "pending" | "resolved" | "ignored";
          chosen_value?: Json | null;
          verified_listing_source?: string | null;
          verified_at?: string | null;
          reviewer_user_id?: string | null;
          reviewer_note?: string | null;
        };
        Relationships: [];
      };
      geocode_cache: {
        Row: {
          id: string;
          address_normalized: string;
          latitude: number | null;
          longitude: number | null;
          formatted_address: string | null;
          provider: string;
          status: "ok" | "failed" | "uncertain" | "skipped_no_key";
          raw_response: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          address_normalized: string;
          latitude?: number | null;
          longitude?: number | null;
          formatted_address?: string | null;
          provider?: string;
          status: "ok" | "failed" | "uncertain" | "skipped_no_key";
          raw_response?: Json;
        };
        Update: {
          latitude?: number | null;
          longitude?: number | null;
          formatted_address?: string | null;
          status?: "ok" | "failed" | "uncertain" | "skipped_no_key";
          raw_response?: Json;
        };
        Relationships: [];
      };
      report_snapshots: {
        Row: {
          id: string;
          organization_id: string;
          report_run_id: string;
          version: number;
          payload: Json;
          generated_file_bucket: string | null;
          generated_file_path: string | null;
          drive_file_id: string | null;
          drive_confirmed_at: string | null;
          drive_web_view_link: string | null;
          drive_file_name: string | null;
          drive_md5_checksum: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          report_run_id: string;
          version: number;
          payload: Json;
          generated_file_bucket?: string | null;
          generated_file_path?: string | null;
          drive_file_id?: string | null;
          drive_confirmed_at?: string | null;
          drive_web_view_link?: string | null;
          drive_file_name?: string | null;
          drive_md5_checksum?: string | null;
          created_by?: string | null;
        };
        Update: {
          generated_file_bucket?: string | null;
          generated_file_path?: string | null;
          drive_file_id?: string | null;
          drive_confirmed_at?: string | null;
          drive_web_view_link?: string | null;
          drive_file_name?: string | null;
          drive_md5_checksum?: string | null;
        };
        Relationships: [];
      };
      report_photos: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          comparable_property_id: string | null;
          report_run_id: string | null;
          source_document_id: string | null;
          source: "upload" | "paste" | "mls" | "prior_week" | "placeholder";
          storage_bucket: string;
          storage_path: string;
          sort_order: number;
          content_sha256: string | null;
          width: number | null;
          height: number | null;
          alt_text: string | null;
          crop_metadata: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          comparable_property_id?: string | null;
          report_run_id?: string | null;
          source_document_id?: string | null;
          source?: "upload" | "paste" | "mls" | "prior_week" | "placeholder";
          storage_bucket: string;
          storage_path: string;
          sort_order?: number;
          content_sha256?: string | null;
          width?: number | null;
          height?: number | null;
          alt_text?: string | null;
          crop_metadata?: Json;
          created_by?: string | null;
        };
        Update: {
          comparable_property_id?: string | null;
          report_run_id?: string | null;
          sort_order?: number;
          alt_text?: string | null;
          crop_metadata?: Json;
        };
        Relationships: [];
      };
      weekly_metrics: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          week_start: string;
          week_end: string;
          zillow_metrics: Json;
          apartments_metrics: Json;
          tours_scheduled: number | null;
          tours_completed: number | null;
          applications_received: number | null;
          staff_notes: string | null;
          feedback_summary: string | null;
          actions_planned: string | null;
          zillow_document_id: string | null;
          apartments_document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          week_start: string;
          week_end: string;
          zillow_metrics?: Json;
          apartments_metrics?: Json;
          tours_scheduled?: number | null;
          tours_completed?: number | null;
          applications_received?: number | null;
          staff_notes?: string | null;
          feedback_summary?: string | null;
          actions_planned?: string | null;
          zillow_document_id?: string | null;
          apartments_document_id?: string | null;
        };
        Update: {
          week_end?: string;
          zillow_metrics?: Json;
          apartments_metrics?: Json;
          tours_scheduled?: number | null;
          tours_completed?: number | null;
          applications_received?: number | null;
          staff_notes?: string | null;
          feedback_summary?: string | null;
          actions_planned?: string | null;
          zillow_document_id?: string | null;
          apartments_document_id?: string | null;
        };
        Relationships: [];
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
      org_has_any_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      delete_property_cascade: {
        Args: { p_property_id: string };
        Returns: undefined;
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
