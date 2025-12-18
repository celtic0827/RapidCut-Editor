
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
}

export const PreviewPlayer = ({ 
  videoRef, items, currentTime, projectDuration, projectSettings, activeClip, isPlaying
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
            '--s-delay': `-${(fx?.seed || 0) % 10}s`, // Use seed for unique starting point
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
          <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
          <span className="text-[7px] font-black uppercase text-white tracking-widest">Live Preview</span>
        </div>
      </div>
      <style>{`
        .text-shadow-glow { text-shadow: 0 0 15px rgba(255,255,255,0.4), 0 0 30px rgba(99,102,241,0.5); }
      `}</style>
    </div>
  );
};
