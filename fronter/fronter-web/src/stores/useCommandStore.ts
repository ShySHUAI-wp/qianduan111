import { create } from 'zustand';
import type { CommandStatus } from '@/types';

interface CommandState {
  // 当前执行的命令
  currentCommandId: string | null;
  commandStatus: CommandStatus;
  commandOutput: string[];

  // 数据可视化 URL
  dataUrl: string | null;

  // Actions
  setCurrentCommand: (commandId: string | null) => void;
  setCommandStatus: (status: CommandStatus) => void;
  appendOutput: (line: string) => void;
  clearOutput: () => void;
  setDataUrl: (url: string | null) => void;
  reset: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  // 初始状态
  currentCommandId: null,
  commandStatus: 'idle',
  commandOutput: [],
  dataUrl: null,

  // Actions
  setCurrentCommand: (commandId) => set({ currentCommandId: commandId }),
  setCommandStatus: (status) => set({ commandStatus: status }),
  appendOutput: (line) =>
    set((state) => ({ commandOutput: [...state.commandOutput, line] })),
  clearOutput: () => set({ commandOutput: [] }),
  setDataUrl: (url) => set({ dataUrl: url }),
  reset: () =>
    set({
      currentCommandId: null,
      commandStatus: 'idle',
      commandOutput: [],
      dataUrl: null,
    }),
}));
