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
      appointments: {
        Row: {
          category: string
          created_at: string
          date: string
          deadline_id: string | null
          deleted_at: string | null
          duration_minutes: number | null
          event_status: Database["public"]["Enums"]["event_status"] | null
          id: string
          location: string | null
          meeting_blocks: Json
          notes: string[]
          recurrence_end_date: string | null
          recurrence_start_date: string | null
          reminder_lead_minutes: number
          reminders_enabled: boolean
          session_status: Database["public"]["Enums"]["session_status"] | null
          time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          date: string
          deadline_id?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          event_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          location?: string | null
          meeting_blocks?: Json
          notes?: string[]
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          session_status?: Database["public"]["Enums"]["session_status"] | null
          time?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          date?: string
          deadline_id?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          event_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          location?: string | null
          meeting_blocks?: Json
          notes?: string[]
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          session_status?: Database["public"]["Enums"]["session_status"] | null
          time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_deadline_id_fkey"
            columns: ["deadline_id"]
            isOneToOne: false
            referencedRelation: "active_deadlines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_deadline_id_fkey"
            columns: ["deadline_id"]
            isOneToOne: false
            referencedRelation: "deadlines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_done: boolean
          label: string
          position: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_done?: boolean
          label: string
          position?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_done?: boolean
          label?: string
          position?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_user_id_fkey"
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
          acknowledged_at: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          deleted_at: string | null
          due_at: string
          id: string
          person_id: string | null
          priority: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days: number[]
          recurrence_end_date: string | null
          recurrence_series_id: string | null
          recurrence_spawned_at: string | null
          status: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          deleted_at?: string | null
          due_at: string
          id?: string
          person_id?: string | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days?: number[]
          recurrence_end_date?: string | null
          recurrence_series_id?: string | null
          recurrence_spawned_at?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string
          id?: string
          person_id?: string | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days?: number[]
          recurrence_end_date?: string | null
          recurrence_series_id?: string | null
          recurrence_spawned_at?: string | null
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
      labels: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_application_events: {
        Row: {
          application_id: string
          created_at: string
          from_status: string | null
          id: string
          to_status: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          to_status: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          to_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "active_library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_application_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_applications: {
        Row: {
          created_at: string
          date_found: string
          deleted_at: string | null
          employer_id: string
          id: string
          job_url: string | null
          location: string | null
          normalized_job_url: string | null
          notes: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          status: string
          status_changed_at: string
          tech_stack: string[]
          title: string
          updated_at: string
          user_id: string
          work_mode: string | null
        }
        Insert: {
          created_at?: string
          date_found?: string
          deleted_at?: string | null
          employer_id: string
          id?: string
          job_url?: string | null
          location?: string | null
          normalized_job_url?: string | null
          notes?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          status?: string
          status_changed_at?: string
          tech_stack?: string[]
          title: string
          updated_at?: string
          user_id: string
          work_mode?: string | null
        }
        Update: {
          created_at?: string
          date_found?: string
          deleted_at?: string | null
          employer_id?: string
          id?: string
          job_url?: string | null
          location?: string | null
          normalized_job_url?: string | null
          notes?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          status?: string
          status_changed_at?: string
          tech_stack?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "active_library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_employer_contacts: {
        Row: {
          created_at: string
          employer_id: string
          kind: string
          note: string
          person_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employer_id: string
          kind?: string
          note?: string
          person_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employer_id?: string
          kind?: string
          note?: string
          person_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_employer_contacts_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "active_library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_employer_contacts_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_employer_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_employer_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_employer_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_employers: {
        Row: {
          archived_at: string | null
          careers_url: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          careers_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          careers_url?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_employers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_interviews: {
        Row: {
          application_id: string
          created_at: string
          deleted_at: string | null
          id: string
          interviewer_person_id: string | null
          kind: string
          notes: string
          outcome: string
          round_label: string
          scheduled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          interviewer_person_id?: string | null
          kind?: string
          notes?: string
          outcome?: string
          round_label: string
          scheduled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          interviewer_person_id?: string | null
          kind?: string
          notes?: string
          outcome?: string
          round_label?: string
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "active_library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_interviewer_person_id_fkey"
            columns: ["interviewer_person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_interviewer_person_id_fkey"
            columns: ["interviewer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_post_courses: {
        Row: {
          course_id: string
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_post_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "active_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_courses_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "active_library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_courses_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_post_employers: {
        Row: {
          created_at: string
          employer_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employer_id: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          employer_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_post_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "active_library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_employers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "active_library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_employers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_employers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_post_images: {
        Row: {
          created_at: string
          deleted_at: string | null
          height: number
          id: string
          mime_type: string
          position: number
          post_id: string
          size_bytes: number
          storage_path: string
          thumb_path: string
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          height: number
          id?: string
          mime_type: string
          position?: number
          post_id: string
          size_bytes: number
          storage_path: string
          thumb_path: string
          updated_at?: string
          user_id: string
          width: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          height?: number
          id?: string
          mime_type?: string
          position?: number
          post_id?: string
          size_bytes?: number
          storage_path?: string
          thumb_path?: string
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "active_library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_post_people: {
        Row: {
          created_at: string
          person_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_post_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_people_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "active_library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_people_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_posts: {
        Row: {
          archived_at: string | null
          author_name: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_favorite: boolean
          normalized_url: string | null
          notes: string
          platform: string
          tags: string[]
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          author_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favorite?: boolean
          normalized_url?: string | null
          notes?: string
          platform?: string
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          author_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favorite?: boolean
          normalized_url?: string | null
          notes?: string
          platform?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_accounts: {
        Row: {
          created_at: string
          id: string
          provider: string
          provider_email: string
          refresh_token_auth_tag: string
          refresh_token_ciphertext: string
          refresh_token_iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          provider_email: string
          refresh_token_auth_tag: string
          refresh_token_ciphertext: string
          refresh_token_iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          provider_email?: string
          refresh_token_auth_tag?: string
          refresh_token_ciphertext?: string
          refresh_token_iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_api_requests: {
        Row: {
          created_at: string
          id: string
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_api_requests_user_id_fkey"
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
          relationship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          relationship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          relationship?: string | null
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
      task_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_size_bytes: number | null
          id: string
          kind: string
          mime_type: string | null
          storage_object_path: string | null
          task_id: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          storage_object_path?: string | null
          task_id: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          storage_object_path?: string | null
          task_id?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          created_at: string
          label_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "active_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          acknowledged_at: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          due_at: string | null
          id: string
          list_id: string | null
          person_id: string | null
          position: number
          priority: Database["public"]["Enums"]["item_priority"] | null
          reminder_lead_minutes: number
          reminders_enabled: boolean
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          list_id?: string | null
          person_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["item_priority"] | null
          reminder_lead_minutes?: number
          reminders_enabled?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          list_id?: string | null
          person_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["item_priority"] | null
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
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "active_todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
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
          owner_color: string | null
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
          owner_color?: string | null
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
          owner_color?: string | null
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
      voice_conversations: {
        Row: {
          draft_mutation: Json | null
          end_reason:
            | Database["public"]["Enums"]["voice_conversation_end_reason"]
            | null
          ended_at: string | null
          id: string
          last_active_at: string
          queued_steps: Json | null
          started_at: string
          user_id: string
        }
        Insert: {
          draft_mutation?: Json | null
          end_reason?:
            | Database["public"]["Enums"]["voice_conversation_end_reason"]
            | null
          ended_at?: string | null
          id?: string
          last_active_at?: string
          queued_steps?: Json | null
          started_at?: string
          user_id: string
        }
        Update: {
          draft_mutation?: Json | null
          end_reason?:
            | Database["public"]["Enums"]["voice_conversation_end_reason"]
            | null
          ended_at?: string | null
          id?: string
          last_active_at?: string
          queued_steps?: Json | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_conversations_user_id_fkey"
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
          conversation_id: string | null
          ended_at: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          pending_mutation: Json | null
          query_kind: string | null
          resolved_intent: string | null
          response_message: string | null
          schedule_time_window: string | null
          started_at: string
          state: Database["public"]["Enums"]["voice_session_state"]
          transcript: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          conversation_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          pending_mutation?: Json | null
          query_kind?: string | null
          resolved_intent?: string | null
          response_message?: string | null
          schedule_time_window?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["voice_session_state"]
          transcript?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          conversation_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          pending_mutation?: Json | null
          query_kind?: string | null
          resolved_intent?: string | null
          response_message?: string | null
          schedule_time_window?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["voice_session_state"]
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "voice_conversations"
            referencedColumns: ["id"]
          },
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
      active_checklist_items: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string | null
          is_done: boolean | null
          label: string | null
          position: number | null
          task_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          is_done?: boolean | null
          label?: string | null
          position?: number | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          is_done?: boolean | null
          label?: string | null
          position?: number | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          acknowledged_at: string | null
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          deleted_at: string | null
          due_at: string | null
          id: string | null
          person_id: string | null
          priority: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days: number[] | null
          recurrence_end_date: string | null
          recurrence_series_id: string | null
          recurrence_spawned_at: string | null
          status: Database["public"]["Enums"]["deadline_status"] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          person_id?: string | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days?: number[] | null
          recurrence_end_date?: string | null
          recurrence_series_id?: string | null
          recurrence_spawned_at?: string | null
          status?: Database["public"]["Enums"]["deadline_status"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          person_id?: string | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
          recurrence_days?: number[] | null
          recurrence_end_date?: string | null
          recurrence_series_id?: string | null
          recurrence_spawned_at?: string | null
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
      active_labels: {
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
            foreignKeyName: "labels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_library_applications: {
        Row: {
          created_at: string | null
          date_found: string | null
          deleted_at: string | null
          employer_id: string | null
          id: string | null
          job_url: string | null
          location: string | null
          normalized_job_url: string | null
          notes: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          status: string | null
          status_changed_at: string | null
          tech_stack: string[] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          work_mode: string | null
        }
        Insert: {
          created_at?: string | null
          date_found?: string | null
          deleted_at?: string | null
          employer_id?: string | null
          id?: string | null
          job_url?: string | null
          location?: string | null
          normalized_job_url?: string | null
          notes?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          status?: string | null
          status_changed_at?: string | null
          tech_stack?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_mode?: string | null
        }
        Update: {
          created_at?: string | null
          date_found?: string | null
          deleted_at?: string | null
          employer_id?: string | null
          id?: string | null
          job_url?: string | null
          location?: string | null
          normalized_job_url?: string | null
          notes?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          status?: string | null
          status_changed_at?: string | null
          tech_stack?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "active_library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_applications_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "library_employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_library_employers: {
        Row: {
          archived_at: string | null
          careers_url: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          name: string | null
          notes: string | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          careers_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          careers_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_employers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_library_interviews: {
        Row: {
          application_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          interviewer_person_id: string | null
          kind: string | null
          notes: string | null
          outcome: string | null
          round_label: string | null
          scheduled_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          interviewer_person_id?: string | null
          kind?: string | null
          notes?: string | null
          outcome?: string | null
          round_label?: string | null
          scheduled_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          interviewer_person_id?: string | null
          kind?: string | null
          notes?: string | null
          outcome?: string | null
          round_label?: string | null
          scheduled_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "active_library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "library_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_interviewer_person_id_fkey"
            columns: ["interviewer_person_id"]
            isOneToOne: false
            referencedRelation: "active_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_interviewer_person_id_fkey"
            columns: ["interviewer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_library_post_images: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          height: number | null
          id: string | null
          mime_type: string | null
          position: number | null
          post_id: string | null
          size_bytes: number | null
          storage_path: string | null
          thumb_path: string | null
          updated_at: string | null
          user_id: string | null
          width: number | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string | null
          mime_type?: string | null
          position?: number | null
          post_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumb_path?: string | null
          updated_at?: string | null
          user_id?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          height?: number | null
          id?: string | null
          mime_type?: string | null
          position?: number | null
          post_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumb_path?: string | null
          updated_at?: string | null
          user_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "library_post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "active_library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "library_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_post_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_library_posts: {
        Row: {
          archived_at: string | null
          author_name: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          is_favorite: boolean | null
          normalized_url: string | null
          notes: string | null
          platform: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          author_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          is_favorite?: boolean | null
          normalized_url?: string | null
          notes?: string | null
          platform?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          author_name?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          is_favorite?: boolean | null
          normalized_url?: string | null
          notes?: string | null
          platform?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_posts_user_id_fkey"
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
      active_people: {
        Row: {
          color: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          name: string | null
          relationship: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          relationship?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          relationship?: string | null
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
      active_task_attachments: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          file_size_bytes: number | null
          id: string | null
          kind: string | null
          mime_type: string | null
          storage_object_path: string | null
          task_id: string | null
          title: string | null
          updated_at: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          file_size_bytes?: number | null
          id?: string | null
          kind?: string | null
          mime_type?: string | null
          storage_object_path?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          file_size_bytes?: number | null
          id?: string | null
          kind?: string | null
          mime_type?: string | null
          storage_object_path?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_tasks: {
        Row: {
          acknowledged_at: string | null
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          due_at: string | null
          id: string | null
          list_id: string | null
          person_id: string | null
          position: number | null
          priority: Database["public"]["Enums"]["item_priority"] | null
          reminder_lead_minutes: number | null
          reminders_enabled: boolean | null
          status: Database["public"]["Enums"]["task_status"] | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          list_id?: string | null
          person_id?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
          reminder_lead_minutes?: number | null
          reminders_enabled?: boolean | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          due_at?: string | null
          id?: string | null
          list_id?: string | null
          person_id?: string | null
          position?: number | null
          priority?: Database["public"]["Enums"]["item_priority"] | null
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
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "active_todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
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
      cancel_deadline_series: {
        Args: { p_deadline_id: string }
        Returns: number
      }
      complete_knowledge_import: {
        Args: { p_chunks: Json; p_raw_content: string; p_source_id: string }
        Returns: boolean
      }
      delete_expired_mail_api_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          provider: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mail_api_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_expired_voice_conversations: {
        Args: never
        Returns: {
          draft_mutation: Json | null
          end_reason:
            | Database["public"]["Enums"]["voice_conversation_end_reason"]
            | null
          ended_at: string | null
          id: string
          last_active_at: string
          queued_steps: Json | null
          started_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "voice_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_expired_voice_sessions: {
        Args: never
        Returns: {
          confidence_score: number | null
          conversation_id: string | null
          ended_at: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          pending_mutation: Json | null
          query_kind: string | null
          resolved_intent: string | null
          response_message: string | null
          schedule_time_window: string | null
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
      library_post_tag_counts: {
        Args: never
        Returns: {
          n: number
          tag: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          p_match_count: number
          p_match_threshold: number
          p_query_embedding: string
        }
        Returns: {
          chunk_text: string
          origin_url: string
          similarity: number
          source_id: string
          source_type: Database["public"]["Enums"]["knowledge_source_type"]
          title: string
          user_id: string
        }[]
      }
      next_deadline_occurrence_due_at: {
        Args: {
          p_days: number[]
          p_due_at: string
          p_end_date: string
          p_timezone: string
        }
        Returns: string
      }
      reap_stuck_knowledge_imports: { Args: never; Returns: number }
      retry_knowledge_import: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      soft_delete_course_cascade: {
        Args: { p_course_id: string }
        Returns: {
          board_cards_affected: number
          deadlines_affected: number
          notes_unlinked: number
          reminders_dismissed: number
          suggestions_dismissed: number
        }[]
      }
      soft_delete_deadline_cascade: {
        Args: { p_deadline_id: string }
        Returns: {
          reminders_dismissed: number
          sessions_affected: number
        }[]
      }
      soft_delete_label_cascade: {
        Args: { p_label_id: string }
        Returns: {
          tasks_unlinked: number
        }[]
      }
      soft_delete_library_employer_cascade: {
        Args: { p_employer_id: string }
        Returns: {
          applications_affected: number
          contacts_removed: number
          interviews_affected: number
          post_links_removed: number
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
          attachments_deleted: number
          checklist_items_deleted: number
          labels_unlinked: number
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
      spawn_deadline_successor: {
        Args: { p_deadline_id: string }
        Returns: string
      }
      spawn_due_deadline_occurrences: { Args: never; Returns: number }
      start_knowledge_import: {
        Args: { p_source_id: string }
        Returns: boolean
      }
      sweep_expired_feedback: { Args: never; Returns: number }
      sync_library_post_courses: {
        Args: { p_course_ids: string[]; p_post_id: string }
        Returns: undefined
      }
      sync_library_post_employers: {
        Args: { p_employer_ids: string[]; p_post_id: string }
        Returns: undefined
      }
      sync_library_post_people: {
        Args: { p_person_ids: string[]; p_post_id: string }
        Returns: undefined
      }
      sync_task_labels: {
        Args: { p_label_ids: string[]; p_task_id: string }
        Returns: undefined
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
      event_status: "planned" | "done" | "missed"
      item_priority: "Low" | "Medium" | "High" | "Urgent"
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
      session_status: "planned" | "done" | "skipped"
      task_status: "Open" | "Done" | "Cancelled"
      voice_conversation_end_reason: "explicit" | "timeout"
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
      event_status: ["planned", "done", "missed"],
      item_priority: ["Low", "Medium", "High", "Urgent"],
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
      session_status: ["planned", "done", "skipped"],
      task_status: ["Open", "Done", "Cancelled"],
      voice_conversation_end_reason: ["explicit", "timeout"],
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

