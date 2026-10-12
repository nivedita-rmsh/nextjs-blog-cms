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
      post_working_copies: {
        Row: {
          user_id: string
          document_id: string
          post_id: string | null
          values: Json
          revision: string
          base_updated_at: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          document_id: string
          post_id?: string | null
          values: Json
          revision: string
          base_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          document_id?: string
          post_id?: string | null
          values?: Json
          revision?: string
          base_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "post_working_copies_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "post_working_copies_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      post_slug_routes: {
        Row: { slug: string; post_id: string; was_published: boolean }
        Insert: { slug: string; post_id: string; was_published?: boolean }
        Update: { slug?: string; post_id?: string; was_published?: boolean }
        Relationships: [{ foreignKeyName: "post_slug_routes_post_id_fkey"; columns: ["post_id"]; isOneToOne: false; referencedRelation: "posts"; referencedColumns: ["id"] }]
      }
      posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: string | null
          cover_image_alt: string
          cover_image: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          published_at: string | null
          moderation_status: string
          is_premium: boolean
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          cover_image_alt?: string
          cover_image?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          moderation_status?: string
          is_premium?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: string | null
          cover_image_alt?: string
          cover_image?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          moderation_status?: string
          is_premium?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_post_contents: {
        Row: { content: string; post_id: string; updated_at: string }
        Insert: { content: string; post_id: string; updated_at?: string }
        Update: { content?: string; post_id?: string; updated_at?: string }
        Relationships: [{
          foreignKeyName: "premium_post_contents_post_id_fkey"
          columns: ["post_id"]
          isOneToOne: true
          referencedRelation: "posts"
          referencedColumns: ["id"]
        }]
      }
      premium_subscriptions: {
        Row: { created_at: string; expires_at: string | null; status: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; expires_at?: string | null; status?: string; updated_at?: string; user_id: string }
        Update: { created_at?: string; expires_at?: string | null; status?: string; updated_at?: string; user_id?: string }
        Relationships: [{
          foreignKeyName: "premium_subscriptions_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: true
          referencedRelation: "profiles"
          referencedColumns: ["id"]
        }]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          confirmed_at: string | null
          created_at: string | null
          email: string
          facebook_url: string | null
          full_name: string | null
          github_url: string | null
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          location: string | null
          pronouns: string | null
          role: string
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string | null
          website: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email: string
          facebook_url?: string | null
          full_name?: string | null
          github_url?: string | null
          id: string
          instagram_url?: string | null
          linkedin_url?: string | null
          location?: string | null
          pronouns?: string | null
          role?: string
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string
          facebook_url?: string | null
          full_name?: string | null
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          location?: string | null
          pronouns?: string | null
          role?: string
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          merged_into?: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          merged_into?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          merged_into?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      public_author_profiles: {
        Row: Pick<Database['public']['Tables']['profiles']['Row'],
          'id' | 'full_name' | 'avatar_url' | 'bio' | 'website' |
          'twitter_url' | 'linkedin_url' | 'github_url' | 'instagram_url' |
          'facebook_url' | 'youtube_url' | 'tiktok_url'>
        Relationships: []
      }
    }
    Functions: {
      merge_tags: { Args: { source_id: string; target_id: string }; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Post = Database['public']['Tables']['posts']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Tag = Database['public']['Tables']['tags']['Row']
export type PostTag = Database['public']['Tables']['post_tags']['Row']
export type Comment = Database['public']['Tables']['comments']['Row']
