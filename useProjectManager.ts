
import { useState, useCallback, useEffect } from 'react';
import { Project, ProjectMetadata, TimelineItem, MediaAsset, ProjectSettings } from './types.ts';
import { assetDB } from './db.ts';

const STORAGE_KEYS = {
  PROJECT_LIST: 'rapidcut_project_list',
  ACTIVE_ID: 'rapidcut_active_project_id',
  PROJECT_PREFIX: 'rapidcut_project_'
};

export function useProjectManager() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');

  const refreshProjectList = useCallback(() => {
    const listJson = localStorage.getItem(STORAGE_KEYS.PROJECT_LIST);
    if (listJson) {
      setProjects(JSON.parse(listJson));
    }
  }, []);

  const saveProject = useCallback((project: Project, thumbnail?: string) => {
    localStorage.setItem(STORAGE_KEYS.PROJECT_PREFIX + project.id, JSON.stringify({
      ...project,
      items: project.items.map(i => ({ ...i, url: '' })),
      library: project.library.map(a => ({ ...a, url: '' }))
    }));

    setProjects(prev => {
      const exists = prev.find(p => p.id === project.id);
      let newList;
      if (exists) {
        newList = prev.map(p => p.id === project.id 
          ? { 
              ...p, 
              name: project.name, 
              lastModified: Date.now(),
              thumbnail: thumbnail || p.thumbnail // 如果有新縮圖則更新，否則保留舊的
            } 
          : p
        );
      } else {
        newList = [...prev, { id: project.id, name: project.name, lastModified: Date.now(), thumbnail }];
      }
      localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
      return newList;
    });
  }, []);

  const getProjectData = useCallback((id: string): Project | null => {
    const dataJson = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    if (!dataJson) return null;
    return JSON.parse(dataJson);
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const data = getProjectData(id);
    if (data) {
      await Promise.all(data.library.map(asset => 
        assetDB.deleteAsset(asset.id).catch(err => console.error('Failed to delete asset', asset.id, err))
      ));
    }
    
    localStorage.removeItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    
    setProjects(prev => {
      const newList = prev.filter(p => p.id !== id);
      localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
      return newList;
    });
  }, [getProjectData]);

  const markActive = useCallback((id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
  }, []);

  const exportProject = useCallback((id: string) => {
    const data = getProjectData(id);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name}.rapidcut`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getProjectData]);

  const importProject = useCallback(async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const project: Project = JSON.parse(text);
      const newId = Math.random().toString(36).substr(2, 9);
      project.id = newId;
      project.name = project.name + " (Imported)";
      saveProject(project);
      refreshProjectList();
      return newId;
    } catch (e) {
      console.error('Import failed', e);
      return null;
    }
  }, [saveProject, refreshProjectList]);

  useEffect(() => {
    refreshProjectList();
    const lastActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
    if (lastActive) setActiveProjectId(lastActive);
  }, [refreshProjectList]);

  return {
    projects,
    activeProjectId,
    saveProject,
    getProjectData,
    deleteProject,
    markActive,
    refreshProjectList,
    exportProject,
    importProject
  };
}
