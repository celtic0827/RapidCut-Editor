
import React from 'react';
import { ZoomIn, ZoomOut, Magnet, Plus } from 'lucide-react';
import { TimelineItem, TrackType } from './types';
import { LANE_HEIGHT, MAX_VIDEO_DURATION, MIN_ZOOM, MAX_ZOOM } from './constants';
import { TimelineClip } from './TimelineClip';

interface TimelineProps {
  items: TimelineItem[];
  pxPerSec: number;
  setPxPerSec: (val: number | ((p: number) => number)) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  isMagnetEnabled: boolean;
  setIsMagnetEnabled: (val: boolean) => void;
  projectDuration: number;
  onAddItem: (type: TrackType) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onStartDrag: (e: React.MouseEvent, item: TimelineItem, type: 'move' | 'trim') => void;
  // Use React.ReactNode[] instead of JSX.Element[] to avoid "Cannot find namespace 'JSX'" error
  renderRuler: React.ReactNode[];
  playheadRef: React.RefObject<HTMLDivElement>;
  timelineRef: React.RefObject<HTMLDivElement>;
}

export const Timeline = ({
  items, pxPerSec, setPxPerSec, selectedItemId, setSelectedItemId,
  isMagnetEnabled, setIsMagnetEnabled, projectDuration, onAddItem,
  onMouseDown, onStartDrag, renderRuler, playheadRef, timelineRef
}: TimelineProps) => {
  return (
    <footer className="h-48 bg-[#1a1a1e] flex flex-col border-t border-black shrink-0 relative z-20">
      <div className="h-8 border-b border-black flex items-center justify-between px-3 bg-[#151518]">
        <div className="flex gap-4">
          <button onClick={() => onAddItem('video')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white font-black text-[9px] uppercase transition-colors"><Plus size={10} /> Video</button>
          <button onClick={() => onAddItem('text')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white font-black text-[9px] uppercase transition-colors"><Plus size={10} /> Text</button>
        </div>
        
        <div className="flex items-center gap-3 bg-black/20 px-2 rounded h-6">
          <ZoomOut size={10} className="text-zinc-600 cursor-pointer" onClick={() => setPxPerSec(p => Math.max(MIN_ZOOM, p * 0.8))} />
          <input 
            type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.1" value={pxPerSec} 
            onChange={(e) => setPxPerSec(parseFloat(e.target.value))}
            className="w-20 md:w-24 h-1 bg-zinc-800 appearance-none rounded-full accent-indigo-500 cursor-pointer"
          />
          <ZoomIn size={10} className="text-zinc-600 cursor-pointer" onClick={() => setPxPerSec(p => Math.min(MAX_ZOOM, p * 1.2))} />
          <div className="h-3 w-[1px] bg-zinc-800 mx-1" />
          <button onClick={() => setIsMagnetEnabled(!isMagnetEnabled)} className={`p-1 transition-colors ${isMagnetEnabled ? 'text-indigo-500' : 'text-zinc-700 hover:text-zinc-400'}`} title="Toggle Magnet Snap"><Magnet size={12} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-10 border-r border-black flex flex-col bg-[#1a1a1e] shrink-0 z-40">
           <div style={{ height: '24px' }} className="border-b border-black/50 bg-[#151518] shrink-0" />
           {['T1', 'V1', 'A1'].map(label => (
             <div key={label} style={{ height: `${LANE_HEIGHT}px` }} className="flex items-center justify-center text-[9px] font-black text-zinc-700 border-b border-black/50 shrink-0">{label}</div>
           ))}
        </div>

        <div ref={timelineRef} className="flex-1 overflow-x-auto relative bg-[#0c0c0e] scrollbar-thin scroll-smooth" onMouseDown={onMouseDown}>
          <div className="h-full relative" style={{ width: MAX_VIDEO_DURATION * pxPerSec + 200 }}>
            <div style={{ height: '24px' }} className="w-full border-b border-white/5 relative bg-black/5 cursor-crosshair shrink-0">
              {renderRuler}
            </div>
            
            <div className="absolute top-0 bottom-0 pointer-events-none z-10 border-r border-white/20 bg-white/5" style={{ left: 0, width: projectDuration * pxPerSec }}>
               <div className="absolute top-0 right-0 h-full w-[2px] bg-zinc-600/50 shadow-[0_0_8px_rgba(255,255,255,0.1)]" />
            </div>

            <div className="relative h-full">
              {[0, 1, 2].map(i => <div key={i} style={{ height: `${LANE_HEIGHT}px` }} className="w-full border-b border-white/5 shrink-0" />)}
              {items.map(item => (
                <TimelineClip 
                  key={item.id} item={item} isSelected={selectedItemId === item.id}
                  pxPerSec={pxPerSec} onSelect={setSelectedItemId}
                  onDragStart={(e) => onStartDrag(e, item, 'move')}
                  onTrimStart={(e) => onStartDrag(e, item, 'trim')}
                />
              ))}
            </div>

            <div ref={playheadRef} className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-50 pointer-events-none shadow-[0_0_12px_rgba(239,68,68,0.8)] will-change-transform" style={{ left: 0, transform: `translate3d(0, 0, 0)` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-3.5 bg-red-500 rounded-b-sm border-x border-b border-red-700" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
