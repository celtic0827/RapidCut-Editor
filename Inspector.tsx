
import React, { useState } from 'react';
import { Trash2, Monitor, Waves, Zap, Hash, Scaling, Save, Wand2, RefreshCw } from 'lucide-react';
import { TimelineItem, ClipFX } from './types';

interface InspectorProps {
  activeItem: TimelineItem | undefined;
  onUpdateItem: (id: string, updates: Partial<TimelineItem>) => void;
  onDeleteItem: (id: string) => void;
  onSavePreset: (name: string, fx: ClipFX) => void;
}

export const Inspector = ({ activeItem, onUpdateItem, onDeleteItem, onSavePreset }: InspectorProps) => {
  const [presetName, setPresetName] = useState('');

  const updateFX = (upd: Partial<ClipFX>) => {
    if (!activeItem || !activeItem.fx) return;
    onUpdateItem(activeItem.id, { fx: { ...activeItem.fx, ...upd } });
  };

  return (
    <aside className="w-60 border-l border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden">
      <div className="h-8 flex items-center px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Inspector</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
        {activeItem ? (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{activeItem.type} Clip</span>
              <button onClick={() => onDeleteItem(activeItem.id)} className="text-zinc-600 hover:text-rose-500 transition-colors"><Trash2 size={12} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[8px] text-zinc-600 uppercase font-black mb-1 block">Title</label>
                <input 
                  type="text" value={activeItem.name} 
                  onChange={e => onUpdateItem(activeItem.id, { name: e.target.value })} 
                  className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-100 focus:outline-none focus:border-indigo-500" 
                />
              </div>

              {activeItem.type === 'text' && (
                <div>
                  <label className="text-[8px] text-zinc-600 uppercase font-black mb-1 block">Text Content</label>
                  <textarea 
                    value={activeItem.content} 
                    onChange={e => onUpdateItem(activeItem.id, { content: e.target.value })} 
                    className="w-full h-16 bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-100 resize-none focus:outline-none"
                  />
                </div>
              )}

              {activeItem.type === 'video' && activeItem.fx && (
                <div className="pt-4 border-t border-zinc-900 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Handheld FX</span>
                    <input 
                      type="checkbox" 
                      checked={activeItem.fx.shakeEnabled} 
                      onChange={e => updateFX({ shakeEnabled: e.target.checked })} 
                      className="accent-indigo-500 w-3 h-3 cursor-pointer" 
                    />
                  </div>

                  <div className={`space-y-3 transition-opacity ${activeItem.fx.shakeEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[7px] font-bold text-zinc-500 uppercase">
                        <span>Intensity</span>
                        <span className="text-indigo-400">{activeItem.fx.shakeIntensity.toFixed(1)}</span>
                      </div>
                      <input type="range" min="0" max="8" step="0.1" value={activeItem.fx.shakeIntensity} onChange={e => updateFX({ shakeIntensity: parseFloat(e.target.value) })} className="w-full h-1 bg-zinc-800 accent-indigo-500" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[7px] font-bold text-zinc-500 uppercase">
                        <span>Speed</span>
                        <span className="text-indigo-400">x{activeItem.fx.shakeFrequency.toFixed(1)}</span>
                      </div>
                      <input type="range" min="0.1" max="4" step="0.1" value={activeItem.fx.shakeFrequency} onChange={e => updateFX({ shakeFrequency: parseFloat(e.target.value) })} className="w-full h-1 bg-zinc-800 accent-indigo-500" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[7px] font-bold text-zinc-500 uppercase">
                        <span>Zoom</span>
                        <span className="text-indigo-400">{activeItem.fx.shakeZoom.toFixed(2)}x</span>
                      </div>
                      <input type="range" min="1" max="1.5" step="0.01" value={activeItem.fx.shakeZoom} onChange={e => updateFX({ shakeZoom: parseFloat(e.target.value) })} className="w-full h-1 bg-zinc-800 accent-indigo-500" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[7px] font-bold text-zinc-500 uppercase items-center">
                        <span>Random Seed</span>
                        <div className="flex items-center gap-2">
                           <span className="text-indigo-400">{activeItem.fx.seed}</span>
                           <button onClick={() => updateFX({ seed: Math.floor(Math.random() * 100) })} className="text-zinc-600 hover:text-indigo-400 transition-colors">
                              <RefreshCw size={10} />
                           </button>
                        </div>
                      </div>
                      <input type="range" min="0" max="100" step="1" value={activeItem.fx.seed} onChange={e => updateFX({ seed: parseInt(e.target.value) })} className="w-full h-1 bg-zinc-800 accent-indigo-500" />
                    </div>
                  </div>

                  {/* Save Preset UI */}
                  <div className="pt-4 border-t border-zinc-900 space-y-2">
                    <label className="text-[8px] text-zinc-600 uppercase font-black block">Save as Style</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" placeholder="Preset Name..." value={presetName}
                        onChange={e => setPresetName(e.target.value)}
                        className="flex-1 bg-black border border-zinc-800 rounded px-2 py-1 text-[9px] text-zinc-200 focus:outline-none focus:border-indigo-500"
                      />
                      <button 
                        onClick={() => { if(presetName) { onSavePreset(presetName, activeItem.fx!); setPresetName(''); } }}
                        className="p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
                      >
                        <Save size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center flex flex-col items-center gap-3 opacity-20">
            <Monitor size={48} />
            <p className="text-[10px] uppercase font-black tracking-widest">Select a clip</p>
          </div>
        )}
      </div>
    </aside>
  );
};
