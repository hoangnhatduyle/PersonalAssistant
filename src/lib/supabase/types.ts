export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      courses: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          id: string
          instructor: string | null
          location: string | null
          meeting_pattern: string | null
          name: string
          reminder_lead_minutes: number
          reminders_enabled: boolean
          term: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          instructor?: string | null
          location?: string | null
          meeting_pattern?: string | null
          name: string
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          term?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          instructor?: string | null
          location?: string | null
          meeting_pattern?: string | null
          name?: string
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          term?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          course_id: string
          created_at: string
          deleted_at: string | null
          due_at: string
          id: string
          priority: string | null
          status: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          deleted_at?: string | null
          due_at: string
          id?: string
          priority?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string
          id?: string
          priority?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_aggregates: {
        Row: {
          avg_rating: number | null
          dimension: string
          id: string
          rating_sum: number
          sample_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_rating?: number | null
          dimension: string
          id?: string
          rating_sum?: number
          sample_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_rating?: number | null
          dimension?: string
          id?: string
          rating_sum?: number
          sample_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string
          id: string
          source_id: string
          user_id: string
        }
        Insert: {
          chunk_index: number
          chunk_text: string
          created_at?: string
          embedding: string
          id?: string
          source_id: string
          user_id: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string
          id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_user_id_fkey"
            columns: ["source_id", "user_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          id: string
          origin_url: string | null
          processing_started_at: string | null
          raw_content: string | null
          source_type: Database["public"]["Enums"]["knowledge_source_type"]
          status: Database["public"]["Enums"]["knowledge_source_status"]
          storage_object_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          origin_url?: string | null
          processing_started_at?: string | null
          raw_content?: string | null
          source_type: Database["public"]["Enums"]["knowledge_source_type"]
          status?: Database["public"]["Enums"]["knowledge_source_status"]
          storage_object_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          origin_url?: string | null
          processing_started_at?: string | null
          raw_content?: string | null
          source_type?: Database["public"]["Enums"]["knowledge_source_type"]
          status?: Database["public"]["Enums"]["knowledge_source_status"]
          storage_object_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          linked_course_id: string | null
          linked_date: string | null
          linked_task_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_course_id?: string | null
          linked_date?: string | null
          linked_task_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_course_id?: string | null
          linked_date?: string | null
          linked_task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          notification_channel: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          notification_channel?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          notification_channel?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          acknowledgment_state: Database["public"]["Enums"]["reminder_status"]
          channel: string
          created_at: string
          delivered_at: string | null
          id: string
          snooze_until: string | null
          target_id: string
          target_type: string
          trigger_at: string
          user_id: string
        }
        Insert: {
          acknowledgment_state?: Database["public"]["Enums"]["reminder_status"]
          channel?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          snooze_until?: string | null
          target_id: string
          target_type: string
          trigger_at: string
          user_id: string
        }
        Update: {
          acknowledgment_state?: Database["public"]["Enums"]["reminder_status"]
          channel?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          snooze_until?: string | null
          target_id?: string
          target_type?: string
          trigger_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_at: string | null
          id: string
          reminder_lead_minutes: number
          reminders_enabled: boolean
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          default_reminder_lead_minutes: number
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          updated_at: string
          user_id: string
          voice_capture_enabled: boolean
        }
        Insert: {
          created_at?: string
          default_reminder_lead_minutes?: number
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          voice_capture_enabled?: boolean
        }
        Update: {
          created_at?: string
          default_reminder_lead_minutes?: number
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          voice_capture_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_sessions: {
        Row: {
          confidence_score: number | null
          ended_at: string | null
          expires_at: string | null
          id: string
          pending_mutation: Json | null
          resolved_intent: string | null
          started_at: string
          state: Database["public"]["Enums"]["voice_session_state"]
          transcript: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          pending_mutation?: Json | null
          resolved_intent?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["voice_session_state"]
          transcript?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          pending_mutation?: Json | null
          resolved_intent?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["voice_session_state"]
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_speak_requests: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_speak_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_courses: {
        Row: {
          code: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          instructor: string | null
          location: string | null
          meeting_pattern: string | null
          name: string | null
          reminder_lead_minutes: number | null
          reminders_enabled: boolean | null
          term: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          instructor?: string | null
          location?: string | null
          meeting_pattern?: string | null
          name?: string | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          term?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          instructor?: string | null
          location?: string | null
          meeting_pattern?: string | null
          name?: string | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          term?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_deadlines: {
        Row: {
          course_id: string | null
          created_at: string | null
          deleted_at: string | null
          due_at: string | null
          id: string | null
          priority: string | null
          status: Database["public"]["Enums"]["deadline_status"] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          priority?: string | null
          status?: Database["public"]["Enums"]["deadline_status"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          priority?: string | null
          status?: Database["public"]["Enums"]["deadline_status"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_notes: {
        Row: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          linked_course_id: string | null
          linked_date: string | null
          linked_task_id: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          linked_course_id?: string | null
          linked_date?: string | null
          linked_task_id?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          linked_course_id?: string | null
          linked_date?: string | null
          linked_task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_tasks: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          due_at: string | null
          id: string | null
          reminder_lead_minutes: number | null
          reminders_enabled: boolean | null
          status: Database["public"]["Enums"]["task_status"] | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      complete_knowledge_import: {
        Args: { p_chunks: Json; p_raw_content: string; p_source_id: string }
        Returns: boolean
      }
      delete_expired_voice_sessions: {
        Args: never
        Returns: {
          confidence_score: number | null
          ended_at: string | null
          expires_at: string | null
          id: string
          pending_mutation: Json | null
          resolved_intent: string | null
          started_at: string
          state: Database["public"]["Enums"]["voice_session_state"]
          transcript: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "voice_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_expired_voice_speak_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "voice_speak_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dispatch_due_reminders: {
        Args: never
        Returns: {
          acknowledgment_state: Database["public"]["Enums"]["reminder_status"]
          channel: string
          created_at: string
          delivered_at: string | null
          id: string
          snooze_until: string | null
          target_id: string
          target_type: string
          trigger_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reminders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fail_knowledge_import: {
        Args: { p_error_message: string; p_source_id: string }
        Returns: boolean
      }
      match_knowledge_chunks: {
        Args: {
          p_match_count: number
          p_match_threshold: number
          p_query_embedding: string
        }
        Returns: {
          chunk_text: string
          // `supabase gen types` can't see that this column is nullable on
          // a `returns table(...)` SQL function -- corrected by hand to
          // match knowledge_sources.origin_url's actual `string | null`
          // column type (non-url sources have no origin_url).
          origin_url: string | null
          similarity: number
          source_id: string
          source_type: Database["public"]["Enums"]["knowledge_source_type"]
          title: string
          user_id: string
        }[]
      }
      reap_stuck_knowledge_imports: { Args: never; Returns: number }
      retry_knowledge_import: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      soft_delete_course_cascade: {
        Args: { p_course_id: string }
        Returns: {
          deadlines_affected: number
          notes_unlinked: number
          reminders_dismissed: number
        }[]
      }
      soft_delete_task_cascade: {
        Args: { p_task_id: string }
        Returns: {
          notes_unlinked: number
        }[]
      }
      start_knowledge_import: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      sweep_expired_feedback: { Args: never; Returns: number }
    }
    Enums: {
      deadline_status:
        | "Not Started"
        | "In Progress"
        | "Submitted"
        | "Overdue"
        | "Completed"
        | "Cancelled"
      knowledge_source_status: "Pending" | "Processing" | "Ready" | "Failed"
      knowledge_source_type: "url" | "pasted_text" | "image" | "video" | "audio"
      reminder_status:
        | "Scheduled"
        | "Delivered"
        | "Acknowledged"
        | "Dismissed"
        | "Snoozed"
        | "Expired"
      task_status: "Open" | "Done" | "Cancelled"
      voice_session_state:
        | "Idle"
        | "Listening"
        | "Transcribing"
        | "IntentResolved"
        | "IntentAmbiguous"
        | "AwaitingConfirmation"
        | "Executing"
        | "Responding"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      deadline_status: [
        "Not Started",
        "In Progress",
        "Submitted",
        "Overdue",
        "Completed",
        "Cancelled",
      ],
      knowledge_source_status: ["Pending", "Processing", "Ready", "Failed"],
      knowledge_source_type: ["url", "pasted_text", "image", "video", "audio"],
      reminder_status: [
        "Scheduled",
        "Delivered",
        "Acknowledged",
        "Dismissed",
        "Snoozed",
        "Expired",
      ],
      task_status: ["Open", "Done", "Cancelled"],
      voice_session_state: [
        "Idle",
        "Listening",
        "Transcribing",
        "IntentResolved",
        "IntentAmbiguous",
        "AwaitingConfirmation",
        "Executing",
        "Responding",
      ],
    },
  },
} as const

