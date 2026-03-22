import { create } from 'zustand';
import type { PortInfo, CameraInfo, PortPermission } from '@/types';

interface DeviceState {
  // 端口相关
  ports: PortInfo[];
  selectedLeaderPort: string | null;
  selectedFollowerPort: string | null;
  portPermissions: Record<string, PortPermission>;

  // 相机相关
  cameras: CameraInfo[];
  selectedCameras: Record<string, CameraInfo>;

  // Actions
  setPorts: (ports: PortInfo[]) => void;
  setLeaderPort: (port: string | null) => void;
  setFollowerPort: (port: string | null) => void;
  setPortPermission: (port: string, permission: PortPermission) => void;

  setCameras: (cameras: CameraInfo[]) => void;
  selectCamera: (name: string, camera: CameraInfo) => void;
  unselectCamera: (name: string) => void;
  clearSelectedCameras: () => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  // 初始状态
  ports: [],
  selectedLeaderPort: null,
  selectedFollowerPort: null,
  portPermissions: {},

  cameras: [],
  selectedCameras: {},

  // 端口操作
  setPorts: (ports) => set({ ports }),
  setLeaderPort: (port) => set({ selectedLeaderPort: port }),
  setFollowerPort: (port) => set({ selectedFollowerPort: port }),
  setPortPermission: (port, permission) =>
    set((state) => ({
      portPermissions: { ...state.portPermissions, [port]: permission },
    })),

  // 相机操作
  setCameras: (cameras) => set({ cameras }),
  selectCamera: (name, camera) =>
    set((state) => ({
      selectedCameras: { ...state.selectedCameras, [name]: camera },
    })),
  unselectCamera: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.selectedCameras;
      return { selectedCameras: rest };
    }),
  clearSelectedCameras: () => set({ selectedCameras: {} }),
}));
