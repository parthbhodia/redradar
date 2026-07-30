/**
 * Schema types for `supabase/migrations/0001_init.sql`.
 *
 * Hand-written so the app is fully typed before a project exists. Once you've
 * linked a real project, regenerate instead of editing:
 *
 *   supabase gen types typescript --project-id <ref> > app/types/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
        Relationships: []
      }

      org_members: {
        Row: {
          org_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          org_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          org_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_members_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'orgs'
            referencedColumns: ['id']
          },
        ]
      }

      brands: {
        Row: {
          id: string
          org_id: string
          name: string
          tagline: string | null
          description: string | null
          voice: string | null
          competitors: string[]
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          tagline?: string | null
          description?: string | null
          voice?: string | null
          competitors?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          tagline?: string | null
          description?: string | null
          voice?: string | null
          competitors?: string[]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'brands_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'orgs'
            referencedColumns: ['id']
          },
        ]
      }

      campaigns: {
        Row: {
          id: string
          brand_id: string
          name: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          name: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaigns_brand_id_fkey'
            columns: ['brand_id']
            isOneToOne: false
            referencedRelation: 'brands'
            referencedColumns: ['id']
          },
        ]
      }

      keywords: {
        Row: {
          id: string
          campaign_id: string
          phrase: string
          subreddit_filter: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          phrase: string
          subreddit_filter?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          phrase?: string
          subreddit_filter?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'keywords_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
        ]
      }

      leads: {
        Row: {
          id: string
          campaign_id: string
          platform: string
          external_id: string
          url: string
          title: string | null
          body: string | null
          subreddit: string | null
          author: string | null
          score: number
          signals: string[]
          matched_keyword: string | null
          status: string
          reply_draft: string | null
          posted_at: string | null
          discovered_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          platform?: string
          external_id: string
          url: string
          title?: string | null
          body?: string | null
          subreddit?: string | null
          author?: string | null
          score?: number
          signals?: string[]
          matched_keyword?: string | null
          status?: string
          reply_draft?: string | null
          posted_at?: string | null
          discovered_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          platform?: string
          external_id?: string
          url?: string
          title?: string | null
          body?: string | null
          subreddit?: string | null
          author?: string | null
          score?: number
          signals?: string[]
          matched_keyword?: string | null
          status?: string
          reply_draft?: string | null
          posted_at?: string | null
          discovered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leads_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: Record<never, never>

    Functions: {
      create_org: {
        Args: { p_name: string }
        Returns: Database['public']['Tables']['orgs']['Row']
      }
      is_org_member: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      can_access_brand: {
        Args: { p_brand_id: string }
        Returns: boolean
      }
      can_access_campaign: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
    }

    Enums: Record<never, never>

    CompositeTypes: Record<never, never>
  }
}
