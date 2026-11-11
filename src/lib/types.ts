// One shape for every source. Adapters (Untappd, Letterboxd, ...) convert
// their activity into this, and everything downstream ignores the source.
export type SourceId = "untappd" | "letterboxd";

export interface ActivityItem {
  source: SourceId;
  /** What was reviewed: a beer, a film, a book. */
  title: string;
  /** Who made it: brewery, director, author. */
  creator?: string;
  /** The user's rating, e.g. 3.5 out of 5. */
  rating?: number;
  ratingMax?: number;
  /** The user's own words. Always published verbatim, never rewritten. */
  notes?: string;
  /** Publicly reachable image URL (required for Instagram). */
  imageUrl?: string;
  /** Link to this specific check-in or review. */
  itemUrl?: string;
  /** Link to the user's profile on the source platform: where followers are sent. */
  profileUrl: string;
  /** Optional extras, e.g. where the beer was had. */
  context?: string;
  /** Instagram/Threads handles to tag, without the @ (e.g. the brewery and the platform). */
  mentions?: string[];
}

export interface Channel {
  id: string;
  name: string;
  displayName?: string | null;
  service: string;
  avatar?: string;
  isQueuePaused?: boolean;
}

export interface Draft {
  channelId: string;
  service: string;
  text: string;
  imageUrl?: string;
  /** Instagram photo tags: handles shown on the image and in their Tagged tab. */
  userTags?: string[];
  altText?: string;
}
