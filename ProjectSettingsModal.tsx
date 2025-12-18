
import React from 'react';
import { X } from 'lucide-react';
import { ProjectSettings } from './types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProjectSettings;
  setSettings: (s: ProjectSettings) => void;
}

export const ProjectSettingsModal = ({ isOpen, onClose, settings, setSettings }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-80 bg-[#1a1a1e] border border-white/10 rounded-lg shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Project Settings</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[8px] text-zinc-500 uppercase font-black mb-1 block">Width (px)</label>
              <input 
                type="number" 
                value={settings.width} 
                onChange={e => setSettings({ ...settings, width: parseInt(e.target.value) || 0 })} 
                className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-[8px] text-zinc-500 uppercase font-black mb-1 block">Height (px)</label>
              <input 
                type="number" 
                value={settings.height} 
                onChange={e => setSettings({ ...settings, height: parseInt(e.target.value) || 0 })} 
                className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[8px] text-zinc-500 uppercase font-black mb-1 block">Frame Rate (FPS)</label>
            <select 
              value={settings.fps} 
              onChange={e => setSettings({ ...settings, fps: parseInt(e.target.value) })}
              className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-100 focus:outline-none focus:border-indigo-500 appearance-none"
            >
              <option value={24}>24 FPS (Cinematic)</option>
              <option value={30}>30 FPS (Video)</option>
              <option value={60}>60 FPS (Smooth)</option>
            </select>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] py-2 rounded uppercase transition-colors"
        >
          Apply Settings
        </button>
      </div>
    </div>
  );
};
