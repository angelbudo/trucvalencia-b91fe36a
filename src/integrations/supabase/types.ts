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
      account_deletion_requests: {
        Row: {
          device_id: string | null
          email: string
          error_message: string | null
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          device_id?: string | null
          email: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          device_id?: string | null
          email?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      account_links: {
        Row: {
          created_at: string
          device_id: string | null
          email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_passwords: {
        Row: {
          created_at: string
          id: string
          password_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
        }
        Relationships: []
      }
      chat_flag_audit: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          flag_id: number
          id: number
          note: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          flag_id: number
          id?: number
          note?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          flag_id?: number
          id?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_flag_audit_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "room_chat_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          status?: string
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      player_profiles: {
        Row: {
          accept_threshold: number
          aggressiveness: number
          bluff_rate: number
          bot_difficulty: string
          bot_honesty: string
          created_at: string
          device_id: string
          envit_accepted: number
          envit_called: number
          envit_called_bluff: number
          envit_rejected: number
          envit_strength_n: number
          envit_strength_sum: number
          games_played: number
          truc_accepted: number
          truc_called: number
          truc_called_bluff: number
          truc_rejected: number
          truc_strength_n: number
          truc_strength_sum: number
          updated_at: string
        }
        Insert: {
          accept_threshold?: number
          aggressiveness?: number
          bluff_rate?: number
          bot_difficulty?: string
          bot_honesty?: string
          created_at?: string
          device_id: string
          envit_accepted?: number
          envit_called?: number
          envit_called_bluff?: number
          envit_rejected?: number
          envit_strength_n?: number
          envit_strength_sum?: number
          games_played?: number
          truc_accepted?: number
          truc_called?: number
          truc_called_bluff?: number
          truc_rejected?: number
          truc_strength_n?: number
          truc_strength_sum?: number
          updated_at?: string
        }
        Update: {
          accept_threshold?: number
          aggressiveness?: number
          bluff_rate?: number
          bot_difficulty?: string
          bot_honesty?: string
          created_at?: string
          device_id?: string
          envit_accepted?: number
          envit_called?: number
          envit_called_bluff?: number
          envit_rejected?: number
          envit_strength_n?: number
          envit_strength_sum?: number
          games_played?: number
          truc_accepted?: number
          truc_called?: number
          truc_called_bluff?: number
          truc_rejected?: number
          truc_strength_n?: number
          truc_strength_sum?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          friend_code: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          friend_code: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          friend_code?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      room_actions: {
        Row: {
          action: Json
          created_at: string
          id: number
          room_id: string
          seat: number
        }
        Insert: {
          action: Json
          created_at?: string
          id?: number
          room_id: string
          seat: number
        }
        Update: {
          action?: Json
          created_at?: string
          id?: number
          room_id?: string
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_actions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_chat: {
        Row: {
          created_at: string
          id: number
          phrase_id: string
          room_id: string
          seat: number
        }
        Insert: {
          created_at?: string
          id?: number
          phrase_id: string
          room_id: string
          seat: number
        }
        Update: {
          created_at?: string
          id?: number
          phrase_id?: string
          room_id?: string
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_chat_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_chat_flags: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          id: number
          message_id: number | null
          message_text: string | null
          reason: string | null
          reporter_device_id: string
          room_id: string
          status: string
          target_device_id: string
          target_seat: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at: string
          id?: number
          message_id?: number | null
          message_text?: string | null
          reason?: string | null
          reporter_device_id: string
          room_id: string
          status?: string
          target_device_id: string
          target_seat: number
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: number
          message_id?: number | null
          message_text?: string | null
          reason?: string | null
          reporter_device_id?: string
          room_id?: string
          status?: string
          target_device_id?: string
          target_seat?: number
        }
        Relationships: []
      }
      room_players: {
        Row: {
          device_id: string
          id: string
          is_online: boolean
          joined_at: string
          last_seen: string
          name: string
          room_id: string
          seat: number
        }
        Insert: {
          device_id: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen?: string
          name: string
          room_id: string
          seat: number
        }
        Update: {
          device_id?: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen?: string
          name?: string
          room_id?: string
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_text_chat: {
        Row: {
          created_at: string
          device_id: string
          id: number
          room_id: string
          seat: number
          text: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: number
          room_id: string
          seat: number
          text: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: number
          room_id?: string
          seat?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_text_chat_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          bot_intents: Json
          code: string
          created_at: string
          host_device: string
          id: string
          initial_mano: number
          match_state: Json | null
          paused_at: string | null
          pending_proposal: Json | null
          seat_kinds: Database["public"]["Enums"]["seat_kind"][]
          status: Database["public"]["Enums"]["room_status"]
          target_cama: number
          target_cames: number
          turn_started_at: string | null
          turn_timeout_sec: number
          updated_at: string
        }
        Insert: {
          bot_intents?: Json
          code: string
          created_at?: string
          host_device: string
          id?: string
          initial_mano?: number
          match_state?: Json | null
          paused_at?: string | null
          pending_proposal?: Json | null
          seat_kinds: Database["public"]["Enums"]["seat_kind"][]
          status?: Database["public"]["Enums"]["room_status"]
          target_cama?: number
          target_cames?: number
          turn_started_at?: string | null
          turn_timeout_sec?: number
          updated_at?: string
        }
        Update: {
          bot_intents?: Json
          code?: string
          created_at?: string
          host_device?: string
          id?: string
          initial_mano?: number
          match_state?: Json | null
          paused_at?: string | null
          pending_proposal?: Json | null
          seat_kinds?: Database["public"]["Enums"]["seat_kind"][]
          status?: Database["public"]["Enums"]["room_status"]
          target_cama?: number
          target_cames?: number
          turn_started_at?: string | null
          turn_timeout_sec?: number
          updated_at?: string
        }
        Relationships: []
      }
      sala_chat: {
        Row: {
          created_at: string
          device_id: string
          id: number
          name: string
          sala_slug: string
          text: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: number
          name: string
          sala_slug: string
          text: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: number
          name?: string
          sala_slug?: string
          text?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          abandoned: number
          current_streak: number
          level: number
          losses: number
          max_streak: number
          updated_at: string
          user_id: string
          wins: number
          xp: number
        }
        Insert: {
          abandoned?: number
          current_streak?: number
          level?: number
          losses?: number
          max_streak?: number
          updated_at?: string
          user_id: string
          wins?: number
          xp?: number
        }
        Update: {
          abandoned?: number
          current_streak?: number
          level?: number
          losses?: number
          max_streak?: number
          updated_at?: string
          user_id?: string
          wins?: number
          xp?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      __apply_admin_sql: { Args: { sql: string }; Returns: undefined }
      __apply_admin_sql_lax: { Args: { sql: string }; Returns: string }
      gen_friend_code: { Args: never; Returns: string }
      get_public_avatars_by_devices: {
        Args: { p_device_ids: string[] }
        Returns: {
          avatar_url: string
          device_id: string
          username: string
        }[]
      }
      get_public_friends_by_user_id: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          level: number
          losses: number
          max_streak: number
          user_id: string
          username: string
          wins: number
        }[]
      }
      get_public_player_profile_by_device: {
        Args: { p_device_id: string }
        Returns: {
          abandoned: number
          avatar_url: string
          current_streak: number
          display_name: string
          friend_code: string
          level: number
          losses: number
          max_streak: number
          user_id: string
          username: string
          wins: number
          xp: number
        }[]
      }
      get_public_player_profile_by_user_id: {
        Args: { p_user_id: string }
        Returns: {
          abandoned: number
          avatar_url: string
          current_streak: number
          display_name: string
          friend_code: string
          level: number
          losses: number
          max_streak: number
          user_id: string
          username: string
          wins: number
          xp: number
        }[]
      }
      is_username_available: { Args: { p_username: string }; Returns: boolean }
      is_username_reserved: { Args: { p_username: string }; Returns: boolean }
      level_for_xp: { Args: { p_xp: number }; Returns: number }
      record_match_result: {
        Args: {
          p_bot_opponents: number
          p_human_opponents: number
          p_won: boolean
        }
        Returns: {
          abandoned: number
          current_streak: number
          level: number
          losses: number
          max_streak: number
          updated_at: string
          user_id: string
          wins: number
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "user_stats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_friend: { Args: { p_friend_user_id: string }; Returns: undefined }
      respond_friend_request: {
        Args: { p_accept: boolean; p_friendship_id: string }
        Returns: undefined
      }
      send_friend_request_by_code: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_friend_request_by_email: {
        Args: { p_email: string }
        Returns: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_friend_request_by_username: {
        Args: { p_username: string }
        Returns: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_username: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          friend_code: string
          updated_at: string
          user_id: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      room_status: "lobby" | "playing" | "finished" | "abandoned"
      seat_kind: "human" | "bot" | "empty"
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
      room_status: ["lobby", "playing", "finished", "abandoned"],
      seat_kind: ["human", "bot", "empty"],
    },
  },
} as const