
import React, { memo } from 'react';
import { Video, Type, Music } from 'lucide-react';
import { TimelineItem } from './types';
import { LANE_HEIGHT, CLIP_HEIGHT } from './constants';

interface ClipProps {
  item: TimelineItem;
  isSelected: boolean;
  pxPerSec: number;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, item: TimelineItem) => void;
  onTrimStart: (e: React.MouseEvent, item: TimelineItem) => void;
}

export const TimelineClip = memo(({ 
  item, 
  isSelected, 
  pxPerSec,
  onSelect, 
  onDragStart, 
  onTrimStart 
}: ClipProps) => {
  // Order: Text (Row 0), Video (Row 1), Audio (Row 2)
  // Each lane is LANE_HEIGHT (36px). We center the clip (CLIP_HEIGHT=32px) with a 2px offset.
  const top = item.type === 'text' ? 2 : item.type === 'video' ? LANE_HEIGHT + 2 : (LANE_HEIGHT * 2) + 2;
  
  return (
    <div
      onMouseDown={(e) => {
        onSelect(item.id);
        onDragStart(e, item);
      }}
      className={`absolute h-8 ${item.color} rounded-sm flex items-center px-2 text-[10px] font-bold text-white/90 shadow-sm overflow-hidden cursor-default border transition-[border-color,box-shadow,brightness,transform] duration-150 will-change-transform clip-item
        ${isSelected ? 'border-white/80 z-30 shadow-lg brightness-110' : 'border-black/30 hover:border-white/40 hover:brightness-105'}`}
      style={{
        left: item.startTime * pxPerSec,
        width: item.duration * pxPerSec,
        top: top,
        transform: `translate3d(0, 0, 0)`
      }}
    >
      <div className="flex items-center gap-1.5 truncate">
        {item.type === 'video' && <Video size={11} className="shrink-0 text-white/60" />}
        {item.type === 'text' && <Type size={11} className="shrink-0 text-white/60" />}
        {item.type === 'audio' && <Music size={11} className="shrink-0 text-white/60" />}
        <span className="truncate select-none uppercase tracking-tighter">{item.name}</span>
      </div>
      <div 
        onMouseDown={(e) => { e.stopPropagation(); onTrimStart(e, item); }}
        className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/10 cursor-ew-resize transition-colors flex items-center justify-center group"
      >
        <div className="w-[1.5px] h-3 bg-white/20 group-hover:bg-white/50 rounded-full" />
      </div>
    </div>
  );
});
