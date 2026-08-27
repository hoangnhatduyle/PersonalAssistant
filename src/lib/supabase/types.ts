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
    }
    Enums: {
      deadline_status:
        | "Not Started"
        | "In Progress"
        | "Submitted"
        | "Overdue"
        | "Completed"
        | "Cancelled"
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

