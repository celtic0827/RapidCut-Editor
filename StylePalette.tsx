
import React from 'react';
import { Wand2, Star, Zap } from 'lucide-react';
import { FXPreset } from './types';

interface StylePaletteProps {
  presets: FXPreset[];
  onApplyPreset: (preset: FXPreset) => void;
}

export const StylePalette = ({ presets, onApplyPreset }: StylePaletteProps) => {
  return (
    <aside className="w-48 border-r border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden">
      <div className="h-8 flex items-center px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Wand2 size={12} /> Styles
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {presets.map((preset) => (
          <div 
            key={preset.id}
            onClick={() => onApplyPreset(preset)}
            className="p-2.5 bg-zinc-900/40 border border-zinc-800 rounded cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/5 transition-all group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Zap size={10} className="text-indigo-500" />
            </div>
            
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star size={10} className="text-indigo-400 shrink-0" fill="currentColor" />
              <span className="text-[9px] font-black text-zinc-300 uppercase tracking-tight truncate group-hover:text-indigo-300">
                {preset.name}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              <span className="text-[6px] px-1.5 py-0.5 bg-black/50 text-zinc-500 rounded font-black uppercase tracking-widest group-hover:text-indigo-400 group-hover:bg-indigo-900/20">
                Shake {preset.fx.shakeIntensity.toFixed(1)}
              </span>
              <span className="text-[6px] px-1.5 py-0.5 bg-black/50 text-zinc-500 rounded font-black uppercase tracking-widest group-hover:text-indigo-400 group-hover:bg-indigo-900/20">
                {preset.fx.shakeFrequency > 1.5 ? 'Fast' : 'Smooth'}
              </span>
            </div>
          </div>
        ))}
        
        {presets.length === 0 && (
          <div className="text-center py-10 opacity-10 uppercase text-[7px] font-black">No Styles</div>
        )}
      </div>
    </aside>
  );
};
