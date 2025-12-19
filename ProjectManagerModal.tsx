
import React, { useRef } from 'react';
import { X, FolderOpen, Plus, Trash2, Download, FileJson, Calendar, Clock, Image as ImageIcon } from 'lucide-react';
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-indigo-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-100">Project Manager</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={onCreateProject}
              className="h-32 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-600 hover:border-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all group overflow-hidden"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                <Plus size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">New Project</span>
            </button>

            {sortedProjects.map(proj => (
              <div 
                key={proj.id}
                className={`relative group h-32 rounded-xl border flex flex-col justify-between transition-all cursor-pointer overflow-hidden
                  ${proj.id === activeProjectId 
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30' 
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'}
                `}
                onClick={() => onSelectProject(proj.id)}
              >
                {/* 縮圖背景 */}
                <div className="absolute inset-0 z-0">
                  {proj.thumbnail ? (
                    <img src={proj.thumbnail} className="w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity" alt="" />
                  ) : (
                    <div className="w-full h-full bg-zinc-950 flex items-center justify-center opacity-10">
                      <ImageIcon size={32} />
                    </div>
                  )}
                  {/* 漸層遮罩確保文字清晰 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1e] via-[#1a1a1e]/60 to-transparent" />
                </div>

                <div className="relative z-10 p-4 h-full flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 w-full overflow-hidden">
                      <h4 className="text-[11px] font-black text-white uppercase truncate drop-shadow-md">{proj.name}</h4>
                      <div className="flex items-center gap-3 text-[8px] text-zinc-400 uppercase font-bold drop-shadow-md">
                        <span className="flex items-center gap-1"><Calendar size={8} /> {new Date(proj.lastModified).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1"><Clock size={8} /> {new Date(proj.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    {proj.id === activeProjectId ? (
                      <div className="px-2 py-0.5 bg-indigo-500 rounded text-[7px] font-black text-white uppercase animate-pulse shadow-lg shadow-indigo-500/20">Active</div>
                    ) : <div />}
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onExportProject(proj.id); }}
                        className="p-1.5 bg-black/60 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors backdrop-blur-sm border border-white/5"
                        title="Export as .rapidcut"
                      >
                        <Download size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteProject(proj.id); }}
                        className="p-1.5 bg-black/60 hover:bg-rose-900/60 rounded text-zinc-400 hover:text-rose-400 transition-colors backdrop-blur-sm border border-white/5"
                        title="Delete Project"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
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
