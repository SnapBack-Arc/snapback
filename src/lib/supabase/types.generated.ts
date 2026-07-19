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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["admin_action"]
          admin_wallet_id: string
          amount_usdc: number | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["admin_action"]
          admin_wallet_id: string
          amount_usdc?: number | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["admin_action"]
          admin_wallet_id?: string
          amount_usdc?: number | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_wallet_id_fkey"
            columns: ["admin_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      app_wallets: {
        Row: {
          account_type: string
          address: string
          blockchain: string
          circle_wallet_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_wallet_role"]
          updated_at: string
        }
        Insert: {
          account_type?: string
          address: string
          blockchain?: string
          circle_wallet_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_wallet_role"]
          updated_at?: string
        }
        Update: {
          account_type?: string
          address?: string
          blockchain?: string
          circle_wallet_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_wallet_role"]
          updated_at?: string
        }
        Relationships: []
      }
      buyer_dispute_stats: {
        Row: {
          consecutive_losses: number
          disputes_filed: number
          disputes_lost: number
          disputes_won: number
          scrutiny_flagged: boolean
          updated_at: string
          wallet_id: string
        }
        Insert: {
          consecutive_losses?: number
          disputes_filed?: number
          disputes_lost?: number
          disputes_won?: number
          scrutiny_flagged?: boolean
          updated_at?: string
          wallet_id: string
        }
        Update: {
          consecutive_losses?: number
          disputes_filed?: number
          disputes_lost?: number
          disputes_won?: number
          scrutiny_flagged?: boolean
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_dispute_stats_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: true
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          dispute_kind: Database["public"]["Enums"]["dispute_kind"]
          educational_feedback: Json | null
          evidence: Json
          filing_fee_payment_id: string | null
          filing_fee_usdc: number | null
          id: string
          insurance_payout_payment_id: string | null
          insurance_payout_usdc: number | null
          opened_by_wallet: string
          outcome: Database["public"]["Enums"]["dispute_outcome"]
          reason: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          task_id: string
          updated_at: string
          validator_reasoning_snapshot: Json | null
        }
        Insert: {
          created_at?: string
          dispute_kind?: Database["public"]["Enums"]["dispute_kind"]
          educational_feedback?: Json | null
          evidence?: Json
          filing_fee_payment_id?: string | null
          filing_fee_usdc?: number | null
          id?: string
          insurance_payout_payment_id?: string | null
          insurance_payout_usdc?: number | null
          opened_by_wallet: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"]
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          task_id: string
          updated_at?: string
          validator_reasoning_snapshot?: Json | null
        }
        Update: {
          created_at?: string
          dispute_kind?: Database["public"]["Enums"]["dispute_kind"]
          educational_feedback?: Json | null
          evidence?: Json
          filing_fee_payment_id?: string | null
          filing_fee_usdc?: number | null
          id?: string
          insurance_payout_payment_id?: string | null
          insurance_payout_usdc?: number | null
          opened_by_wallet?: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"]
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          task_id?: string
          updated_at?: string
          validator_reasoning_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_filing_fee_payment_id_fkey"
            columns: ["filing_fee_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_insurance_payout_payment_id_fkey"
            columns: ["insurance_payout_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_wallet_fkey"
            columns: ["opened_by_wallet"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_attempts: {
        Row: {
          attempt_no: number
          charged_usdc: number
          created_at: string
          gate_result: Database["public"]["Enums"]["estimator_gate_result"]
          id: string
          parsed_spec: Json
          payment_id: string | null
          raw_text: string
          session_id: string
        }
        Insert: {
          attempt_no: number
          charged_usdc?: number
          created_at?: string
          gate_result: Database["public"]["Enums"]["estimator_gate_result"]
          id?: string
          parsed_spec?: Json
          payment_id?: string | null
          raw_text: string
          session_id: string
        }
        Update: {
          attempt_no?: number
          charged_usdc?: number
          created_at?: string
          gate_result?: Database["public"]["Enums"]["estimator_gate_result"]
          id?: string
          parsed_spec?: Json
          payment_id?: string | null
          raw_text?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimator_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "estimator_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimator_sessions: {
        Row: {
          attempt_count: number
          category: Database["public"]["Enums"]["listing_category"]
          created_at: string
          difficulty: number
          disclosed_contingent_fee_pct: number | null
          escrow_held_usdc: number
          guaranteed_total_usdc: number | null
          happy_path_fee_usdc: number | null
          id: string
          last_activity_at: string
          matched_listing_ids: Json
          normalized_spec: Json
          payer_wallet_id: string
          scope_quantity: number | null
          seller_cost_estimate_usdc: number | null
          status: Database["public"]["Enums"]["estimator_session_status"]
          subject: string
          subject_key: string
          task_id: string | null
          treasury_swept_usdc: number
          updated_at: string
          validation_fee_usdc: number | null
        }
        Insert: {
          attempt_count?: number
          category: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          difficulty: number
          disclosed_contingent_fee_pct?: number | null
          escrow_held_usdc?: number
          guaranteed_total_usdc?: number | null
          happy_path_fee_usdc?: number | null
          id?: string
          last_activity_at?: string
          matched_listing_ids?: Json
          normalized_spec?: Json
          payer_wallet_id: string
          scope_quantity?: number | null
          seller_cost_estimate_usdc?: number | null
          status?: Database["public"]["Enums"]["estimator_session_status"]
          subject: string
          subject_key: string
          task_id?: string | null
          treasury_swept_usdc?: number
          updated_at?: string
          validation_fee_usdc?: number | null
        }
        Update: {
          attempt_count?: number
          category?: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          difficulty?: number
          disclosed_contingent_fee_pct?: number | null
          escrow_held_usdc?: number
          guaranteed_total_usdc?: number | null
          happy_path_fee_usdc?: number | null
          id?: string
          last_activity_at?: string
          matched_listing_ids?: Json
          normalized_spec?: Json
          payer_wallet_id?: string
          scope_quantity?: number | null
          seller_cost_estimate_usdc?: number | null
          status?: Database["public"]["Enums"]["estimator_session_status"]
          subject?: string
          subject_key?: string
          task_id?: string | null
          treasury_swept_usdc?: number
          updated_at?: string
          validation_fee_usdc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estimator_sessions_payer_wallet_id_fkey"
            columns: ["payer_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimator_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_pool_adjustments: {
        Row: {
          admin_wallet_id: string
          amount_usdc: number
          created_at: string
          direction: Database["public"]["Enums"]["insurance_pool_direction"]
          id: string
          reason: string | null
        }
        Insert: {
          admin_wallet_id: string
          amount_usdc: number
          created_at?: string
          direction: Database["public"]["Enums"]["insurance_pool_direction"]
          id?: string
          reason?: string | null
        }
        Update: {
          admin_wallet_id?: string
          amount_usdc?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["insurance_pool_direction"]
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_pool_adjustments_admin_wallet_id_fkey"
            columns: ["admin_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          block_height: number | null
          contract: string
          created_at: string
          event_name: string
          id: string
          job_id: string
          payload: Json
          task_id: string | null
          tx_hash: string | null
        }
        Insert: {
          block_height?: number | null
          contract: string
          created_at?: string
          event_name: string
          id?: string
          job_id: string
          payload?: Json
          task_id?: string | null
          tx_hash?: string | null
        }
        Update: {
          block_height?: number | null
          contract?: string
          created_at?: string
          event_name?: string
          id?: string
          job_id?: string
          payload?: Json
          task_id?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_votes: {
        Row: {
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at: string
          dispute_id: string
          id: string
          judge_wallet_id: string
          rationale: string | null
          weight: number
        }
        Insert: {
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          dispute_id: string
          id?: string
          judge_wallet_id: string
          rationale?: string | null
          weight?: number
        }
        Update: {
          choice?: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          dispute_id?: string
          id?: string
          judge_wallet_id?: string
          rationale?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "judge_votes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_votes_judge_wallet_id_fkey"
            columns: ["judge_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["listing_category"]
          created_at: string
          description: string | null
          id: string
          price_usdc: number | null
          seller_wallet_id: string
          sla: Json
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          description?: string | null
          id?: string
          price_usdc?: number | null
          seller_wallet_id: string
          sla?: Json
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          description?: string | null
          id?: string
          price_usdc?: number | null
          seller_wallet_id?: string
          sla?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_wallet_id_fkey"
            columns: ["seller_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_usdc: number
          chain_id: number
          circle_tx_id: string | null
          created_at: string
          error: string | null
          from_wallet_id: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          metadata: Json
          status: Database["public"]["Enums"]["payment_status"]
          task_id: string | null
          to_wallet_id: string | null
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount_usdc: number
          chain_id?: number
          circle_tx_id?: string | null
          created_at?: string
          error?: string | null
          from_wallet_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["payment_kind"]
          metadata?: Json
          status?: Database["public"]["Enums"]["payment_status"]
          task_id?: string | null
          to_wallet_id?: string | null
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount_usdc?: number
          chain_id?: number
          circle_tx_id?: string | null
          created_at?: string
          error?: string | null
          from_wallet_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          metadata?: Json
          status?: Database["public"]["Enums"]["payment_status"]
          task_id?: string | null
          to_wallet_id?: string | null
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          accuracy_tolerance: number | null
          active: boolean
          auto_release_hours: number | null
          created_at: string
          daily_limit_usdc: number | null
          id: string
          max_amount_usdc: number | null
          metadata: Json
          name: string
          requires_judges: boolean
          snapback_window_hours: number | null
          updated_at: string
          wallet_id: string
        }
        Insert: {
          accuracy_tolerance?: number | null
          active?: boolean
          auto_release_hours?: number | null
          created_at?: string
          daily_limit_usdc?: number | null
          id?: string
          max_amount_usdc?: number | null
          metadata?: Json
          name: string
          requires_judges?: boolean
          snapback_window_hours?: number | null
          updated_at?: string
          wallet_id: string
        }
        Update: {
          accuracy_tolerance?: number | null
          active?: boolean
          auto_release_hours?: number | null
          created_at?: string
          daily_limit_usdc?: number | null
          id?: string
          max_amount_usdc?: number | null
          metadata?: Json
          name?: string
          requires_judges?: boolean
          snapback_window_hours?: number | null
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted: boolean
          amount_usdc: number
          created_at: string
          estimated_seconds: number | null
          expires_at: string | null
          id: string
          note: string | null
          payee_wallet_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          accepted?: boolean
          amount_usdc: number
          created_at?: string
          estimated_seconds?: number | null
          expires_at?: string | null
          id?: string
          note?: string | null
          payee_wallet_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          accepted?: boolean
          amount_usdc?: number
          created_at?: string
          estimated_seconds?: number | null
          expires_at?: string | null
          id?: string
          note?: string | null
          payee_wallet_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_payee_wallet_id_fkey"
            columns: ["payee_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation: {
        Row: {
          disputes_lost: number
          disputes_won: number
          id: string
          score: number
          tasks_completed: number
          tasks_disputed: number
          total_clawed_usdc: number
          total_earned_usdc: number
          updated_at: string
          wallet_id: string
        }
        Insert: {
          disputes_lost?: number
          disputes_won?: number
          id?: string
          score?: number
          tasks_completed?: number
          tasks_disputed?: number
          total_clawed_usdc?: number
          total_earned_usdc?: number
          updated_at?: string
          wallet_id: string
        }
        Update: {
          disputes_lost?: number
          disputes_won?: number
          id?: string
          score?: number
          tasks_completed?: number
          tasks_disputed?: number
          total_clawed_usdc?: number
          total_earned_usdc?: number
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reputation_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: true
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          accepted_at: string | null
          amount_usdc: number | null
          created_at: string
          deadline_at: string | null
          description: string | null
          disclosed_contingent_fee_pct: number | null
          guaranteed_total_usdc: number | null
          id: string
          listing_id: string | null
          metadata: Json
          payee_wallet_id: string | null
          payer_wallet_id: string
          policy_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          validation_fee_usdc: number | null
        }
        Insert: {
          accepted_at?: string | null
          amount_usdc?: number | null
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          disclosed_contingent_fee_pct?: number | null
          guaranteed_total_usdc?: number | null
          id?: string
          listing_id?: string | null
          metadata?: Json
          payee_wallet_id?: string | null
          payer_wallet_id: string
          policy_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          validation_fee_usdc?: number | null
        }
        Update: {
          accepted_at?: string | null
          amount_usdc?: number | null
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          disclosed_contingent_fee_pct?: number | null
          guaranteed_total_usdc?: number | null
          id?: string
          listing_id?: string | null
          metadata?: Json
          payee_wallet_id?: string | null
          payer_wallet_id?: string
          policy_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          validation_fee_usdc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_payee_wallet_id_fkey"
            columns: ["payee_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_payer_wallet_id_fkey"
            columns: ["payer_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          circle_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          circle_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          updated_at?: string
        }
        Update: {
          circle_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      validations: {
        Row: {
          created_at: string
          deliverable: Json | null
          deliverable_hash: string | null
          erc8183_job_id: string | null
          failures: Json
          id: string
          outcome: Database["public"]["Enums"]["validation_outcome"]
          policy_pass: boolean
          rationale: string | null
          sla_pass: boolean
          task_id: string
          task_pass: boolean
        }
        Insert: {
          created_at?: string
          deliverable?: Json | null
          deliverable_hash?: string | null
          erc8183_job_id?: string | null
          failures?: Json
          id?: string
          outcome: Database["public"]["Enums"]["validation_outcome"]
          policy_pass: boolean
          rationale?: string | null
          sla_pass: boolean
          task_id: string
          task_pass: boolean
        }
        Update: {
          created_at?: string
          deliverable?: Json | null
          deliverable_hash?: string | null
          erc8183_job_id?: string | null
          failures?: Json
          id?: string
          outcome?: Database["public"]["Enums"]["validation_outcome"]
          policy_pass?: boolean
          rationale?: string | null
          sla_pass?: boolean
          task_id?: string
          task_pass?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "validations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_flags: {
        Row: {
          created_at: string
          flagged: boolean
          flagged_by_wallet_id: string | null
          reason: string | null
          updated_at: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          flagged?: boolean
          flagged_by_wallet_id?: string | null
          reason?: string | null
          updated_at?: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          flagged?: boolean
          flagged_by_wallet_id?: string | null
          reason?: string | null
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_flags_flagged_by_wallet_id_fkey"
            columns: ["flagged_by_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_flags_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: true
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          account_type: string
          address: string
          blockchain: string
          circle_wallet_id: string
          control: Database["public"]["Enums"]["wallet_control"]
          created_at: string
          id: string
          label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          address: string
          blockchain?: string
          circle_wallet_id: string
          control?: Database["public"]["Enums"]["wallet_control"]
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          address?: string
          blockchain?: string
          circle_wallet_id?: string
          control?: Database["public"]["Enums"]["wallet_control"]
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_notifications_log: {
        Row: {
          error: string | null
          notification_id: string
          notification_type: string
          processed_at: string | null
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          notification_id: string
          notification_type: string
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          notification_id?: string
          notification_type?: string
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      admin_action:
        | "flag_user"
        | "unflag_user"
        | "manual_sweep_session"
        | "sweep_all_abandoned"
        | "revalidate_task"
        | "force_resolve_dispute"
        | "trigger_auto_release"
        | "insurance_pool_top_up"
        | "insurance_pool_withdraw"
      app_wallet_role: "delegate" | "treasury" | "arbiter"
      dispute_kind: "standard" | "post_approval_contest"
      dispute_outcome: "pending" | "favor_payer" | "favor_payee" | "split"
      dispute_status: "open" | "voting" | "resolved" | "rejected"
      estimator_gate_result:
        | "original"
        | "retry_free"
        | "retry_charged"
        | "topic_change"
      estimator_session_status: "active" | "credited" | "swept" | "abandoned"
      insurance_pool_direction: "top_up" | "withdraw"
      listing_category:
        | "research_sourcing"
        | "copywriting_content"
        | "market_research_report"
        | "icon_illustration_design"
        | "data_engineering_scripts"
      payment_kind:
        | "deposit"
        | "escrow"
        | "release"
        | "refund"
        | "snapback"
        | "nanopayment"
        | "gas"
        | "quote_fee"
        | "treasury_sweep"
        | "filing_fee"
        | "judge_fee"
        | "platform_fee"
        | "insurance_payout"
        | "submission"
        | "validation_fee"
        | "dispute_contingency"
      payment_status:
        | "pending"
        | "escrowed"
        | "released"
        | "refunded"
        | "snapped_back"
        | "failed"
      task_status:
        | "draft"
        | "open"
        | "quoted"
        | "assigned"
        | "in_progress"
        | "submitted"
        | "accepted"
        | "disputed"
        | "resolved"
        | "cancelled"
      validation_outcome: "approved" | "disputed"
      vote_choice: "favor_payer" | "favor_payee" | "abstain"
      wallet_control: "developer" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_action: [
        "flag_user",
        "unflag_user",
        "manual_sweep_session",
        "sweep_all_abandoned",
        "revalidate_task",
        "force_resolve_dispute",
        "trigger_auto_release",
        "insurance_pool_top_up",
        "insurance_pool_withdraw",
      ],
      app_wallet_role: ["delegate", "treasury", "arbiter"],
      dispute_kind: ["standard", "post_approval_contest"],
      dispute_outcome: ["pending", "favor_payer", "favor_payee", "split"],
      dispute_status: ["open", "voting", "resolved", "rejected"],
      estimator_gate_result: [
        "original",
        "retry_free",
        "retry_charged",
        "topic_change",
      ],
      estimator_session_status: ["active", "credited", "swept", "abandoned"],
      insurance_pool_direction: ["top_up", "withdraw"],
      listing_category: [
        "research_sourcing",
        "copywriting_content",
        "market_research_report",
        "icon_illustration_design",
        "data_engineering_scripts",
      ],
      payment_kind: [
        "deposit",
        "escrow",
        "release",
        "refund",
        "snapback",
        "nanopayment",
        "gas",
        "quote_fee",
        "treasury_sweep",
        "filing_fee",
        "judge_fee",
        "platform_fee",
        "insurance_payout",
        "submission",
        "validation_fee",
        "dispute_contingency",
      ],
      payment_status: [
        "pending",
        "escrowed",
        "released",
        "refunded",
        "snapped_back",
        "failed",
      ],
      task_status: [
        "draft",
        "open",
        "quoted",
        "assigned",
        "in_progress",
        "submitted",
        "accepted",
        "disputed",
        "resolved",
        "cancelled",
      ],
      validation_outcome: ["approved", "disputed"],
      vote_choice: ["favor_payer", "favor_payee", "abstain"],
      wallet_control: ["developer", "user"],
    },
  },
} as const
