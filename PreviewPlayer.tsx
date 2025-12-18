
import React from 'react';
import { TimelineItem, ProjectSettings } from './types';

interface PreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  items: TimelineItem[];
  currentTime: number;
  projectSettings: ProjectSettings;
  isShakeEnabled: boolean;
  shakeIntensity: number;
  isPlaying: boolean;
}

export const PreviewPlayer = ({ 
  videoRef, items, currentTime, projectSettings, 
  isShakeEnabled, shakeIntensity, isPlaying 
}: PreviewPlayerProps) => {
  return (
    <div className="flex-1 flex items-center justify-center p-1 md:p-4 min-h-0 overflow-hidden">
      <div 
        className={`relative bg-[#050505] shadow-2xl overflow-hidden group will-change-transform ${isShakeEnabled && isPlaying ? 'animate-handheld' : ''}`} 
        style={{ 
          '--shake-intensity': shakeIntensity,
          aspectRatio: `${projectSettings.width} / ${projectSettings.height}`,
          maxWidth: '100%',
          maxHeight: '100%'
        } as any}
      >
        <video ref={videoRef} className="w-full h-full object-contain pointer-events-none" />
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
