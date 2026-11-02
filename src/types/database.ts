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
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          property_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          property_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          property_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          account_name: string
          account_number: string
          address: string
          bank_name: string
          branch_code: string
          business_name: string
          email: string
          id: number
          logo_path: string | null
          payment_terms_days: number
          phone: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          account_name?: string
          account_number?: string
          address?: string
          bank_name?: string
          branch_code?: string
          business_name?: string
          email?: string
          id?: number
          logo_path?: string | null
          payment_terms_days?: number
          phone?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          address?: string
          bank_name?: string
          branch_code?: string
          business_name?: string
          email?: string
          id?: number
          logo_path?: string | null
          payment_terms_days?: number
          phone?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          name: string
          property_id: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name: string
          property_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name?: string
          property_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_excl_vat: number
          amount_paid: number | null
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          file_path: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          paid_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          proof_file_path: string | null
          property_id: string
          rates_levies_bill_id: string | null
          recurrence: Database["public"]["Enums"]["expense_recurrence"] | null
          recurring: boolean
          status: Database["public"]["Enums"]["expense_status"]
          supplier: string | null
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount_excl_vat: number
          amount_paid?: number | null
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          proof_file_path?: string | null
          property_id: string
          rates_levies_bill_id?: string | null
          recurrence?: Database["public"]["Enums"]["expense_recurrence"] | null
          recurring?: boolean
          status?: Database["public"]["Enums"]["expense_status"]
          supplier?: string | null
          total: number
          updated_at?: string
          vat_amount: number
        }
        Update: {
          amount_excl_vat?: number
          amount_paid?: number | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          proof_file_path?: string | null
          property_id?: string
          rates_levies_bill_id?: string | null
          recurrence?: Database["public"]["Enums"]["expense_recurrence"] | null
          recurring?: boolean
          status?: Database["public"]["Enums"]["expense_status"]
          supplier?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_rates_levies_bill_id_fkey"
            columns: ["rates_levies_bill_id"]
            isOneToOne: false
            referencedRelation: "rates_levies_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          position: number
          quantity: number
          unit_price: number
          vat_applicable: boolean
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          position?: number
          quantity: number
          unit_price: number
          vat_applicable?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          position?: number
          quantity?: number
          unit_price?: number
          vat_applicable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          issued: boolean
          lease_id: string
          notes: string | null
          pdf_path: string | null
          period_end: string
          period_start: string
          property_id: string
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          issued?: boolean
          lease_id: string
          notes?: string | null
          pdf_path?: string | null
          period_end: string
          period_start: string
          property_id: string
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          issued?: boolean
          lease_id?: string
          notes?: string | null
          pdf_path?: string | null
          period_end?: string
          period_start?: string
          property_id?: string
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          created_at: string
          created_by: string | null
          deposit_amount: number
          deposit_held_by: string
          end_date: string
          escalation_date: string | null
          escalation_percent: number | null
          id: string
          monthly_rent: number
          property_id: string
          rent_due_day: number
          start_date: string
          status: Database["public"]["Enums"]["lease_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deposit_amount: number
          deposit_held_by: string
          end_date: string
          escalation_date?: string | null
          escalation_percent?: number | null
          id?: string
          monthly_rent: number
          property_id: string
          rent_due_day?: number
          start_date: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_held_by?: string
          end_date?: string
          escalation_date?: string | null
          escalation_percent?: number | null
          id?: string
          monthly_rent?: number
          property_id?: string
          rent_due_day?: number
          start_date?: string
          status?: Database["public"]["Enums"]["lease_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_statements: {
        Row: {
          bookings_count: number
          cleaning_fees: number
          created_at: string
          file_path: string
          gross_income: number
          id: string
          management_fee: number
          manager_name: string | null
          net_payout: number
          nights_booked: number
          other_deductions: number
          payout_date: string | null
          period_month: string
          platform_fees: number
          property_id: string
          statement_date: string | null
          status: Database["public"]["Enums"]["owner_statement_status"]
          updated_at: string
          uploaded_by: string | null
          vat_on_fees: number
        }
        Insert: {
          bookings_count: number
          cleaning_fees: number
          created_at?: string
          file_path: string
          gross_income: number
          id?: string
          management_fee: number
          manager_name?: string | null
          net_payout: number
          nights_booked: number
          other_deductions: number
          payout_date?: string | null
          period_month: string
          platform_fees: number
          property_id: string
          statement_date?: string | null
          status?: Database["public"]["Enums"]["owner_statement_status"]
          updated_at?: string
          uploaded_by?: string | null
          vat_on_fees: number
        }
        Update: {
          bookings_count?: number
          cleaning_fees?: number
          created_at?: string
          file_path?: string
          gross_income?: number
          id?: string
          management_fee?: number
          manager_name?: string | null
          net_payout?: number
          nights_booked?: number
          other_deductions?: number
          payout_date?: string | null
          period_month?: string
          platform_fees?: number
          property_id?: string
          statement_date?: string | null
          status?: Database["public"]["Enums"]["owner_statement_status"]
          updated_at?: string
          uploaded_by?: string | null
          vat_on_fees?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_statements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          proof_file_path: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          proof_file_path?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          proof_file_path?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          body_corporate_name: string | null
          bond_amount: number | null
          bond_bank: string | null
          bond_interest_rate: number | null
          bond_monthly_payment: number | null
          city: string | null
          created_at: string
          created_by: string | null
          current_value: number | null
          erf_number: string | null
          id: string
          improvement_costs: number | null
          municipal_account_number: string | null
          name: string
          notes: string | null
          postal_code: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          province: Database["public"]["Enums"]["sa_province"] | null
          purchase_date: string | null
          purchase_price: number | null
          rental_type: Database["public"]["Enums"]["rental_type"]
          scheme_number: string | null
          status: Database["public"]["Enums"]["property_status"]
          suburb: string | null
          transfer_costs: number | null
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          body_corporate_name?: string | null
          bond_amount?: number | null
          bond_bank?: string | null
          bond_interest_rate?: number | null
          bond_monthly_payment?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          erf_number?: string | null
          id?: string
          improvement_costs?: number | null
          municipal_account_number?: string | null
          name: string
          notes?: string | null
          postal_code?: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          province?: Database["public"]["Enums"]["sa_province"] | null
          purchase_date?: string | null
          purchase_price?: number | null
          rental_type: Database["public"]["Enums"]["rental_type"]
          scheme_number?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suburb?: string | null
          transfer_costs?: number | null
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          body_corporate_name?: string | null
          bond_amount?: number | null
          bond_bank?: string | null
          bond_interest_rate?: number | null
          bond_monthly_payment?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          erf_number?: string | null
          id?: string
          improvement_costs?: number | null
          municipal_account_number?: string | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          province?: Database["public"]["Enums"]["sa_province"] | null
          purchase_date?: string | null
          purchase_price?: number | null
          rental_type?: Database["public"]["Enums"]["rental_type"]
          scheme_number?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suburb?: string | null
          transfer_costs?: number | null
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_access: {
        Row: {
          created_at: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rates_levies_bills: {
        Row: {
          account_number: string | null
          amount_paid: number | null
          arrears: number
          bill_type: Database["public"]["Enums"]["bill_type"]
          created_at: string
          due_date: string
          electricity: number
          file_path: string | null
          id: string
          interest: number
          issuer_name: string
          levy: number
          municipal_rates: number
          other_charges: number
          paid_date: string | null
          period_month: string
          proof_file_path: string | null
          property_id: string
          refuse: number
          sewerage: number
          special_levy: number
          statement_date: string | null
          status: Database["public"]["Enums"]["bill_status"]
          total_due: number
          updated_at: string
          uploaded_by: string | null
          water: number
        }
        Insert: {
          account_number?: string | null
          amount_paid?: number | null
          arrears?: number
          bill_type: Database["public"]["Enums"]["bill_type"]
          created_at?: string
          due_date: string
          electricity?: number
          file_path?: string | null
          id?: string
          interest?: number
          issuer_name: string
          levy?: number
          municipal_rates?: number
          other_charges?: number
          paid_date?: string | null
          period_month: string
          proof_file_path?: string | null
          property_id: string
          refuse?: number
          sewerage?: number
          special_levy?: number
          statement_date?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          total_due: number
          updated_at?: string
          uploaded_by?: string | null
          water?: number
        }
        Update: {
          account_number?: string | null
          amount_paid?: number | null
          arrears?: number
          bill_type?: Database["public"]["Enums"]["bill_type"]
          created_at?: string
          due_date?: string
          electricity?: number
          file_path?: string | null
          id?: string
          interest?: number
          issuer_name?: string
          levy?: number
          municipal_rates?: number
          other_charges?: number
          paid_date?: string | null
          period_month?: string
          proof_file_path?: string | null
          property_id?: string
          refuse?: number
          sewerage?: number
          special_levy?: number
          statement_date?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          total_due?: number
          updated_at?: string
          uploaded_by?: string | null
          water?: number
        }
        Relationships: [
          {
            foreignKeyName: "rates_levies_bills_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rates_levies_bills_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          id_number: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      documents_list: {
        Row: {
          category: Database["public"]["Enums"]["document_category"] | null
          created_at: string | null
          file_size: number | null
          id: string | null
          name: string | null
          property_id: string | null
          property_name: string | null
          uploaded_by_name: string | null
        }
        Relationships: []
      }
      invoices_list: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          issue_date: string | null
          issued: boolean | null
          lease_id: string | null
          notes: string | null
          pdf_path: string | null
          period_end: string | null
          period_start: string | null
          property_id: string | null
          property_name: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          tenant_id: string | null
          tenant_name: string | null
          total: number | null
          vat_amount: number | null
        }
        Relationships: []
      }
      monthly_expenses_by_property: {
        Row: {
          amount: number | null
          category_id: string | null
          category_name: string | null
          month: string | null
          property_id: string | null
          sort_order: number | null
        }
        Relationships: []
      }
      monthly_income_by_property: {
        Row: {
          income: number | null
          month: string | null
          property_id: string | null
        }
        Relationships: []
      }
      properties_basic: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          body_corporate_name: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          erf_number: string | null
          id: string | null
          municipal_account_number: string | null
          name: string | null
          notes: string | null
          postal_code: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          province: Database["public"]["Enums"]["sa_province"] | null
          purchase_date: string | null
          rental_type: Database["public"]["Enums"]["rental_type"] | null
          scheme_number: string | null
          status: Database["public"]["Enums"]["property_status"] | null
          suburb: string | null
          unit_number: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_property: { Args: { property_id: string }; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      expense_storage_file: {
        Args: { object_path: string }
        Returns: {
          file_size: number
          mime_type: string
        }[]
      }
      generate_monthly_rent_invoices: {
        Args: { p_period_end: string; p_period_start: string }
        Returns: Json
      }
      generate_recurring_expenses: {
        Args: { p_property_id?: string }
        Returns: number
      }
      invoice_display_status: {
        Args: {
          p_amount_paid: number
          p_due_date: string
          p_issued: boolean
          p_total: number
        }
        Returns: Database["public"]["Enums"]["invoice_status"]
      }
      invoice_storage_file: {
        Args: { object_path: string }
        Returns: {
          file_size: number
          mime_type: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      log_login: { Args: never; Returns: undefined }
      property_document_file: {
        Args: { object_path: string }
        Returns: {
          file_size: number
          mime_type: string
        }[]
      }
      property_financial_summary: {
        Args: { from_date: string; to_date: string }
        Returns: {
          adr: number
          bond_payments: number
          capital_growth: number
          cash_on_cash: number
          gross_yield: number
          income: number
          net_income: number
          net_yield: number
          occupancy: number
          operating_expenses: number
          property_id: string
          property_name: string
          rental_type: Database["public"]["Enums"]["rental_type"]
        }[]
      }
      remove_unlinked_expense_file: {
        Args: { object_path: string }
        Returns: undefined
      }
      remove_unlinked_invoice_file: {
        Args: { object_path: string }
        Returns: undefined
      }
      remove_unlinked_property_document: {
        Args: { object_path: string }
        Returns: undefined
      }
      remove_unlinked_statement: {
        Args: { object_path: string }
        Returns: undefined
      }
      replace_invoice_lines: {
        Args: { p_invoice_id: string; p_lines: Json }
        Returns: undefined
      }
      statement_storage_file: {
        Args: { object_path: string }
        Returns: {
          file_size: number
          mime_type: string
        }[]
      }
    }
    Enums: {
      bill_status: "due" | "paid" | "overdue"
      bill_type: "levy" | "municipal" | "combined"
      document_category:
        | "title_deed"
        | "lease"
        | "insurance"
        | "compliance_certificate"
        | "municipal"
        | "body_corporate"
        | "statement"
        | "invoice"
        | "photo"
        | "other"
      expense_recurrence: "monthly" | "quarterly" | "annually"
      expense_status: "due" | "paid" | "overdue"
      invoice_status: "draft" | "sent" | "partially_paid" | "paid" | "overdue"
      lease_status: "active" | "ended"
      owner_statement_status: "expected" | "received"
      payment_method: "eft" | "cash" | "card" | "other"
      property_status: "active" | "sold"
      property_type: "freehold" | "sectional_title"
      rental_type: "long_term" | "short_term"
      sa_province:
        | "eastern_cape"
        | "free_state"
        | "gauteng"
        | "kwazulu_natal"
        | "limpopo"
        | "mpumalanga"
        | "northern_cape"
        | "north_west"
        | "western_cape"
      user_role: "owner" | "partner" | "property_manager"
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
    Enums: {
      bill_status: ["due", "paid", "overdue"],
      bill_type: ["levy", "municipal", "combined"],
      document_category: [
        "title_deed",
        "lease",
        "insurance",
        "compliance_certificate",
        "municipal",
        "body_corporate",
        "statement",
        "invoice",
        "photo",
        "other",
      ],
      expense_recurrence: ["monthly", "quarterly", "annually"],
      expense_status: ["due", "paid", "overdue"],
      invoice_status: ["draft", "sent", "partially_paid", "paid", "overdue"],
      lease_status: ["active", "ended"],
      owner_statement_status: ["expected", "received"],
      payment_method: ["eft", "cash", "card", "other"],
      property_status: ["active", "sold"],
      property_type: ["freehold", "sectional_title"],
      rental_type: ["long_term", "short_term"],
      sa_province: [
        "eastern_cape",
        "free_state",
        "gauteng",
        "kwazulu_natal",
        "limpopo",
        "mpumalanga",
        "northern_cape",
        "north_west",
        "western_cape",
      ],
      user_role: ["owner", "partner", "property_manager"],
    },
  },
} as const
