export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_membership_id: string | null
          details: Json
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          occurred_at: string
          organisation_id: string
          summary: string
        }
        Insert: {
          actor_membership_id?: string | null
          details?: Json
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          occurred_at?: string
          organisation_id: string
          summary: string
        }
        Update: {
          actor_membership_id?: string | null
          details?: Json
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organisation_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_organisation_id_actor_membership_id_fkey"
            columns: ["organisation_id", "actor_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "activity_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          assigned_membership_id: string
          created_at: string
          duration_minutes: number
          id: string
          lead_id: string
          location_or_link: string | null
          meeting_method: string
          notes: string
          organisation_id: string
          starts_at: string
          status: string
        }
        Insert: {
          assigned_membership_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          lead_id: string
          location_or_link?: string | null
          meeting_method: string
          notes?: string
          organisation_id: string
          starts_at: string
          status: string
        }
        Update: {
          assigned_membership_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          lead_id?: string
          location_or_link?: string | null
          meeting_method?: string
          notes?: string
          organisation_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_organisation_id_assigned_membership_id_fkey"
            columns: ["organisation_id", "assigned_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "appointments_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organisation_id_lead_id_fkey"
            columns: ["organisation_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      audience_recipients: {
        Row: {
          audience_snapshot_id: string
          candidate_key: string
          consent_status: string
          contact_id: string
          context_label: string
          eligible: boolean
          id: string
          masked_destination: string
          organisation_id: string
          resolved_merge_values: Json
          subject_display_name: string
          subject_id: string
          suppression_status: string
        }
        Insert: {
          audience_snapshot_id: string
          candidate_key: string
          consent_status: string
          contact_id: string
          context_label: string
          eligible: boolean
          id?: string
          masked_destination: string
          organisation_id: string
          resolved_merge_values?: Json
          subject_display_name: string
          subject_id: string
          suppression_status: string
        }
        Update: {
          audience_snapshot_id?: string
          candidate_key?: string
          consent_status?: string
          contact_id?: string
          context_label?: string
          eligible?: boolean
          id?: string
          masked_destination?: string
          organisation_id?: string
          resolved_merge_values?: Json
          subject_display_name?: string
          subject_id?: string
          suppression_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_recipients_organisation_id_audience_snapshot_id_fkey"
            columns: ["organisation_id", "audience_snapshot_id"]
            isOneToOne: false
            referencedRelation: "audience_snapshots"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "audience_recipients_organisation_id_contact_id_fkey"
            columns: ["organisation_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      audience_snapshots: {
        Row: {
          campaign_id: string
          campaign_version_id: string
          created_at: string
          eligible_count: number
          evaluated_at: string
          excluded_count: number
          id: string
          organisation_id: string
          previous_snapshot_id: string | null
          stage: string
        }
        Insert: {
          campaign_id: string
          campaign_version_id: string
          created_at?: string
          eligible_count: number
          evaluated_at: string
          excluded_count: number
          id?: string
          organisation_id: string
          previous_snapshot_id?: string | null
          stage: string
        }
        Update: {
          campaign_id?: string
          campaign_version_id?: string
          created_at?: string
          eligible_count?: number
          evaluated_at?: string
          excluded_count?: number
          id?: string
          organisation_id?: string
          previous_snapshot_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_snapshots_organisation_id_campaign_id_campaign_ve_fkey"
            columns: ["organisation_id", "campaign_id", "campaign_version_id"]
            isOneToOne: false
            referencedRelation: "campaign_versions"
            referencedColumns: ["organisation_id", "campaign_id", "id"]
          },
          {
            foreignKeyName: "audience_snapshots_organisation_id_previous_snapshot_id_fkey"
            columns: ["organisation_id", "previous_snapshot_id"]
            isOneToOne: false
            referencedRelation: "audience_snapshots"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      campaign_activity_events: {
        Row: {
          actor_membership_id: string
          campaign_id: string
          campaign_version_id: string | null
          event_type: string
          id: string
          note: string | null
          occurred_at: string
          organisation_id: string
          summary: string
        }
        Insert: {
          actor_membership_id: string
          campaign_id: string
          campaign_version_id?: string | null
          event_type: string
          id?: string
          note?: string | null
          occurred_at?: string
          organisation_id: string
          summary: string
        }
        Update: {
          actor_membership_id?: string
          campaign_id?: string
          campaign_version_id?: string | null
          event_type?: string
          id?: string
          note?: string | null
          occurred_at?: string
          organisation_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activity_events_organisation_id_actor_membership__fkey"
            columns: ["organisation_id", "actor_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "campaign_activity_events_organisation_id_campaign_id_fkey"
            columns: ["organisation_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "campaign_activity_events_organisation_id_campaign_version__fkey"
            columns: ["organisation_id", "campaign_version_id"]
            isOneToOne: false
            referencedRelation: "campaign_versions"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      campaign_approvals: {
        Row: {
          approved_at: string
          approving_membership_id: string
          campaign_id: string
          campaign_version_id: string
          eligible_recipient_count: number
          excluded_recipient_count: number
          final_snapshot_id: string
          id: string
          no_delivery_occurred: boolean
          organisation_id: string
          reviewed_snapshot_id: string
        }
        Insert: {
          approved_at?: string
          approving_membership_id: string
          campaign_id: string
          campaign_version_id: string
          eligible_recipient_count: number
          excluded_recipient_count: number
          final_snapshot_id: string
          id?: string
          no_delivery_occurred: boolean
          organisation_id: string
          reviewed_snapshot_id: string
        }
        Update: {
          approved_at?: string
          approving_membership_id?: string
          campaign_id?: string
          campaign_version_id?: string
          eligible_recipient_count?: number
          excluded_recipient_count?: number
          final_snapshot_id?: string
          id?: string
          no_delivery_occurred?: boolean
          organisation_id?: string
          reviewed_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_approvals_organisation_id_approving_membership_id_fkey"
            columns: ["organisation_id", "approving_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "campaign_approvals_organisation_id_campaign_id_campaign_v_fkey1"
            columns: [
              "organisation_id",
              "campaign_id",
              "campaign_version_id",
              "reviewed_snapshot_id",
            ]
            isOneToOne: false
            referencedRelation: "audience_snapshots"
            referencedColumns: [
              "organisation_id",
              "campaign_id",
              "campaign_version_id",
              "id",
            ]
          },
          {
            foreignKeyName: "campaign_approvals_organisation_id_campaign_id_campaign_v_fkey2"
            columns: [
              "organisation_id",
              "campaign_id",
              "campaign_version_id",
              "final_snapshot_id",
            ]
            isOneToOne: false
            referencedRelation: "audience_snapshots"
            referencedColumns: [
              "organisation_id",
              "campaign_id",
              "campaign_version_id",
              "id",
            ]
          },
          {
            foreignKeyName: "campaign_approvals_organisation_id_campaign_id_campaign_ve_fkey"
            columns: ["organisation_id", "campaign_id", "campaign_version_id"]
            isOneToOne: false
            referencedRelation: "campaign_versions"
            referencedColumns: ["organisation_id", "campaign_id", "id"]
          },
        ]
      }
      campaign_versions: {
        Row: {
          audience_source_key: string
          body: string
          campaign_id: string
          channel: string
          created_at: string
          created_by_membership_id: string
          frozen_at: string | null
          id: string
          merge_field_keys: string[]
          organisation_id: string
          purpose_key: string
          state: string
          subject: string | null
          version_number: number
        }
        Insert: {
          audience_source_key: string
          body: string
          campaign_id: string
          channel: string
          created_at?: string
          created_by_membership_id: string
          frozen_at?: string | null
          id?: string
          merge_field_keys?: string[]
          organisation_id: string
          purpose_key: string
          state: string
          subject?: string | null
          version_number: number
        }
        Update: {
          audience_source_key?: string
          body?: string
          campaign_id?: string
          channel?: string
          created_at?: string
          created_by_membership_id?: string
          frozen_at?: string | null
          id?: string
          merge_field_keys?: string[]
          organisation_id?: string
          purpose_key?: string
          state?: string
          subject?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_versions_organisation_id_campaign_id_fkey"
            columns: ["organisation_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "campaign_versions_organisation_id_created_by_membership_id_fkey"
            columns: ["organisation_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          current_version_id: string | null
          id: string
          name: string
          organisation_id: string
          owner_membership_id: string
          status: string
          submitted_version_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          name: string
          organisation_id: string
          owner_membership_id: string
          status: string
          submitted_version_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          id?: string
          name?: string
          organisation_id?: string
          owner_membership_id?: string
          status?: string
          submitted_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organisation_id_id_current_version_id_fkey"
            columns: ["organisation_id", "id", "current_version_id"]
            isOneToOne: false
            referencedRelation: "campaign_versions"
            referencedColumns: ["organisation_id", "campaign_id", "id"]
          },
          {
            foreignKeyName: "campaigns_organisation_id_id_submitted_version_id_fkey"
            columns: ["organisation_id", "id", "submitted_version_id"]
            isOneToOne: false
            referencedRelation: "campaign_versions"
            referencedColumns: ["organisation_id", "campaign_id", "id"]
          },
          {
            foreignKeyName: "campaigns_organisation_id_owner_membership_id_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      consent_evidence: {
        Row: {
          actor_membership_id: string | null
          channel: string
          contact_id: string
          effective_at: string
          evidence_note: string | null
          external_action_confirmed: boolean
          id: string
          organisation_id: string
          provenance: string
          recorded_at: string
          source: string
          status: string
        }
        Insert: {
          actor_membership_id?: string | null
          channel: string
          contact_id: string
          effective_at: string
          evidence_note?: string | null
          external_action_confirmed?: boolean
          id?: string
          organisation_id: string
          provenance: string
          recorded_at?: string
          source: string
          status: string
        }
        Update: {
          actor_membership_id?: string | null
          channel?: string
          contact_id?: string
          effective_at?: string
          evidence_note?: string | null
          external_action_confirmed?: boolean
          id?: string
          organisation_id?: string
          provenance?: string
          recorded_at?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_evidence_organisation_id_actor_membership_id_fkey"
            columns: ["organisation_id", "actor_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "consent_evidence_organisation_id_contact_id_fkey"
            columns: ["organisation_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "consent_evidence_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          email_normalized: string | null
          family_name: string
          given_name: string
          id: string
          organisation_id: string
          phone: string | null
          phone_normalized: string | null
          preferred_contact_method: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          family_name: string
          given_name: string
          id?: string
          organisation_id: string
          phone?: string | null
          phone_normalized?: string | null
          preferred_contact_method?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          family_name?: string
          given_name?: string
          id?: string
          organisation_id?: string
          phone?: string | null
          phone_normalized?: string | null
          preferred_contact_method?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          lifecycle_status: string
          next_action_at: string | null
          organisation_id: string
          owner_membership_id: string | null
          source: string
          updated_at: string
          version: number
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          lifecycle_status: string
          next_action_at?: string | null
          organisation_id: string
          owner_membership_id?: string | null
          source: string
          updated_at?: string
          version?: number
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          lifecycle_status?: string
          next_action_at?: string | null
          organisation_id?: string
          owner_membership_id?: string | null
          source?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_organisation_id_contact_id_fkey"
            columns: ["organisation_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "leads_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organisation_id_owner_membership_id_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      membership_capabilities: {
        Row: {
          capability: string
          granted_at: string
          membership_id: string
          organisation_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          membership_id: string
          organisation_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          membership_id?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_capabilities_organisation_id_membership_id_fkey"
            columns: ["organisation_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_household_members: {
        Row: {
          contact_id: string
          household_id: string
          id: string
          is_primary: boolean
          organisation_id: string
          relationship: string
        }
        Insert: {
          contact_id: string
          household_id: string
          id?: string
          is_primary?: boolean
          organisation_id: string
          relationship: string
        }
        Update: {
          contact_id?: string
          household_id?: string
          id?: string
          is_primary?: boolean
          organisation_id?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_household_members_organisation_id_contact_id_fkey"
            columns: ["organisation_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_household_members_organisation_id_household_id_fkey"
            columns: ["organisation_id", "household_id"]
            isOneToOne: false
            referencedRelation: "mortgage_households"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_households: {
        Row: {
          created_at: string
          display_name: string
          id: string
          organisation_id: string
          owner_membership_id: string
          primary_contact_id: string
          referral_partner_id: string | null
          source_lead_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          organisation_id: string
          owner_membership_id: string
          primary_contact_id: string
          referral_partner_id?: string | null
          source_lead_id?: string | null
          status: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          organisation_id?: string
          owner_membership_id?: string
          primary_contact_id?: string
          referral_partner_id?: string | null
          source_lead_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_households_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mortgage_households_organisation_id_owner_membership_id_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_households_organisation_id_primary_contact_id_fkey"
            columns: ["organisation_id", "primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_households_organisation_id_referral_partner_id_fkey"
            columns: ["organisation_id", "referral_partner_id"]
            isOneToOne: false
            referencedRelation: "mortgage_referral_partners"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_households_source_lead_fkey"
            columns: ["organisation_id", "source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_lead_details: {
        Row: {
          lead_id: string
          loan_purpose: string
          organisation_id: string
          preferred_contact_method: string
          referral_partner_id: string | null
          timeframe: string
        }
        Insert: {
          lead_id: string
          loan_purpose: string
          organisation_id: string
          preferred_contact_method: string
          referral_partner_id?: string | null
          timeframe: string
        }
        Update: {
          lead_id?: string
          loan_purpose?: string
          organisation_id?: string
          preferred_contact_method?: string
          referral_partner_id?: string | null
          timeframe?: string
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_lead_details_organisation_id_lead_id_fkey"
            columns: ["organisation_id", "lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_lead_details_organisation_id_referral_partner_id_fkey"
            columns: ["organisation_id", "referral_partner_id"]
            isOneToOne: false
            referencedRelation: "mortgage_referral_partners"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_lead_household_conversions: {
        Row: {
          converted_at: string
          converted_by_membership_id: string
          household_id: string
          id: string
          lead_id: string
          organisation_id: string
        }
        Insert: {
          converted_at?: string
          converted_by_membership_id: string
          household_id: string
          id?: string
          lead_id: string
          organisation_id: string
        }
        Update: {
          converted_at?: string
          converted_by_membership_id?: string
          household_id?: string
          id?: string
          lead_id?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_lead_household_conve_organisation_id_converted_by_fkey"
            columns: ["organisation_id", "converted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_lead_household_conve_organisation_id_household_id_fkey"
            columns: ["organisation_id", "household_id"]
            isOneToOne: false
            referencedRelation: "mortgage_households"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_lead_household_conversion_organisation_id_lead_id_fkey"
            columns: ["organisation_id", "lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_membership_profiles: {
        Row: {
          membership_id: string
          organisation_id: string
          position: string
        }
        Insert: {
          membership_id: string
          organisation_id: string
          position: string
        }
        Update: {
          membership_id?: string
          organisation_id?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_membership_profiles_organisation_id_membership_id_fkey"
            columns: ["organisation_id", "membership_id"]
            isOneToOne: true
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_minimal_loan_records: {
        Row: {
          created_at: string
          data_confidence: string
          external_reference: string | null
          fixed_rate_expiry_date: string | null
          household_id: string
          id: string
          last_review_date: string | null
          lender_name: string
          loan_purpose: string
          next_review_date: string | null
          organisation_id: string
          owner_membership_id: string
          settlement_date: string | null
          source: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          data_confidence: string
          external_reference?: string | null
          fixed_rate_expiry_date?: string | null
          household_id: string
          id?: string
          last_review_date?: string | null
          lender_name: string
          loan_purpose: string
          next_review_date?: string | null
          organisation_id: string
          owner_membership_id: string
          settlement_date?: string | null
          source: string
          status: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          data_confidence?: string
          external_reference?: string | null
          fixed_rate_expiry_date?: string | null
          household_id?: string
          id?: string
          last_review_date?: string | null
          lender_name?: string
          loan_purpose?: string
          next_review_date?: string | null
          organisation_id?: string
          owner_membership_id?: string
          settlement_date?: string | null
          source?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_minimal_loan_records_organisation_id_household_id_fkey"
            columns: ["organisation_id", "household_id"]
            isOneToOne: false
            referencedRelation: "mortgage_households"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_minimal_loan_records_organisation_id_owner_member_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_referral_partners: {
        Row: {
          created_at: string
          email: string | null
          email_normalized: string | null
          id: string
          name: string
          name_normalized: string
          organisation_id: string
          organisation_name: string | null
          organisation_name_normalized: string | null
          owner_membership_id: string
          partner_type: string
          phone: string | null
          phone_normalized: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          name: string
          name_normalized: string
          organisation_id: string
          organisation_name?: string | null
          organisation_name_normalized?: string | null
          owner_membership_id: string
          partner_type: string
          phone?: string | null
          phone_normalized?: string | null
          status: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          name?: string
          name_normalized?: string
          organisation_id?: string
          organisation_name?: string | null
          organisation_name_normalized?: string | null
          owner_membership_id?: string
          partner_type?: string
          phone?: string | null
          phone_normalized?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_referral_partners_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mortgage_referral_partners_organisation_id_owner_membershi_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      mortgage_review_opportunities: {
        Row: {
          household_id: string
          loan_record_id: string
          opportunity_id: string
          organisation_id: string
          trigger_date: string
          trigger_type: string
        }
        Insert: {
          household_id: string
          loan_record_id: string
          opportunity_id: string
          organisation_id: string
          trigger_date: string
          trigger_type: string
        }
        Update: {
          household_id?: string
          loan_record_id?: string
          opportunity_id?: string
          organisation_id?: string
          trigger_date?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_review_opportunities_organisation_id_household_id_fkey"
            columns: ["organisation_id", "household_id"]
            isOneToOne: false
            referencedRelation: "mortgage_households"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_review_opportunities_organisation_id_loan_record__fkey"
            columns: ["organisation_id", "loan_record_id"]
            isOneToOne: false
            referencedRelation: "mortgage_minimal_loan_records"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "mortgage_review_opportunities_organisation_id_opportunity__fkey"
            columns: ["organisation_id", "opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      operation_commands: {
        Row: {
          actor_membership_id: string
          actor_user_id: string
          command_id: string
          created_at: string
          operation_type: string
          organisation_id: string
          request_fingerprint: string | null
          result: Json | null
        }
        Insert: {
          actor_membership_id: string
          actor_user_id: string
          command_id: string
          created_at?: string
          operation_type: string
          organisation_id: string
          request_fingerprint?: string | null
          result?: Json | null
        }
        Update: {
          actor_membership_id?: string
          actor_user_id?: string
          command_id?: string
          created_at?: string
          operation_type?: string
          organisation_id?: string
          request_fingerprint?: string | null
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_commands_organisation_id_actor_membership_id_fkey"
            columns: ["organisation_id", "actor_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "operation_commands_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          completed_at: string | null
          created_at: string
          dismissal_reason: string | null
          id: string
          lifecycle_status: string
          opportunity_type: string
          organisation_id: string
          owner_membership_id: string | null
          subject_id: string
          subject_type: string
          trigger_date: string
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          lifecycle_status: string
          opportunity_type: string
          organisation_id: string
          owner_membership_id?: string | null
          subject_id: string
          subject_type: string
          trigger_date: string
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dismissal_reason?: string | null
          id?: string
          lifecycle_status?: string
          opportunity_type?: string
          organisation_id?: string
          owner_membership_id?: string | null
          subject_id?: string
          subject_type?: string
          trigger_date?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organisation_id_owner_membership_id_fkey"
            columns: ["organisation_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      organisation_memberships: {
        Row: {
          created_at: string
          display_name: string
          id: string
          organisation_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          organisation_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          organisation_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          region: string | null
          short_name: string
          status: string
          vertical_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          region?: string | null
          short_name: string
          status: string
          vertical_key: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          short_name?: string
          status?: string
          vertical_key?: string
        }
        Relationships: []
      }
      recipient_eligibility_reasons: {
        Row: {
          audience_recipient_id: string
          display_reason: string
          id: string
          is_primary: boolean
          organisation_id: string
          reason_code: string
          reason_order: number
        }
        Insert: {
          audience_recipient_id: string
          display_reason: string
          id?: string
          is_primary?: boolean
          organisation_id: string
          reason_code: string
          reason_order: number
        }
        Update: {
          audience_recipient_id?: string
          display_reason?: string
          id?: string
          is_primary?: boolean
          organisation_id?: string
          reason_code?: string
          reason_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipient_eligibility_reasons_organisation_id_audience_rec_fkey"
            columns: ["organisation_id", "audience_recipient_id"]
            isOneToOne: false
            referencedRelation: "audience_recipients"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      suppression_history: {
        Row: {
          actor_membership_id: string | null
          channel: string | null
          contact_id: string | null
          effective_at: string
          id: string
          organisation_id: string
          reason: string | null
          recorded_at: string
          scope: string
          source: string
          status: string
        }
        Insert: {
          actor_membership_id?: string | null
          channel?: string | null
          contact_id?: string | null
          effective_at: string
          id?: string
          organisation_id: string
          reason?: string | null
          recorded_at?: string
          scope: string
          source: string
          status: string
        }
        Update: {
          actor_membership_id?: string | null
          channel?: string | null
          contact_id?: string | null
          effective_at?: string
          id?: string
          organisation_id?: string
          reason?: string | null
          recorded_at?: string
          scope?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_history_organisation_id_actor_membership_id_fkey"
            columns: ["organisation_id", "actor_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "suppression_history_organisation_id_contact_id_fkey"
            columns: ["organisation_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "suppression_history_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_membership_id: string
          created_at: string
          created_by_membership_id: string
          due_at: string
          household_id: string | null
          id: string
          lead_id: string | null
          mortgage_household_id: string | null
          mortgage_review_opportunity_id: string | null
          opportunity_id: string | null
          organisation_id: string
          priority: string
          status: string
          subject_id: string | null
          subject_type: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          assigned_membership_id: string
          created_at?: string
          created_by_membership_id: string
          due_at: string
          household_id?: string | null
          id?: string
          lead_id?: string | null
          mortgage_household_id?: string | null
          mortgage_review_opportunity_id?: string | null
          opportunity_id?: string | null
          organisation_id: string
          priority: string
          status: string
          subject_id?: string | null
          subject_type?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_membership_id?: string
          created_at?: string
          created_by_membership_id?: string
          due_at?: string
          household_id?: string | null
          id?: string
          lead_id?: string | null
          mortgage_household_id?: string | null
          mortgage_review_opportunity_id?: string | null
          opportunity_id?: string | null
          organisation_id?: string
          priority?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_household_tenant_fkey"
            columns: ["organisation_id", "household_id"]
            isOneToOne: false
            referencedRelation: "mortgage_households"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_assigned_membership_id_fkey"
            columns: ["organisation_id", "assigned_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_created_by_membership_id_fkey"
            columns: ["organisation_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organisation_memberships"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_lead_id_fkey"
            columns: ["organisation_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organisation_id", "id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_opportunity_id_fkey"
            columns: ["organisation_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["organisation_id", "id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_lead_note: {
        Args: {
          command_id: string
          expected_version: number
          lead_id: string
          note: string
          organisation_id: string
        }
        Returns: Json
      }
      add_mortgage_household_member: {
        Args: {
          command_id: string
          email: string
          existing_contact_id: string
          expected_household_version: number
          first_name: string
          household_id: string
          last_name: string
          member_mode: string
          name_match_acknowledged: boolean
          organisation_id: string
          phone: string
          preferred_contact_method: string
          relationship: string
        }
        Returns: Json
      }
      add_mortgage_minimal_loan_record: {
        Args: {
          command_id: string
          data_confidence: string
          external_reference: string
          fixed_rate_expiry_date: string
          household_id: string
          last_review_date: string
          lender_name: string
          loan_purpose: string
          loan_status: string
          next_review_date: string
          organisation_id: string
          settlement_date: string
        }
        Returns: Json
      }
      assign_lead: {
        Args: {
          command_id: string
          expected_version: number
          lead_id: string
          organisation_id: string
          target_membership_id: string
        }
        Returns: Json
      }
      assign_mortgage_household_owner: {
        Args: {
          command_id: string
          expected_version: number
          household_id: string
          organisation_id: string
          target_membership_id: string
        }
        Returns: Json
      }
      assign_mortgage_referral_partner_owner: {
        Args: {
          command_id: string
          expected_version: number
          organisation_id: string
          referral_partner_id: string
          target_membership_id: string
        }
        Returns: Json
      }
      assign_mortgage_review_opportunity: {
        Args: {
          command_id: string
          expected_version: number
          opportunity_id: string
          organisation_id: string
          target_membership_id: string
        }
        Returns: Json
      }
      book_discovery_appointment: {
        Args: {
          assigned_membership_id: string
          command_id: string
          duration_minutes: number
          expected_version: number
          lead_id: string
          location_or_link?: string
          meeting_method: string
          notes?: string
          organisation_id: string
          starts_at: string
        }
        Returns: Json
      }
      claim_lead: {
        Args: {
          command_id: string
          expected_version: number
          lead_id: string
          organisation_id: string
        }
        Returns: Json
      }
      claim_mortgage_review_opportunity: {
        Args: {
          command_id: string
          expected_version: number
          opportunity_id: string
          organisation_id: string
        }
        Returns: Json
      }
      convert_mortgage_lead_to_household: {
        Args: {
          command_id: string
          display_name: string
          duplicate_decision: string
          existing_household_id?: string
          expected_version: number
          joint_contact_id?: string
          joint_email?: string
          joint_first_name?: string
          joint_last_name?: string
          joint_phone?: string
          joint_preferred_contact_method?: string
          joint_relationship?: string
          lead_id: string
          loan_data_confidence?: string
          loan_external_reference?: string
          loan_fixed_rate_expiry_date?: string
          loan_last_review_date?: string
          loan_lender_name?: string
          loan_next_review_date?: string
          loan_purpose?: string
          loan_settlement_date?: string
          loan_status?: string
          organisation_id: string
          owner_membership_id: string
          referral_partner_id?: string
        }
        Returns: Json
      }
      create_lead_task: {
        Args: {
          assigned_membership_id: string
          command_id: string
          due_at: string
          expected_version: number
          lead_id: string
          organisation_id: string
          priority: string
          title: string
        }
        Returns: Json
      }
      create_mortgage_household_manual: {
        Args: {
          command_id: string
          display_name: string
          joint_email: string
          joint_existing_contact_id: string
          joint_first_name: string
          joint_last_name: string
          joint_mode: string
          joint_name_match_acknowledged: boolean
          joint_phone: string
          joint_preferred_contact_method: string
          joint_relationship: string
          organisation_id: string
          owner_membership_id: string
          primary_email: string
          primary_existing_contact_id: string
          primary_first_name: string
          primary_last_name: string
          primary_name_match_acknowledged: boolean
          primary_phone: string
          primary_preferred_contact_method: string
          referral_partner_id: string
        }
        Returns: Json
      }
      create_mortgage_household_task: {
        Args: {
          assigned_membership_id: string
          command_id: string
          due_at: string
          household_id: string
          organisation_id: string
          priority: string
          title: string
        }
        Returns: Json
      }
      create_mortgage_lead: {
        Args: {
          command_id: string
          email: string
          first_name: string
          last_name: string
          loan_purpose: string
          organisation_id: string
          owner_membership_id?: string
          phone: string
          preferred_contact_method: string
          source: string
          timeframe: string
        }
        Returns: Json
      }
      create_mortgage_referral_partner: {
        Args: {
          command_id: string
          duplicate_name_acknowledged?: boolean
          email: string
          name: string
          organisation_id: string
          organisation_name: string
          owner_membership_id: string
          partner_type: string
          phone: string
        }
        Returns: Json
      }
      find_mortgage_lead_household_duplicates: {
        Args: { p_lead_id: string; p_organisation_id: string }
        Returns: {
          contact_id: string
          contact_name: string
          household_id: string
          household_name: string
          reasons: string[]
        }[]
      }
      list_mortgage_household_review_opportunities: {
        Args: { p_household_id: string; p_organisation_id: string }
        Returns: {
          completed_at: string
          dismissal_reason: string
          effective_status: string
          loan_record_id: string
          opportunity_id: string
          owner_membership_id: string
          owner_name: string
          trigger_date: string
          trigger_type: string
          version: number
        }[]
      }
      list_mortgage_households: {
        Args: {
          p_organisation_id: string
          p_owner_membership_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: string
        }
        Returns: Json
      }
      preview_mortgage_manual_contact_duplicates: {
        Args: {
          p_email: string
          p_family_name: string
          p_given_name: string
          p_organisation_id: string
          p_phone: string
        }
        Returns: {
          contact_id: string
          contact_name: string
          email: string
          households: Json
          phone: string
          reasons: string[]
        }[]
      }
      preview_mortgage_referral_partner_duplicates: {
        Args: {
          p_email: string
          p_name: string
          p_organisation_id: string
          p_organisation_name: string
        }
        Returns: {
          email: string
          organisation_name: string
          partner_name: string
          reasons: string[]
          referral_partner_id: string
          status: string
        }[]
      }
      read_mortgage_retention_today: {
        Args: { p_limit?: number; p_organisation_id: string }
        Returns: Json
      }
      record_contact_attempt: {
        Args: {
          channel: string
          command_id: string
          expected_version: number
          lead_id: string
          next_action_at?: string
          note?: string
          organisation_id: string
          outcome: string
        }
        Returns: Json
      }
      search_mortgage_contact_options: {
        Args: {
          p_exclude_household_id?: string
          p_organisation_id: string
          p_search_term: string
        }
        Returns: {
          contact_id: string
          contact_name: string
          email: string
          phone: string
        }[]
      }
      set_mortgage_lead_referral_partner: {
        Args: {
          command_id: string
          expected_version: number
          lead_id: string
          organisation_id: string
          referral_partner_id: string
        }
        Returns: Json
      }
      transition_lead: {
        Args: {
          command_id: string
          expected_version: number
          lead_id: string
          next_status: string
          note?: string
          organisation_id: string
        }
        Returns: Json
      }
      transition_mortgage_household_status: {
        Args: {
          command_id: string
          expected_version: number
          household_id: string
          organisation_id: string
          target_status: string
        }
        Returns: Json
      }
      transition_mortgage_household_task: {
        Args: {
          command_id: string
          expected_version: number
          organisation_id: string
          target_status: string
          task_id: string
        }
        Returns: Json
      }
      transition_mortgage_referral_partner: {
        Args: {
          command_id: string
          expected_version: number
          organisation_id: string
          referral_partner_id: string
          target_status: string
        }
        Returns: Json
      }
      transition_mortgage_review_opportunity: {
        Args: {
          command_id: string
          dismissal_reason?: string
          expected_version: number
          opportunity_id: string
          organisation_id: string
          target_status: string
        }
        Returns: Json
      }
      update_mortgage_household_details: {
        Args: {
          command_id: string
          display_name: string
          expected_version: number
          household_id: string
          organisation_id: string
          referral_partner_id: string
        }
        Returns: Json
      }
      update_mortgage_loan_review_dates: {
        Args: {
          command_id: string
          expected_version: number
          fixed_rate_expiry_date: string
          last_review_date: string
          loan_record_id: string
          next_review_date: string
          organisation_id: string
        }
        Returns: Json
      }
      update_mortgage_primary_contact: {
        Args: {
          command_id: string
          email: string
          expected_contact_version: number
          expected_household_version: number
          household_id: string
          organisation_id: string
          phone: string
          preferred_contact_method: string
        }
        Returns: Json
      }
      update_mortgage_referral_partner: {
        Args: {
          command_id: string
          email: string
          expected_version: number
          name: string
          organisation_id: string
          organisation_name: string
          partner_type: string
          phone: string
          referral_partner_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
