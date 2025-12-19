
import React from 'react';
import { TimelineItem, ProjectSettings } from './types';

interface PreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  items: TimelineItem[];
  currentTime: number;
  projectDuration: number;
  projectSettings: ProjectSettings;
  activeClip?: TimelineItem;
  isPlaying: boolean;
  isTrimming?: boolean;
}

const formatTime = (t: number) => {
  const mins = Math.floor(t / 60).toString().padStart(2, '0');
  const secs = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t % 1) * 100).toString().padStart(2, '0');
  return `${mins}:${secs}:${ms}`;
};

export const PreviewPlayer = ({ 
  videoRef, items, currentTime, projectDuration, projectSettings, activeClip, isPlaying, isTrimming
}: PreviewPlayerProps) => {
  const fx = activeClip?.fx;
  const isShakeActive = fx?.shakeEnabled && isPlaying;

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-0 bg-[#101012]">
      <div 
        className="relative bg-black border border-white/5 shadow-2xl overflow-hidden flex items-center justify-center" 
        style={{ 
          aspectRatio: `${projectSettings.width} / ${projectSettings.height}`,
          height: '100%', maxHeight: '100%', maxWidth: '100%'
        }}
      >
        <div 
          className={`w-full h-full will-change-transform ${isShakeActive ? 'animate-handheld' : ''}`}
          style={{
            '--s-int': fx?.shakeIntensity || 1,
            '--s-freq': fx?.shakeFrequency || 1,
            '--s-delay': `-${(fx?.seed || 0) % 10}s`, 
            transformOrigin: 'center center',
            transform: `scale(${fx?.shakeEnabled ? fx.shakeZoom : 1})`
          } as any}
        >
          <video ref={videoRef} className="w-full h-full object-contain pointer-events-none" playsInline muted />
        </div>

        {/* Dynamic Titles */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
          {items.filter(i => i.type === 'text' && currentTime >= i.startTime && currentTime <= i.startTime + i.duration).map(item => (
            <div key={item.id} className="animate-reveal text-center px-4 max-w-full">
              <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-2xl text-shadow-glow leading-tight">
                {item.content}
              </h2>
            </div>
          ))}
        </div>

        {/* HUD UI */}
        <div className="absolute top-2 left-2 flex items-center gap-2 opacity-50 pointer-events-none">
          <div className={`w-1.5 h-1.5 rounded-full ${isTrimming ? 'bg-amber-500' : 'bg-red-600 animate-pulse'}`} />
          <span className="text-[7px] font-black uppercase text-white tracking-widest">
            {isTrimming ? 'Trim Preview' : 'Live Preview'}
          </span>
        </div>

        {isTrimming && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-600/90 rounded text-[9px] font-black text-white uppercase tracking-tighter flex items-center gap-2 shadow-2xl backdrop-blur-md animate-fade-in border border-amber-400/50">
            <span className="opacity-70">Seek</span>
            {formatTime(currentTime)}
          </div>
        )}
      </div>
      <style>{`
        .text-shadow-glow { text-shadow: 0 0 15px rgba(255,255,255,0.4), 0 0 30px rgba(99,102,241,0.5); }
      `}</style>
    </div>
  );
};
