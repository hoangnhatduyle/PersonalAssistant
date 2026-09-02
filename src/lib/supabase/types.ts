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
      appointments: {
        Row: {
          id: string
          user_id: string
          title: string
          date: string
          category: string
          time: string | null
          location: string | null
          notes: string[]
          reminders_enabled: boolean
          reminder_lead_minutes: number
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          date: string
          category?: string
          time?: string | null
          location?: string | null
          notes?: string[]
          reminders_enabled?: boolean
          reminder_lead_minutes?: number
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          date?: string
          category?: string
          time?: string | null
          location?: string | null
          notes?: string[]
          reminders_enabled?: boolean
          reminder_lead_minutes?: number
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          id: string
          instructor: string | null
          location: string | null
          meeting_blocks: Json
          name: string
          person_id: string | null
          recurrence_end_date: string | null
          recurrence_start_date: string | null
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
          meeting_blocks?: Json
          name: string
          person_id?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
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
          meeting_blocks?: Json
          name?: string
          person_id?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          term?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
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
          person_id: string | null
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
          person_id?: string | null
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
          person_id?: string | null
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
            foreignKeyName: "deadlines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          tags: string[]
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
          tags?: string[]
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
          tags?: string[]
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
      people: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personalization_suggestions: {
        Row: {
          applied_at: string | null
          created_at: string
          dismissed_at: string | null
          field: string
          from_value: number
          id: string
          rationale: string
          scope: string
          source_feedback_ids: string[]
          status: Database["public"]["Enums"]["personalization_suggestion_status"]
          target_id: string
          to_value: number
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          field?: string
          from_value: number
          id?: string
          rationale: string
          scope: string
          source_feedback_ids: string[]
          status?: Database["public"]["Enums"]["personalization_suggestion_status"]
          target_id: string
          to_value: number
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          field?: string
          from_value?: number
          id?: string
          rationale?: string
          scope?: string
          source_feedback_ids?: string[]
          status?: Database["public"]["Enums"]["personalization_suggestion_status"]
          target_id?: string
          to_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personalization_suggestions_user_id_fkey"
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
          emailed_at: string | null
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
          emailed_at?: string | null
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
          emailed_at?: string | null
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
          person_id: string | null
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
          person_id?: string | null
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
          person_id?: string | null
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
            foreignKeyName: "tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          is_done: boolean
          list_id: string
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id: string
          position?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "active_todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_lists: {
        Row: {
          course_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_lists_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_lists_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_lists_user_id_fkey"
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
          email_reminders_enabled: boolean
          hands_free_voice_enabled: boolean
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          speak_suggestions_aloud: boolean
          timezone: string
          updated_at: string
          user_id: string
          voice_capture_enabled: boolean
        }
        Insert: {
          created_at?: string
          default_reminder_lead_minutes?: number
          email_reminders_enabled?: boolean
          hands_free_voice_enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          speak_suggestions_aloud?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
          voice_capture_enabled?: boolean
        }
        Update: {
          created_at?: string
          default_reminder_lead_minutes?: number
          email_reminders_enabled?: boolean
          hands_free_voice_enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          speak_suggestions_aloud?: boolean
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
          meeting_blocks: Json | null
          name: string | null
          person_id: string | null
          recurrence_end_date: string | null
          recurrence_start_date: string | null
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
          meeting_blocks?: Json | null
          name?: string | null
          person_id?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
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
          meeting_blocks?: Json | null
          name?: string | null
          person_id?: string | null
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          term?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
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
          tags: string[] | null
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
          tags?: string[] | null
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
          tags?: string[] | null
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
      active_people: {
        Row: {
          color: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_user_id_fkey"
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
      active_todo_items: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          due_date: string | null
          id: string | null
          is_done: boolean | null
          list_id: string | null
          position: number | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string | null
          is_done?: boolean | null
          list_id?: string | null
          position?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string | null
          is_done?: boolean | null
          list_id?: string | null
          position?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "active_todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_todo_lists: {
        Row: {
          course_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          name: string | null
          position: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_lists_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_lists_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_lists_user_id_fkey"
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
          emailed_at: string | null
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
          // Generator quirk, hand-corrected: `supabase gen types` infers this
          // `returns table (...)` column as non-null, but it's selected from
          // knowledge_sources.origin_url, which is nullable (see the
          // `knowledge_sources` Table Row below) — see
          // supabase/migrations/0009_knowledge_retrieval.sql. Consuming code
          // (src/lib/knowledge/retrieval.ts) already treats it as nullable.
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
          suggestions_dismissed: number
          todo_items_affected: number
        }[]
      }
      soft_delete_person_cascade: {
        Args: { p_person_id: string }
        Returns: {
          courses_affected: number
          deadlines_affected: number
          notes_unlinked: number
          reminders_dismissed: number
          tasks_affected: number
        }[]
      }
      soft_delete_task_cascade: {
        Args: { p_task_id: string }
        Returns: {
          notes_unlinked: number
          suggestions_dismissed: number
        }[]
      }
      soft_delete_todo_list_cascade: {
        Args: { p_list_id: string }
        Returns: {
          items_affected: number
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
      personalization_suggestion_status: "pending" | "applied" | "dismissed"
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
      personalization_suggestion_status: ["pending", "applied", "dismissed"],
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
