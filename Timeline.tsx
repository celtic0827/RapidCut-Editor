
import React from 'react';
import { ZoomIn, ZoomOut, Magnet, Plus, Scissors, LayoutGrid } from 'lucide-react';
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
  onSplit: () => void;
  onAutoArrange: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onStartDrag: (e: React.MouseEvent, item: TimelineItem, type: 'move' | 'trim-start' | 'trim-end') => void;
  renderRuler: React.ReactNode[];
  playheadRef: React.RefObject<HTMLDivElement>;
  timelineRef: React.RefObject<HTMLDivElement>;
  onDropFromLibrary: (asset: { name: string, url: string, duration: number }, startTime: number) => void;
  draggingAsset: {name: string, url: string, duration: number} | null;
  dragOverTime: number | null;
  onDragUpdate: (t: number) => void;
}

export const Timeline = ({
  items, pxPerSec, setPxPerSec, selectedItemId, setSelectedItemId,
  isMagnetEnabled, setIsMagnetEnabled, projectDuration, onAddItem, onSplit, onAutoArrange,
  onMouseDown, onStartDrag, renderRuler, playheadRef, timelineRef,
  onDropFromLibrary, draggingAsset, dragOverTime, onDragUpdate
}: TimelineProps) => {

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data || !timelineRef.current) return;

    try {
      const asset = JSON.parse(data);
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const startTime = Math.max(0, x / pxPerSec);
      onDropFromLibrary(asset, startTime);
    } catch (err) {
      console.error('Failed to parse dropped asset data', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    if (draggingAsset && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
      const startTime = Math.max(0, x / pxPerSec);
      onDragUpdate(startTime);
    }
  };

  return (
    <footer className="h-48 bg-[#1a1a1e] flex flex-col border-t border-black shrink-0 relative z-20">
      <div className="h-8 border-b border-black flex items-center justify-between px-3 bg-[#151518]">
        {/* Left: Track Management */}
        <div className="flex gap-4 w-1/4">
          <button onClick={() => onAddItem('video')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white font-black text-[9px] uppercase transition-colors"><Plus size={10} /> Video</button>
          <button onClick={() => onAddItem('text')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white font-black text-[9px] uppercase transition-colors"><Plus size={10} /> Text</button>
        </div>
        
        {/* Center: Editing Tools */}
        <div className="flex items-center bg-black/40 rounded px-1 h-6">
          <button 
            onClick={onSplit}
            className="flex items-center gap-1.5 px-3 py-1 text-zinc-400 hover:text-white hover:bg-white/5 transition-all rounded-l-sm border-r border-white/5"
            title="Split Clip (S)"
          >
            <Scissors size={11} />
            <span className="text-[9px] font-black uppercase tracking-tighter">Split</span>
          </button>
          
          <button 
            onClick={onAutoArrange}
            className="flex items-center gap-1.5 px-3 py-1 text-zinc-400 hover:text-white hover:bg-white/5 transition-all border-r border-white/5"
            title="Auto Arrange Sequence"
          >
            <LayoutGrid size={11} />
            <span className="text-[9px] font-black uppercase tracking-tighter">Arrange</span>
          </button>

          <button 
            onClick={() => setIsMagnetEnabled(!isMagnetEnabled)} 
            className={`px-3 py-1 flex items-center gap-1.5 transition-all rounded-r-sm ${isMagnetEnabled ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
            title="Toggle Magnet Snap"
          >
            <Magnet size={11} />
            <span className="text-[9px] font-black uppercase tracking-tighter">Magnet</span>
          </button>
        </div>

        {/* Right: Viewport Controls */}
        <div className="flex items-center justify-end gap-3 w-1/4">
          <div className="flex items-center gap-2 bg-black/20 px-2 rounded h-5">
            <ZoomOut size={10} className="text-zinc-600 cursor-pointer hover:text-zinc-400" onClick={() => setPxPerSec(p => Math.max(MIN_ZOOM, p * 0.8))} />
            <input 
              type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.1" value={pxPerSec} 
              onChange={(e) => setPxPerSec(parseFloat(e.target.value))}
              className="w-16 h-1 bg-zinc-800 appearance-none rounded-full accent-indigo-500 cursor-pointer"
            />
            <ZoomIn size={10} className="text-zinc-600 cursor-pointer hover:text-zinc-400" onClick={() => setPxPerSec(p => Math.min(MAX_ZOOM, p * 1.2))} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-10 border-r border-black flex flex-col bg-[#1a1a1e] shrink-0 z-40">
           <div style={{ height: '24px' }} className="border-b border-black/50 bg-[#151518] shrink-0" />
           {['T1', 'V1', 'A1'].map(label => (
             <div key={label} style={{ height: `${LANE_HEIGHT}px` }} className="flex items-center justify-center text-[9px] font-black text-zinc-700 border-b border-black/50 shrink-0">{label}</div>
           ))}
        </div>

        <div 
          ref={timelineRef} 
          className="flex-1 overflow-x-auto relative bg-[#0c0c0e] scrollbar-thin scroll-smooth" 
          onMouseDown={onMouseDown}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="h-full relative" style={{ width: MAX_VIDEO_DURATION * pxPerSec + 200 }}>
            <div style={{ height: '24px' }} className="w-full border-b border-white/5 relative bg-black/5 cursor-crosshair shrink-0">
              {renderRuler}
            </div>
            
            <div className="absolute top-0 bottom-0 pointer-events-none z-10 border-r border-white/20 bg-white/5" style={{ left: 0, width: projectDuration * pxPerSec }}>
               <div className="absolute top-0 right-0 h-full w-[2px] bg-zinc-600/50 shadow-[0_0_8px_rgba(255,255,255,0.1)]" />
            </div>

            <div className="relative h-full">
              {[0, 1, 2].map(i => <div key={i} style={{ height: `${LANE_HEIGHT}px` }} className="w-full border-b border-white/5 shrink-0" />)}
              
              {/* Actual Clips */}
              {items.map(item => (
                <TimelineClip 
                  key={item.id} item={item} isSelected={selectedItemId === item.id}
                  pxPerSec={pxPerSec} onSelect={setSelectedItemId}
                  onDragStart={(e) => onStartDrag(e, item, 'move')}
                  onTrimStart={(e, i, type) => onStartDrag(e, i, type)}
                />
              ))}

              {/* Ghost Preview for Library Dragging */}
              {draggingAsset && dragOverTime !== null && (
                <div 
                  className="absolute opacity-40 pointer-events-none z-50 animate-pulse"
                  style={{ left: 0, top: 0, width: '100%', height: '100%' }}
                >
                  <TimelineClip 
                    item={{
                      id: 'ghost',
                      type: 'video',
                      startTime: dragOverTime,
                      duration: draggingAsset.duration,
                      trimStart: 0,
                      name: draggingAsset.name,
                      url: draggingAsset.url,
                      color: 'bg-indigo-500'
                    }}
                    isSelected={false}
                    pxPerSec={pxPerSec}
                    onSelect={() => {}}
                    onDragStart={() => {}}
                    onTrimStart={() => {}}
                  />
                </div>
              )}
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
