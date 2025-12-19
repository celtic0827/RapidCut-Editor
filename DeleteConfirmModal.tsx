
import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
  isProcessing: boolean;
}

export const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, projectName, isProcessing }: DeleteConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-80 bg-[#1a1a1e] border border-amber-500/30 rounded-lg shadow-2xl p-6 space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
            <AlertTriangle size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-100">Delete Project?</h3>
            <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed">
              Are you sure you want to delete <span className="text-amber-400">"{projectName}"</span>? This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button 
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-[9px] py-2.5 rounded uppercase transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-black text-[9px] py-2.5 rounded uppercase transition-all flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 size={10} />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
