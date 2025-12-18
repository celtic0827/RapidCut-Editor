
import React from 'react';
import { Layers, Settings2 } from 'lucide-react';
import { ProjectSettings } from './types';

interface HeaderProps {
  onSettingsClick: () => void;
  onBrandClick: () => void;
  timeDisplayRef: React.RefObject<HTMLSpanElement>;
}

export const Header = ({ onSettingsClick, onBrandClick, timeDisplayRef }: HeaderProps) => (
  <header className="h-8 flex items-center justify-between px-3 border-b border-black bg-[#151518] shrink-0">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 px-1 bg-indigo-500/10 py-0.5 rounded cursor-pointer" onClick={onBrandClick}>
        <Layers size={12} className="text-indigo-500" />
        <span className="font-black text-indigo-100 text-[10px] tracking-tight">QC PRO</span>
      </div>
      <div className="flex items-center gap-3 text-[9px] uppercase font-bold tracking-widest text-zinc-500">
        <button className="hover:text-zinc-200 transition-colors">File</button>
        <button className="hover:text-zinc-200 transition-colors">Edit</button>
        <button onClick={onSettingsClick} className="hover:text-indigo-400 flex items-center gap-1 transition-colors">
          <Settings2 size={10} /> Project
        </button>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <div className="bg-black/40 px-2 py-0.5 rounded border border-white/5">
        <span ref={timeDisplayRef} className="font-mono text-zinc-100 text-xs tabular-nums">00:00:00</span>
      </div>
      <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-0.5 rounded text-[10px] font-black transition-all">RENDER</button>
    </div>
  </header>
);
