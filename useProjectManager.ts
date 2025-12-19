
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

  // 讀取專案列表
  const refreshProjectList = useCallback(() => {
    const listJson = localStorage.getItem(STORAGE_KEYS.PROJECT_LIST);
    if (listJson) {
      setProjects(JSON.parse(listJson));
    }
  }, []);

  // 儲存單一專案詳細數據
  const saveProject = useCallback((project: Project) => {
    localStorage.setItem(STORAGE_KEYS.PROJECT_PREFIX + project.id, JSON.stringify({
      ...project,
      // 不儲存 URL，因為它們是暫時性的 Blob
      items: project.items.map(i => ({ ...i, url: '' })),
      library: project.library.map(a => ({ ...a, url: '' }))
    }));

    // 更新列表中的最後修改時間
    setProjects(prev => {
      const exists = prev.find(p => p.id === project.id);
      let newList;
      if (exists) {
        newList = prev.map(p => p.id === project.id ? { ...p, name: project.name, lastModified: Date.now() } : p);
      } else {
        newList = [...prev, { id: project.id, name: project.name, lastModified: Date.now() }];
      }
      localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
      return newList;
    });
  }, []);

  // 載入專案詳細數據
  const getProjectData = useCallback((id: string): Project | null => {
    const dataJson = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    if (!dataJson) return null;
    return JSON.parse(dataJson);
  }, []);

  // 刪除專案
  const deleteProject = useCallback(async (id: string) => {
    const data = getProjectData(id);
    if (data) {
      // 清除 IndexedDB 中的 Handles
      await Promise.all(data.library.map(asset => assetDB.deleteHandle(asset.id).catch(() => {})));
    }
    localStorage.removeItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    
    setProjects(prev => {
      const newList = prev.filter(p => p.id !== id);
      localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
      return newList;
    });
  }, [getProjectData]);

  // 設定當前活躍專案 ID
  const markActive = useCallback((id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
  }, []);

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
    refreshProjectList
  };
}
