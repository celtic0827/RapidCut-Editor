
import React, { memo, useRef, useEffect, useMemo } from 'react';
import { Type, Music, Volume2, VolumeX } from 'lucide-react';
import { TimelineItem } from './types.ts';
import { 
  LANE_HEIGHT_TEXT, 
  LANE_HEIGHT_VIDEO, 
  CLIP_HEIGHT_TEXT,
  CLIP_HEIGHT_VIDEO,
  CLIP_HEIGHT_AUDIO
} from './constants.ts';

interface ClipProps {
  item: TimelineItem;
  isSelected: boolean;
  isDragging?: boolean;
  pxPerSec: number;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, item: TimelineItem) => void;
  onTrimStart: (e: React.MouseEvent, item: TimelineItem, type: 'trim-start' | 'trim-end') => void;
}

const VideoFrame: React.FC<{ url: string; time: number }> = ({ url, time }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (v && url) v.currentTime = time;
  }, [time, url]);

  return (
    <div className="relative h-full aspect-video bg-zinc-950 border-r border-black/40 overflow-hidden pointer-events-none shrink-0">
      <video ref={videoRef} src={url} muted playsInline className="w-full h-full object-cover pointer-events-none opacity-80" />
    </div>
  );
};

export const TimelineClip = memo(({ 
  item, isSelected, isDragging, pxPerSec, onSelect, onDragStart, onTrimStart 
}: ClipProps) => {
  const clipWidth = item.duration * pxPerSec;
  let top = 2;
  let height = CLIP_HEIGHT_TEXT;
  
  if (item.type === 'video') {
    top = LANE_HEIGHT_TEXT + 2;
    height = CLIP_HEIGHT_VIDEO;
  } else if (item.type === 'audio') {
    top = LANE_HEIGHT_TEXT + LANE_HEIGHT_VIDEO + 2;
    height = CLIP_HEIGHT_AUDIO;
  }

  const isAtSourceStart = (item.trimStart || 0) <= 0.001;
  const isAtSourceEnd = item.originalDuration 
    ? (item.trimStart || 0) + item.duration >= (item.originalDuration - 0.001) 
    : false;

  const thumbnails = useMemo(() => {
    if (item.type !== 'video' || !item.url) return null;
    const thumbWidth = 57; 
    const count = Math.max(1, Math.ceil(clipWidth / thumbWidth));
    const safeCount = Math.min(count, 15); 
    const frames = [];
    for (let i = 0; i < safeCount; i++) {
      const timeOffset = (i / safeCount) * item.duration;
      frames.push(<VideoFrame key={`${item.id}-thumb-${i}`} url={item.url} time={timeOffset + item.trimStart} />);
    }
    return frames;
  }, [item.id, item.type, item.url, item.duration, item.trimStart, clipWidth]);

  const ghostWidth = (item.originalDuration || item.duration) * pxPerSec;
  const ghostOffset = -(item.trimStart || 0) * pxPerSec;

  return (
    <div
      className={`absolute transition-shadow ${isDragging ? 'z-50' : isSelected ? 'z-30' : 'z-20'}`}
      style={{
        left: item.startTime * pxPerSec,
        top: top,
        width: clipWidth,
        height: height,
      }}
    >
      {item.type === 'video' && item.originalDuration && (
        <div 
          className="absolute pointer-events-none border border-white/5 bg-white/[0.03] rounded-sm opacity-40 z-0"
          style={{
            left: ghostOffset,
            width: ghostWidth,
            height: height,
            top: 0,
            borderStyle: 'dashed'
          }}
        />
      )}

      <div
        className={`absolute inset-0 rounded-none overflow-hidden cursor-grab active:cursor-grabbing border will-change-transform z-10
          ${isDragging ? 'border-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.3)] brightness-110' : 
            isSelected ? 'border-green-400 ring-1 ring-green-400/20' : 'border-zinc-700 hover:border-blue-400'
          }
          ${item.type === 'audio' ? 'bg-emerald-900/40' : item.type === 'video' ? 'bg-zinc-800' : item.color}`}
      >
        {isDragging && (
          <>
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-violet-600/60 via-violet-600/20 to-transparent pointer-events-none z-40 border-l-2 border-violet-400" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-violet-600/60 via-violet-600/20 to-transparent pointer-events-none z-40 border-r-2 border-violet-400" />
          </>
        )}

        {item.type === 'video' && (
          <div className="absolute inset-0 flex flex-row overflow-hidden pointer-events-none select-none z-0">
            {thumbnails}
            <div className="flex-1 bg-zinc-900" />
          </div>
        )}

        {item.type === 'audio' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none overflow-hidden">
             <div className="flex gap-[1px] h-4">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="w-[2px] bg-emerald-400 rounded-full" style={{ height: `${Math.random() * 100}%` }} />
                ))}
             </div>
          </div>
        )}

        <div className="absolute inset-0 z-10 cursor-inherit pointer-events-auto" onMouseDown={(e) => { e.stopPropagation(); onSelect(item.id); onDragStart(e, item); }} />

        {/* 標籤容器：內縮 px-5 避開拖拉柄，移除檔名 span 顯示 */}
        <div className="absolute inset-0 z-20 flex items-center gap-1.5 px-5 truncate pointer-events-none text-white/90">
          {item.type === 'text' && <Type size={11} className="shrink-0 text-indigo-400 drop-shadow-md" />}
          {item.type === 'audio' && <Music size={11} className="shrink-0 text-emerald-400 drop-shadow-md" />}
          
          {/* 已移除檔名文字顯示 */}
          
          {item.type === 'video' && (
            <div className="flex items-center opacity-90 shrink-0 drop-shadow-md">
              {item.muted ? <VolumeX size={10} className="text-red-400" /> : <Volume2 size={10} className="text-indigo-400" />}
            </div>
          )}
        </div>

        <div 
          onMouseDown={(e) => { e.stopPropagation(); onTrimStart(e, item, 'trim-start'); }} 
          className="absolute left-0 top-0 bottom-0 w-4 hover:bg-white/5 cursor-ew-resize transition-colors flex items-center justify-center group z-50"
        >
          <div className={`w-[2px] h-1/2 rounded-none transition-all duration-150
            ${(isAtSourceStart) 
              ? 'bg-zinc-600 group-hover:bg-red-500 group-hover:scale-x-150 group-hover:shadow-[0_0_10px_rgba(239,68,68,0.8)]' 
              : isSelected ? 'bg-green-400' : 'bg-zinc-600 group-hover:bg-blue-300'}
            ${isDragging && isAtSourceStart ? 'bg-red-500 scale-x-150 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}
          `} />
        </div>

        <div 
          onMouseDown={(e) => { e.stopPropagation(); onTrimStart(e, item, 'trim-end'); }} 
          className="absolute right-0 top-0 bottom-0 w-4 hover:bg-white/5 cursor-ew-resize transition-colors flex items-center justify-center group z-50"
        >
          <div className={`w-[2px] h-1/2 rounded-none transition-all duration-150
            ${(isAtSourceEnd) 
              ? 'bg-zinc-600 group-hover:bg-red-500 group-hover:scale-x-150 group-hover:shadow-[0_0_10px_rgba(239,68,68,0.8)]' 
              : isSelected ? 'bg-green-400' : 'bg-zinc-600 group-hover:bg-blue-300'}
            ${isDragging && isAtSourceEnd ? 'bg-red-500 scale-x-150 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}
          `} />
        </div>
      </div>
    </div>
  );
});
