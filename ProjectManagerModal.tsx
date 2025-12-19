
import React, { useRef } from 'react';
import { X, FolderOpen, Plus, Trash2, Download, FileJson, Calendar, Clock } from 'lucide-react';
import { ProjectMetadata } from './types.ts';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectMetadata[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onExportProject: (id: string) => void;
  onImportProject: (file: File) => void;
}

export const ProjectManagerModal = ({
  isOpen, onClose, projects, activeProjectId,
  onSelectProject, onCreateProject, onDeleteProject, onExportProject, onImportProject
}: ProjectManagerModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const sortedProjects = [...projects].sort((a, b) => b.lastModified - a.lastModified);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-indigo-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-100">Project Manager</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={onCreateProject}
              className="h-32 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-600 hover:border-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center group-hover:bg-indigo-500/20">
                <Plus size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">New Project</span>
            </button>

            {sortedProjects.map(proj => (
              <div 
                key={proj.id}
                className={`relative group h-32 rounded-xl border p-4 flex flex-col justify-between transition-all cursor-pointer
                  ${proj.id === activeProjectId 
                    ? 'border-indigo-500 bg-indigo-500/5' 
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'}
                `}
                onClick={() => onSelectProject(proj.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-black text-white uppercase truncate pr-8">{proj.name}</h4>
                    <div className="flex items-center gap-3 text-[8px] text-zinc-500 uppercase font-bold">
                      <span className="flex items-center gap-1"><Calendar size={8} /> {new Date(proj.lastModified).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Clock size={8} /> {new Date(proj.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  {proj.id === activeProjectId && (
                    <div className="px-1.5 py-0.5 bg-indigo-500 rounded text-[7px] font-black text-white uppercase animate-pulse">Active</div>
                  )}
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onExportProject(proj.id); }}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
                    title="Export as .rapidcut"
                  >
                    <Download size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(proj.id); }}
                    className="p-1.5 bg-zinc-800 hover:bg-rose-900/40 rounded text-zinc-400 hover:text-rose-400 transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-zinc-900/50 flex justify-between items-center">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-[10px] font-black text-zinc-400 hover:text-indigo-400 uppercase tracking-widest transition-colors"
          >
            <FileJson size={14} /> Import Project File
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".rapidcut,application/json" 
            onChange={(e) => e.target.files?.[0] && onImportProject(e.target.files[0])}
          />
          <span className="text-[8px] text-zinc-600 font-bold uppercase">Stored Locally</span>
        </div>
      </div>
    </div>
  );
};
