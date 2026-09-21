// Generated from the Supabase schema. Regenerated from the DEMO project so the
// shared tables (invoices/calls/arrangements/call_queue) plus the demo-only
// demo_calls table and the guard/dialer RPCs are all typed. The shared tables are
// identical on staging (all Phase F migrations are applied to both).
//   npx supabase gen types typescript --project-id <id> > lib/types/database.ts

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      arrangements: {
        Row: {
          approved_at: string | null
          client_agreed: boolean
          created_at: string
          executed_at: string | null
          human_approved: boolean
          id: string
          invoice_id: string
          proposed_terms: string
          rejected_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          client_agreed?: boolean
          created_at?: string
          executed_at?: string | null
          human_approved?: boolean
          id?: string
          invoice_id: string
          proposed_terms: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          client_agreed?: boolean
          created_at?: string
          executed_at?: string | null
          human_approved?: boolean
          id?: string
          invoice_id?: string
          proposed_terms?: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrangements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      call_queue: {
        Row: {
          approved_at: string | null
          attempts: number
          batch_id: string | null
          call_id: string | null
          created_at: string
          dialed_at: string | null
          drafted_at: string
          expires_at: string
          id: string
          invoice_id: string
          scheduled_for: string
          script: string
          status: string
          to_phone: string | null
          to_region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          attempts?: number
          batch_id?: string | null
          call_id?: string | null
          created_at?: string
          dialed_at?: string | null
          drafted_at?: string
          expires_at: string
          id?: string
          invoice_id: string
          scheduled_for: string
          script: string
          status?: string
          to_phone?: string | null
          to_region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          attempts?: number
          batch_id?: string | null
          call_id?: string | null
          created_at?: string
          dialed_at?: string | null
          drafted_at?: string
          expires_at?: string
          id?: string
          invoice_id?: string
          scheduled_for?: string
          script?: string
          status?: string
          to_phone?: string | null
          to_region?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_queue_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          calle_call_id: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          invoice_id: string
          outcome: string | null
          started_at: string
          transcript_ref: string | null
          user_id: string
        }
        Insert: {
          calle_call_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invoice_id: string
          outcome?: string | null
          started_at: string
          transcript_ref?: string | null
          user_id: string
        }
        Update: {
          calle_call_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          invoice_id?: string
          outcome?: string | null
          started_at?: string
          transcript_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_calls: {
        Row: {
          calle_call_id: string | null
          created_at: string
          destination_masked: string
          id: string
          ip_hash: string
          outcome: string | null
          region: string | null
          status: string
        }
        Insert: {
          calle_call_id?: string | null
          created_at?: string
          destination_masked: string
          id?: string
          ip_hash: string
          outcome?: string | null
          region?: string | null
          status?: string
        }
        Update: {
          calle_call_id?: string | null
          created_at?: string
          destination_masked?: string
          id?: string
          ip_hash?: string
          outcome?: string | null
          region?: string | null
          status?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          client_name: string
          client_phone: string | null
          client_region: string | null
          created_at: string
          currency: string
          due_date: string
          id: string
          language_preference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client_name: string
          client_phone?: string | null
          client_region?: string | null
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          language_preference?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_name?: string
          client_phone?: string | null
          client_region?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          language_preference?: string
          status?: string
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
      claim_next_call: {
        Args: {
          p_allowed_regions: string[]
          p_dest_cap: number
          p_now: string
          p_stale_minutes: number
        }
        Returns: {
          approved_at: string | null
          attempts: number
          batch_id: string | null
          call_id: string | null
          created_at: string
          dialed_at: string | null
          drafted_at: string
          expires_at: string
          id: string
          invoice_id: string
          scheduled_for: string
          script: string
          status: string
          to_phone: string | null
          to_region: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "call_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      demo_call_budget: { Args: { p_budget: number }; Returns: Json }
      finalize_demo_call: {
        Args: {
          p_calle_call_id: string
          p_id: string
          p_outcome: string
          p_status: string
        }
        Returns: undefined
      }
      reserve_demo_call: {
        Args: {
          p_budget: number
          p_destination_masked: string
          p_ip_hash: string
          p_region: string
        }
        Returns: Json
      }
      rls_status: {
        Args: { table_names: string[] }
        Returns: {
          rowsecurity: boolean
          tablename: string
        }[]
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
    Enums: {},
  },
} as const
