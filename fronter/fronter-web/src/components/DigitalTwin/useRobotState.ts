import { useEffect, useMemo, useState, useRef } from 'react';
import { wsService } from '@/services/socket';

export type RobotState = {
  ts?: number;
  base?: { x: number; y: number; z: number; yaw: number };
  joints?: Record<string, number>; // radians
};

export function useRobotState({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<RobotState | null>(null);
  const [hasBackendStream, setHasBackendStream] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // 监听 robot_state 响应
    const off = wsService.on('robot_state', (payload: RobotState) => {
      setHasBackendStream(true);
      setState(payload);
    });

    return () => {
      off?.();
    };
  }, [enabled]);

  // 每 150ms 主动向 后端请求机器人状态
  useEffect(() => {
    if (!enabled) return;

    // 立即发起一次请求
    wsService.getRobotState();

    intervalRef.current = setInterval(() => {
      wsService.getRobotState();
    }, 150);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  return useMemo(
    () => ({
      robotState: state,
      hasBackendStream,
    }),
    [state, hasBackendStream]
  );
}
