
import React, { memo, useRef, useEffect, useMemo } from 'react';
import { Type, Music } from 'lucide-react';
import { TimelineItem } from './types';
import { 
  LANE_HEIGHT_TEXT, 
  LANE_HEIGHT_VIDEO, 
  LANE_HEIGHT_AUDIO,
  CLIP_HEIGHT_TEXT,
  CLIP_HEIGHT_VIDEO,
  CLIP_HEIGHT_AUDIO
} from './constants';

interface ClipProps {
  item: TimelineItem;
  isSelected: boolean;
  pxPerSec: number;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, item: TimelineItem) => void;
  onTrimStart: (e: React.MouseEvent, item: TimelineItem, type: 'trim-start' | 'trim-end') => void;
}

// Sub-component to render a single frame at a specific time
// Using React.FC to properly handle React's internal props like 'key'
const VideoFrame: React.FC<{ url: string; time: number }> = ({ url, time }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v && url) {
      v.currentTime = time;
    }
  }, [time, url]);

  return (
    <div className="relative h-full aspect-video bg-zinc-950 border-r border-black/40 overflow-hidden pointer-events-none shrink-0">
      <video 
        ref={videoRef}
        src={url}
        muted
        playsInline
        className="w-full h-full object-cover pointer-events-none opacity-80"
      />
    </div>
  );
};

export const TimelineClip = memo(({ 
  item, 
  isSelected, 
  pxPerSec,
  onSelect, 
  onDragStart, 
  onTrimStart 
}: ClipProps) => {
  const clipWidth = item.duration * pxPerSec;
  
  // Dynamic positioning and height based on track type
  let top = 2;
  let height = CLIP_HEIGHT_TEXT;
  
  if (item.type === 'video') {
    top = LANE_HEIGHT_TEXT + 2;
    height = CLIP_HEIGHT_VIDEO;
  } else if (item.type === 'audio') {
    top = LANE_HEIGHT_TEXT + LANE_HEIGHT_VIDEO + 2;
    height = CLIP_HEIGHT_AUDIO;
  }

  const thumbnails = useMemo(() => {
    if (item.type !== 'video' || !item.url) return null;
    
    const thumbWidth = 57; 
    const count = Math.max(1, Math.ceil(clipWidth / thumbWidth));
    const safeCount = Math.min(count, 15); 
    
    const frames = [];
    for (let i = 0; i < safeCount; i++) {
      const timeOffset = (i / safeCount) * item.duration;
      frames.push(
        <VideoFrame key={`${item.id}-thumb-${i}`} url={item.url} time={timeOffset + item.trimStart} />
      );
    }
    return frames;
  }, [item.id, item.type, item.url, item.duration, item.trimStart, clipWidth]);

  // Calculate the original source boundaries for the ghost background
  const showGhost = item.type === 'video' && item.originalDuration !== undefined;
  const ghostLeft = -item.trimStart * pxPerSec;
  const ghostWidth = (item.originalDuration || 0) * pxPerSec;

  return (
    <div
      className="absolute z-20"
      style={{
        left: item.startTime * pxPerSec,
        top: top,
        width: clipWidth,
        height: height,
        overflow: 'visible'
      }}
    >
      {/* 1. Ghost Background (Original Source Duration) */}
      {showGhost && (
        <div 
          className="absolute h-full bg-white/[0.03] border border-dashed border-white/10 pointer-events-none z-0 rounded-sm"
          style={{
            left: ghostLeft,
            width: ghostWidth,
          }}
        />
      )}

      {/* 2. Main Active Segment */}
      <div
        className={`absolute inset-0 rounded-none overflow-hidden cursor-grab active:cursor-grabbing border will-change-transform z-10
          ${isSelected 
            ? 'border-green-400 z-30 ring-1 ring-green-400/20' 
            : 'border-blue-600 hover:border-blue-400'
          }
          ${item.type !== 'video' ? item.color : 'bg-zinc-800'}`}
      >
        {/* Thumbnails layer */}
        {item.type === 'video' && (
          <div className="absolute inset-0 flex flex-row overflow-hidden pointer-events-none select-none z-0">
            {thumbnails}
            <div className="flex-1 bg-zinc-900 pointer-events-none" />
          </div>
        )}

        {/* Interaction layer */}
        <div 
          className="absolute inset-0 z-10 cursor-inherit pointer-events-auto"
          onMouseDown={(e) => {
            e.stopPropagation(); 
            onSelect(item.id);
            onDragStart(e, item);
          }}
        />

        {/* Labels layer */}
        {item.type !== 'video' && (
          <div className="absolute inset-0 z-20 flex items-center gap-1.5 px-2 truncate pointer-events-none text-white/90">
            {item.type === 'text' && <Type size={11} className="shrink-0" />}
            {item.type === 'audio' && <Music size={11} className="shrink-0" />}
            <span className="truncate select-none uppercase tracking-tighter text-[10px] font-bold drop-shadow-md">{item.name}</span>
          </div>
        )}

        {/* Trimming interaction zones */}
        <div 
          onMouseDown={(e) => { 
            e.stopPropagation();
            onTrimStart(e, item, 'trim-start'); 
          }}
          className="absolute left-0 top-0 bottom-0 w-3 hover:bg-white/10 cursor-ew-resize transition-colors flex items-center justify-center group z-30"
        >
          <div className={`w-[2px] h-1/2 rounded-none ${isSelected ? 'bg-green-400' : 'bg-blue-400/50 group-hover:bg-blue-300'}`} />
        </div>

        <div 
          onMouseDown={(e) => { 
            e.stopPropagation();
            onTrimStart(e, item, 'trim-end'); 
          }}
          className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white/10 cursor-ew-resize transition-colors flex items-center justify-center group z-30"
        >
          <div className={`w-[2px] h-1/2 rounded-none ${isSelected ? 'bg-green-400' : 'bg-blue-400/50 group-hover:bg-blue-300'}`} />
        </div>
      </div>
    </div>
  );
});
