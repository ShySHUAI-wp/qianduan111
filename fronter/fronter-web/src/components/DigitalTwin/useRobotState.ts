import { useEffect, useMemo, useState } from 'react';
import { wsService } from '@/services/socket';

export type RobotState = {
  ts?: number;
  base?: { x: number; y: number; z: number; yaw: number };
  joints?: Record<string, number>; // radians
};

// 当前后端尚未提供 robot_state 推送时，提供演示数据，确保数字孪生可见可动。
function makeDemoState(t: number): RobotState {
  const s = t / 1000;
  return {
    ts: t,
    base: { x: 0, y: 0, z: 0, yaw: Math.sin(s * 0.25) * 0.15 },
    joints: {
      shoulder: Math.sin(s * 0.8) * 0.35,
      elbow: Math.sin(s * 1.1 + 0.6) * 0.45,
      wrist: Math.sin(s * 1.6 + 1.2) * 0.6,
    },
  };
}

export function useRobotState({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<RobotState | null>(null);
  const [hasBackendStream, setHasBackendStream] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    // 约定：后端可通过 socket.io emit('robot_state', payload) 推送状态
    const off = wsService.on('robot_state', (payload: RobotState) => {
      setHasBackendStream(true);
      setState(payload);
    });

    return () => {
      off?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (hasBackendStream) return;

    let raf = 0;
    const tick = () => {
      setState(makeDemoState(Date.now()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, hasBackendStream]);

  return useMemo(
    () => ({
      robotState: state,
      hasBackendStream,
    }),
    [state, hasBackendStream]
  );
}

