
import React from 'react';
import { Clapperboard, Settings2, Download, Folder } from 'lucide-react';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onOpenProjectManager: () => void;
  onSettingsClick: () => void;
  onBrandClick: () => void;
  onRenderClick: () => void;
  timeDisplayRef: React.RefObject<HTMLSpanElement>;
  projectDuration: number;
}

const formatTime = (t: number) => {
  const mins = Math.floor(t / 60).toString().padStart(2, '0');
  const secs = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t % 1) * 100).toString().padStart(2, '0');
  return `${mins}:${secs}:${ms}`;
};

export const Header = ({ 
  projectName, onProjectNameChange, onOpenProjectManager,
  onSettingsClick, onBrandClick, onRenderClick, timeDisplayRef, projectDuration 
}: HeaderProps) => (
  <header className="h-8 flex items-center justify-between px-3 border-b border-black bg-[#151518] shrink-0">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 px-2 bg-indigo-600/20 py-0.5 rounded cursor-pointer group" onClick={onBrandClick}>
        <Clapperboard size={14} className="text-indigo-500 group-hover:text-indigo-400 transition-colors" />
        <span className="font-black text-indigo-100 text-[10px] tracking-tight uppercase">RAPIDCUT</span>
      </div>
      
      <div className="h-4 w-[1px] bg-white/5 mx-1" />

      <div className="flex items-center gap-2">
        <button 
          onClick={onOpenProjectManager}
          className="p-1 text-zinc-500 hover:text-indigo-400 transition-colors"
          title="Project Manager"
        >
          <Folder size={12} />
        </button>
        <input 
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className="bg-transparent border-none text-[10px] font-black text-zinc-300 uppercase tracking-tighter focus:outline-none focus:text-white w-32 truncate"
          placeholder="Untitled Project"
        />
      </div>

      <div className="flex items-center gap-3 text-[9px] uppercase font-bold tracking-widest text-zinc-500">
        <button onClick={onSettingsClick} className="hover:text-indigo-400 flex items-center gap-1 transition-colors">
          <Settings2 size={10} /> Settings
        </button>
      </div>
    </div>
    
    <div className="flex items-center gap-3">
      <div className="bg-black/40 px-2 py-0.5 rounded border border-white/5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
        <span ref={timeDisplayRef} className="text-zinc-100 font-bold">00:00:00</span>
        <span className="text-zinc-700 font-bold">/</span>
        <span className="text-zinc-500">{formatTime(projectDuration)}</span>
      </div>
      <button 
        onClick={onRenderClick}
        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-0.5 rounded text-[10px] font-black transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 group"
      >
        <Download size={10} className="group-hover:translate-y-0.5 transition-transform" /> RENDER
      </button>
    </div>
  </header>
);
