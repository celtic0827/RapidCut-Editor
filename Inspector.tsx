
import React from 'react';
import { Trash2, Monitor, Waves, Zap, Hash, Scaling } from 'lucide-react';
import { TimelineItem } from './types';

interface InspectorProps {
  activeItem: TimelineItem | undefined;
  onUpdateItem: (id: string, updates: Partial<TimelineItem>) => void;
  onDeleteItem: (id: string) => void;
  isShakeEnabled: boolean;
  setIsShakeEnabled: (val: boolean) => void;
  shakeIntensity: number;
  setShakeIntensity: (val: number) => void;
  shakeFrequency: number;
  setShakeFrequency: (val: number) => void;
  shakeSeed: number;
  setShakeSeed: (val: number) => void;
  shakeZoom: number;
  setShakeZoom: (val: number) => void;
}

export const Inspector = ({ 
  activeItem, onUpdateItem, onDeleteItem, 
  isShakeEnabled, setIsShakeEnabled, 
  shakeIntensity, setShakeIntensity,
  shakeFrequency, setShakeFrequency,
  shakeSeed, setShakeSeed,
  shakeZoom, setShakeZoom
}: InspectorProps) => (
  <aside className="w-60 border-l border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden">
    <div className="h-8 flex items-center px-3 border-b border-black bg-[#1a1a1e]">
      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Inspector</span>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
      {activeItem ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Clip Properties</span>
            <button onClick={() => onDeleteItem(activeItem.id)} className="text-zinc-600 hover:text-rose-500 transition-colors"><Trash2 size={12} /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[8px] text-zinc-600 uppercase font-black mb-1 block">Clip Name</label>
              <input 
                type="text" value={activeItem.name} 
                onChange={e => onUpdateItem(activeItem.id, { name: e.target.value })} 
                className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-100 focus:outline-none focus:border-indigo-500" 
              />
            </div>
            
            {activeItem.type === 'video' && (
              <div className="pt-2">
                <div className="flex items-center justify-between group cursor-pointer" onClick={() => onUpdateItem(activeItem.id, { allowExtension: !activeItem.allowExtension })}>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-tight">Frame Extension</span>
                    <span className="text-[7px] text-zinc-600 uppercase">Freeze last frame</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${activeItem.allowExtension ? 'bg-indigo-600' : 'bg-zinc-800'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${activeItem.allowExtension ? 'left-4.5' : 'left-0.5'}`} style={{ left: activeItem.allowExtension ? '1.125rem' : '0.125rem' }} />
                  </div>
                </div>
              </div>
            )}

            {activeItem.type === 'text' && (
              <div>
                <label className="text-[8px] text-zinc-600 uppercase font-black mb-1 block">Content</label>
                <textarea 
                  value={activeItem.content} 
                  onChange={e => onUpdateItem(activeItem.id, { content: e.target.value })} 
                  className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-100 h-20 resize-none focus:outline-none focus:border-indigo-500" 
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center flex flex-col items-center gap-3 opacity-50">
          <Monitor size={32} className="text-zinc-800" />
          <p className="text-[8px] uppercase font-bold tracking-widest">Select a clip to edit</p>
        </div>
      )}

      {/* Global Handheld FX Controls */}
      <div className="pt-4 border-t border-zinc-900 space-y-5">
        <div className="flex items-center justify-between text-[9px] font-black text-indigo-400 uppercase tracking-widest">
          <span>Handheld FX</span>
          <input 
            type="checkbox" 
            checked={isShakeEnabled} 
            onChange={e => setIsShakeEnabled(e.target.checked)} 
            className="accent-indigo-500 w-3 h-3 cursor-pointer" 
          />
        </div>

        <div className={`space-y-4 transition-opacity ${isShakeEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
          {/* Intensity / Distance */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[8px] font-black text-zinc-600 uppercase">
              <div className="flex items-center gap-1.5"><Waves size={10}/> Max Distance</div>
              <span className="text-indigo-400 font-mono">{shakeIntensity.toFixed(1)}px</span>
            </div>
            <input 
              type="range" min="0" max="8" step="0.1" 
              value={shakeIntensity} 
              onChange={(e) => setShakeIntensity(parseFloat(e.target.value))} 
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
            />
          </div>

          {/* Frequency / Speed */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[8px] font-black text-zinc-600 uppercase">
              <div className="flex items-center gap-1.5"><Zap size={10}/> Speed Multiplier</div>
              <span className="text-indigo-400 font-mono">x{shakeFrequency.toFixed(1)}</span>
            </div>
            <input 
              type="range" min="0.1" max="4" step="0.1" 
              value={shakeFrequency} 
              onChange={(e) => setShakeFrequency(parseFloat(e.target.value))} 
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
            />
          </div>

          {/* Random Seed */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[8px] font-black text-zinc-600 uppercase">
              <div className="flex items-center gap-1.5"><Hash size={10}/> Random Seed</div>
              <span className="text-indigo-400 font-mono">{shakeSeed}</span>
            </div>
            <input 
              type="range" min="1" max="10" step="1" 
              value={shakeSeed} 
              onChange={(e) => setShakeSeed(parseInt(e.target.value))} 
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
            />
          </div>

          {/* Zoom / Scale */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[8px] font-black text-zinc-600 uppercase">
              <div className="flex items-center gap-1.5"><Scaling size={10}/> Safe Zoom</div>
              <span className="text-indigo-400 font-mono">{(shakeZoom * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range" min="1.0" max="1.3" step="0.01" 
              value={shakeZoom} 
              onChange={(e) => setShakeZoom(parseFloat(e.target.value))} 
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
            />
          </div>
        </div>
      </div>
    </div>
  </aside>
);
