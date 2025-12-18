
import React from 'react';
import { Play, Pause, Scissors, Maximize, SkipBack, SkipForward, Repeat } from 'lucide-react';

interface TransportProps {
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  onSplit: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  isLooping: boolean;
  setIsLooping: (val: boolean) => void;
}

export const TransportControls = ({ 
  isPlaying, setIsPlaying, onSplit, onJumpToStart, 
  onJumpToEnd, isLooping, setIsLooping 
}: TransportProps) => (
  <div className="h-10 flex items-center justify-center gap-4 bg-[#151518] border-t border-black px-4 shrink-0 shadow-inner">
    <button onClick={onSplit} className="text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors mr-auto ml-2">
      <Scissors size={12} /> <span className="text-[9px] font-bold tracking-tighter">SPLIT (S)</span>
    </button>
    
    <div className="flex items-center gap-3">
      <button onClick={onJumpToStart} className="text-zinc-400 hover:text-white transition-colors" title="Jump to Start"><SkipBack size={16} fill="currentColor" /></button>
      <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-200 text-black hover:bg-white transition-all active:scale-90 shadow-lg">
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <button onClick={onJumpToEnd} className="text-zinc-400 hover:text-white transition-colors" title="Jump to End"><SkipForward size={16} fill="currentColor" /></button>
      <button 
        onClick={() => setIsLooping(!isLooping)} 
        className={`ml-2 p-1 rounded transition-all ${isLooping ? 'bg-indigo-600/20 text-indigo-400' : 'text-zinc-600 hover:text-zinc-400'}`}
        title="Toggle Loop"
      >
        <Repeat size={14} className={isLooping ? 'animate-pulse' : ''} />
      </button>
    </div>

    <button className="text-zinc-500 hover:text-white transition-colors ml-auto mr-2"><Maximize size={12} /></button>
  </div>
);
