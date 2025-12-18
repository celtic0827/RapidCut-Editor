
import React from 'react';
import { TimelineItem, ProjectSettings } from './types';

interface PreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  items: TimelineItem[];
  currentTime: number;
  projectDuration: number;
  projectSettings: ProjectSettings;
  isShakeEnabled: boolean;
  shakeIntensity: number;
  isPlaying: boolean;
}

export const PreviewPlayer = ({ 
  videoRef, items, currentTime, projectDuration, projectSettings, 
  isShakeEnabled, shakeIntensity, isPlaying 
}: PreviewPlayerProps) => {
  const isOutOfBounds = currentTime >= projectDuration && projectDuration > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-1 md:p-4 min-h-0 overflow-hidden bg-[#101012]">
      <div 
        className={`relative bg-black overflow-hidden group will-change-transform ${isShakeEnabled && isPlaying ? 'animate-handheld' : ''}`} 
        style={{ 
          '--shake-intensity': shakeIntensity,
          aspectRatio: `${projectSettings.width} / ${projectSettings.height}`,
          maxWidth: '100%',
          maxHeight: '100%'
        } as any}
      >
        <video ref={videoRef} className="w-full h-full object-contain pointer-events-none" />
        
        {/* Project Range Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 z-20">
          <div 
            className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
            style={{ width: `${projectDuration > 0 ? Math.min(100, (currentTime / projectDuration) * 100) : 0}%` }}
          />
        </div>

        {/* Out of Bounds Overlay */}
        {isOutOfBounds && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 animate-fade-in pointer-events-none">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border border-zinc-800 px-3 py-1 rounded bg-black/40">
              End of Project
            </span>
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {items.filter(i => i.type === 'text' && currentTime >= i.startTime && currentTime <= i.startTime + i.duration).map(item => (
            <div key={item.id} className="animate-reveal text-center px-4">
              <h2 className="text-xl md:text-3xl font-black text-white tracking-widest uppercase italic drop-shadow-2xl">{item.content}</h2>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
