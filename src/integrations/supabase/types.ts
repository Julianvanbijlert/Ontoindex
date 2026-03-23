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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_title: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_title?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_title?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          allow_self_role_change: boolean
          created_at: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_self_role_change?: boolean
          created_at?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_self_role_change?: boolean
          created_at?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      approval_request_assignments: {
        Row: {
          approval_request_id: string
          created_at: string
          definition_id: string
          id: string
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_team: string | null
          reviewer_user_id: string | null
          status: Database["public"]["Enums"]["review_assignment_status"]
        }
        Insert: {
          approval_request_id: string
          created_at?: string
          definition_id: string
          id?: string
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_team?: string | null
          reviewer_user_id?: string | null
          status?: Database["public"]["Enums"]["review_assignment_status"]
        }
        Update: {
          approval_request_id?: string
          created_at?: string
          definition_id?: string
          id?: string
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_team?: string | null
          reviewer_user_id?: string | null
          status?: Database["public"]["Enums"]["review_assignment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_request_assignments_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_assignments_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          message: string | null
          requested_by: string
          review_message: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["workflow_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          message?: string | null
          requested_by: string
          review_message?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          message?: string | null
          requested_by?: string
          review_message?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          definition_id: string
          id: string
          is_resolved: boolean | null
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          definition_id: string
          id?: string
          is_resolved?: boolean | null
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          definition_id?: string
          id?: string
          is_resolved?: boolean | null
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      definitions: {
        Row: {
          category_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          description: string | null
          example: string | null
          id: string
          is_deleted: boolean | null
          metadata: Json | null
          ontology_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["workflow_status"] | null
          tags: string[] | null
          title: string
          updated_at: string
          version: number | null
          view_count: number | null
        }
        Insert: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          example?: string | null
          id?: string
          is_deleted?: boolean | null
          metadata?: Json | null
          ontology_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          tags?: string[] | null
          title: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Update: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          example?: string | null
          id?: string
          is_deleted?: boolean | null
          metadata?: Json | null
          ontology_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "definitions_ontology_id_fkey"
            columns: ["ontology_id"]
            isOneToOne: false
            referencedRelation: "ontologies"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          definition_id: string | null
          id: string
          ontology_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          definition_id?: string | null
          id?: string
          ontology_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          definition_id?: string | null
          id?: string
          ontology_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_ontology_id_fkey"
            columns: ["ontology_id"]
            isOneToOne: false
            referencedRelation: "ontologies"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          body: string
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          link: string | null
          link_path: string | null
          metadata: Json | null
          message: string | null
          parent_entity_id: string | null
          parent_entity_type: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          link_path?: string | null
          metadata?: Json | null
          message?: string | null
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          link_path?: string | null
          metadata?: Json | null
          message?: string | null
          parent_entity_id?: string | null
          parent_entity_type?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ontologies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["workflow_status"] | null
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["workflow_status"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          dark_mode: boolean | null
          display_name: string
          email: string | null
          format_preference: string | null
          group_by_preference: string | null
          id: string
          sort_preference: string | null
          team: string | null
          updated_at: string
          user_id: string
          view_preference: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dark_mode?: boolean | null
          display_name?: string
          email?: string | null
          format_preference?: string | null
          group_by_preference?: string | null
          id?: string
          sort_preference?: string | null
          team?: string | null
          updated_at?: string
          user_id: string
          view_preference?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dark_mode?: boolean | null
          display_name?: string
          email?: string | null
          format_preference?: string | null
          group_by_preference?: string | null
          id?: string
          sort_preference?: string | null
          team?: string | null
          updated_at?: string
          user_id?: string
          view_preference?: string | null
        }
        Relationships: []
      }
      relationships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          source_id: string
          target_id: string
          type: Database["public"]["Enums"]["relationship_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          source_id: string
          target_id: string
          type?: Database["public"]["Enums"]["relationship_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          source_id?: string
          target_id?: string
          type?: Database["public"]["Enums"]["relationship_type"]
        }
        Relationships: [
          {
            foreignKeyName: "relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string
          filters: Json | null
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json | null
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json | null
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      version_history: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          content: string | null
          created_at: string
          definition_id: string
          description: string | null
          id: string
          metadata: Json | null
          title: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          content?: string | null
          created_at?: string
          definition_id: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title: string
          version: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          content?: string | null
          created_at?: string
          definition_id?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "version_history_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      classify_review_assignment_notification_type: {
        Args: {
          _definition_id: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          _actor_user_id?: string | null
          _allow_self?: boolean
          _body?: string
          _dedupe_key?: string | null
          _entity_id?: string | null
          _entity_type?: string | null
          _link_path?: string | null
          _metadata?: Json
          _notification_type: string
          _parent_entity_id?: string | null
          _parent_entity_type?: string | null
          _title?: string
          _user_id: string
        }
        Returns: string
      }
      fetch_my_notification_preferences: {
        Args: Record<PropertyKey, never>
        Returns: {
          category: string
          default_enabled: boolean
          description: string
          enabled: boolean
          label: string
          notification_type: string
        }[]
      }
      fetch_my_notification_unread_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      fetch_my_notifications: {
        Args: {
          _limit?: number
          _offset?: number
          _unread_only?: boolean
        }
        Returns: {
          actor_display_name: string | null
          actor_email: string | null
          actor_user_id: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          link_path: string | null
          metadata: Json | null
          parent_entity_id: string | null
          parent_entity_type: string | null
          read_at: string | null
          title: string
          type: string
        }[]
      }
      fetch_my_recent_activity: {
        Args: {
          _limit?: number
        }
        Returns: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_title: string | null
          entity_type: string
          id: string
          user_id: string | null
        }[]
      }
      delete_comment: {
        Args: {
          _comment_id: string
        }
        Returns: Json
      }
      export_ontology_snapshot: {
        Args: {
          _ontology_id: string
        }
        Returns: Json
      }
      delete_definition_cascade: {
        Args: {
          _definition_id: string
        }
        Returns: Json
      }
      delete_ontology_cascade: {
        Args: {
          _ontology_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_my_role: {
        Args: {
          _target_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      admin_update_user_access: {
        Args: {
          _target_role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
          _team?: string | null
        }
        Returns: Json
      }
      import_definitions_to_ontology: {
        Args: {
          _ontology_id: string
          _rows: Json
        }
        Returns: Json
      }
      is_notification_enabled: {
        Args: {
          _notification_type: string
          _user_id: string
        }
        Returns: boolean
      }
      mark_all_my_notifications_read: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      save_search_history: {
        Args: {
          _filters?: Json
          _query: string
        }
        Returns: Json
      }
      set_my_notification_preference: {
        Args: {
          _enabled: boolean
          _notification_type: string
        }
        Returns: Json
      }
      set_my_notification_read_state: {
        Args: {
          _is_read?: boolean
          _notification_id: string
        }
        Returns: Json
      }
      set_comment_resolved: {
        Args: {
          _comment_id: string
          _resolved?: boolean
        }
        Returns: Json
      }
      set_review_assignment_decision: {
        Args: {
          _assignment_id: string
          _decision: Database["public"]["Enums"]["review_assignment_status"]
          _review_message?: string
        }
        Returns: Json
      }
      upsert_definition_review_request: {
        Args: {
          _definition_id: string
          _message?: string
          _reviewer_teams?: string[]
          _reviewer_user_ids?: string[]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "reviewer" | "editor" | "viewer"
      priority_level: "low" | "normal" | "high" | "critical"
      review_assignment_status: "pending" | "accepted" | "rejected"
      relationship_type:
        | "is_a"
        | "part_of"
        | "related_to"
        | "depends_on"
        | "synonym_of"
        | "antonym_of"
        | "derived_from"
      workflow_status:
        | "draft"
        | "in_review"
        | "approved"
        | "rejected"
        | "archived"
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
      app_role: ["admin", "reviewer", "editor", "viewer"],
      priority_level: ["low", "normal", "high", "critical"],
      review_assignment_status: ["pending", "accepted", "rejected"],
      relationship_type: [
        "is_a",
        "part_of",
        "related_to",
        "depends_on",
        "synonym_of",
        "antonym_of",
        "derived_from",
      ],
      workflow_status: [
        "draft",
        "in_review",
        "approved",
        "rejected",
        "archived",
      ],
    },
  },
} as const
