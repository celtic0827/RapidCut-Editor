
export type TrackType = 'video' | 'audio' | 'text';
export type TitleEffect = 'center-reveal' | 'fade-lower-third';

export interface TimelineItem {
  id: string;
  type: TrackType;
  startTime: number;
  duration: number;
  trimStart: number; // Seconds cut from the beginning of the source media
  originalDuration?: number; // The actual file duration
  allowExtension?: boolean;  // Whether the user can drag past originalDuration
  name: string;
  url?: string;
  content?: string;
  effect?: TitleEffect;
  color: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}
