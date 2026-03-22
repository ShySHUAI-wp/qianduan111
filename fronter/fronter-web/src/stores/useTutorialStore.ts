import { create } from 'zustand';
import type { TutorialTree, TutorialContent } from '@/types';

interface TutorialState {
  // 教程树
  tree: TutorialTree | null;
  loading: boolean;

  // 当前选中的教程
  currentPath: string | null;
  currentContent: TutorialContent | null;

  // 缓存（避免重复请求）
  cache: Record<string, TutorialContent>;

  // Actions
  setTree: (tree: TutorialTree) => void;
  setLoading: (loading: boolean) => void;
  setCurrentPath: (path: string) => void;
  setCurrentContent: (content: TutorialContent) => void;
  addToCache: (path: string, content: TutorialContent) => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  // 初始状态
  tree: null,
  loading: false,
  currentPath: null,
  currentContent: null,
  cache: {},

  // Actions
  setTree: (tree) => set({ tree }),
  setLoading: (loading) => set({ loading }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setCurrentContent: (content) => set({ currentContent: content }),
  addToCache: (path, content) =>
    set((state) => ({
      cache: { ...state.cache, [path]: content },
    })),
}));
