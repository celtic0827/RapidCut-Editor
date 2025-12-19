
export type TrackType = 'video' | 'audio' | 'text';
export type TitleEffect = 'none' | 'reveal' | 'glitch' | 'typewriter';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

export interface RenderSettings {
  filename: string;
  quality: 'low' | 'medium' | 'high';
  bitrate: number;
}

export interface ClipFX {
  shakeIntensity: number;
  shakeFrequency: number;
  shakeZoom: number;
  shakeEnabled: boolean;
  seed: number;
}

export interface TimelineItem {
  id: string;
  type: TrackType;
  startTime: number;
  duration: number;
  trimStart: number;
  originalDuration?: number;
  allowExtension?: boolean;
  name: string;
  url?: string;
  content?: string;
  effect?: TitleEffect;
  color: string;
  volume?: number;
  muted?: boolean; // 新增：個別片段靜音
  fx?: ClipFX;
}

export interface FXPreset {
  id: string;
  name: string;
  fx: ClipFX;
  type: 'shake' | 'full';
}
