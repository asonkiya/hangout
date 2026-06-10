export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type PlanState = 'open' | 'venue_locked' | 'active' | 'completed' | 'cancelled';
export type RsvpStatus = 'pending' | 'going' | 'maybe' | 'not_going';
export type MemberRole = 'host' | 'member';
export type InviteStatus = 'pending' | 'accepted' | 'expired';
export type SwipeDirection = 'right' | 'left';
export type SelectionType = 'auto' | 'host';
export type ShareStatus = 'active' | 'stopped' | 'expired';
export type ShareMode = 'foreground';
export type TravelMode = 'drive' | 'walk';

// Use `type` (not `interface`) so that mapped types like Omit/Partial
// produce implicit index signatures compatible with supabase-js generics.

export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  phone_e164: string | null;
  email: string | null;
  created_at: string;
};

export type PlanRow = {
  id: string;
  creator_user_id: string;
  title: string;
  state: PlanState;
  scheduled_for: string | null;
  anchor_lat: number | null;
  anchor_lng: number | null;
  selected_place_id: string | null;
  selected_place_name: string | null;
  travel_mode_default: TravelMode;
  vibe: string | null;
  created_at: string;
};

export type PlanMemberRow = {
  id: string;
  plan_id: string;
  user_id: string;
  role: MemberRole;
  rsvp_status: RsvpStatus;
  joined_at: string;
};

export type PlanInviteRow = {
  id: string;
  plan_id: string;
  token: string;
  inviter_user_id: string;
  invitee_contact: string | null;
  status: InviteStatus;
  expires_at: string;
};

export type VenueCandidateRow = {
  id: string;
  plan_id: string;
  google_place_id: string;
  name: string;
  lat: number;
  lng: number;
  price_level: number | null;
  rating: number | null;
  category: string | null;
  source: string;
  created_at: string;
};

export type VenueSwipeRow = {
  id: string;
  plan_id: string;
  user_id: string;
  venue_candidate_id: string;
  direction: SwipeDirection;
  created_at: string;
};

export type VenueSelectionEventRow = {
  id: string;
  plan_id: string;
  venue_candidate_id: string;
  selected_by_user_id: string;
  selection_type: SelectionType;
  created_at: string;
};

export type LocationShareSessionRow = {
  id: string;
  plan_id: string;
  user_id: string;
  status: ShareStatus;
  started_at: string;
  expires_at: string;
  stopped_at: string | null;
  consent_version: string;
  share_mode: ShareMode;
};

export type LocationPointRow = {
  id: string;
  session_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  captured_at: string;
};

export type EtaSnapshotRow = {
  id: string;
  plan_id: string;
  user_id: string;
  destination_place_id: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  status: string;
  mode: TravelMode;
  computed_at: string;
};

export type PlanMessageRow = {
  id: string;
  plan_id: string;
  user_id: string;
  message_type: string;
  body: string;
  created_at: string;
};

export type AnalyticsEventRow = {
  id: string;
  user_id: string | null;
  plan_id: string | null;
  event_name: string;
  properties_json: Json | null;
  created_at: string;
};

// Helper: make certain keys optional for insert (fields with DB defaults or nullable)
type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// ─── Supabase Database type ───────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: OptionalFields<Omit<UserRow, 'created_at'>, 'avatar_url' | 'phone_e164' | 'email'>;
        Update: Partial<Omit<UserRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      plans: {
        Row: PlanRow;
        Insert: OptionalFields<Omit<PlanRow, 'id' | 'created_at'>, 'state' | 'scheduled_for' | 'anchor_lat' | 'anchor_lng' | 'selected_place_id' | 'selected_place_name' | 'travel_mode_default' | 'vibe'>;
        Update: Partial<Omit<PlanRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      plan_members: {
        Row: PlanMemberRow;
        Insert: OptionalFields<Omit<PlanMemberRow, 'id' | 'joined_at'>, 'role' | 'rsvp_status'>;
        Update: Partial<Omit<PlanMemberRow, 'id' | 'joined_at'>>;
        Relationships: [];
      };
      plan_invites: {
        Row: PlanInviteRow;
        Insert: OptionalFields<Omit<PlanInviteRow, 'id'>, 'invitee_contact' | 'status'>;
        Update: Partial<Omit<PlanInviteRow, 'id'>>;
        Relationships: [];
      };
      venue_candidates: {
        Row: VenueCandidateRow;
        Insert: OptionalFields<Omit<VenueCandidateRow, 'id' | 'created_at'>, 'price_level' | 'rating' | 'category' | 'source'>;
        Update: Partial<Omit<VenueCandidateRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      venue_swipes: {
        Row: VenueSwipeRow;
        Insert: Omit<VenueSwipeRow, 'id' | 'created_at'>;
        Update: Partial<Omit<VenueSwipeRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      venue_selection_events: {
        Row: VenueSelectionEventRow;
        Insert: Omit<VenueSelectionEventRow, 'id' | 'created_at'>;
        Update: Partial<Omit<VenueSelectionEventRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      location_share_sessions: {
        Row: LocationShareSessionRow;
        Insert: OptionalFields<Omit<LocationShareSessionRow, 'id' | 'started_at'>, 'stopped_at' | 'status' | 'share_mode'>;
        Update: Partial<Omit<LocationShareSessionRow, 'id' | 'started_at'>>;
        Relationships: [];
      };
      location_points: {
        Row: LocationPointRow;
        Insert: OptionalFields<Omit<LocationPointRow, 'id'>, 'accuracy_m'>;
        Update: Partial<Omit<LocationPointRow, 'id'>>;
        Relationships: [];
      };
      eta_snapshots: {
        Row: EtaSnapshotRow;
        Insert: OptionalFields<Omit<EtaSnapshotRow, 'id'>, 'duration_seconds' | 'distance_meters' | 'status' | 'mode' | 'computed_at'>;
        Update: Partial<Omit<EtaSnapshotRow, 'id'>>;
        Relationships: [];
      };
      plan_messages: {
        Row: PlanMessageRow;
        Insert: OptionalFields<Omit<PlanMessageRow, 'id' | 'created_at'>, 'message_type'>;
        Update: Partial<Omit<PlanMessageRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      analytics_events: {
        Row: AnalyticsEventRow;
        Insert: OptionalFields<Omit<AnalyticsEventRow, 'id' | 'created_at'>, 'user_id' | 'plan_id' | 'properties_json'>;
        Update: Partial<Omit<AnalyticsEventRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
