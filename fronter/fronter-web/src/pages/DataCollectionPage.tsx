import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Typography,
  Card,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Tag,
  Row,
  Col,
  Switch,
  message,
  Modal,
  Progress,
} from 'antd';
import {
  UsbOutlined,
  VideoCameraOutlined,
  PlayCircleOutlined,
  StopOutlined,
  UndoOutlined,
  FastForwardOutlined,
  CopyOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import PortFinder from '@/components/PortFinder';
import CameraFinder from '@/components/CameraFinder';
import CameraPreview from '@/components/CameraPreview';
import { wsService } from '@/services/socket';
import type { CameraInfo } from '@/types';
import './DataCollectionPage.css';

const { Option } = Select;
const { Text, Paragraph } = Typography;

// 操作臂类型选项
const ROBOT_TYPES = [
  { value: 'so100_follower', label: 'so100_follower（单臂）', isDual: false },
  { value: 'so101_follower', label: 'so101_follower（单臂）', isDual: false },
  { value: 'bi_so100_follower', label: 'bi_so100_follower（双臂）', isDual: true },
];

// 示教臂类型选项
const TELEOP_TYPES = [
  { value: 'so100_leader', label: 'so100_leader（单臂）', isDual: false },
  { value: 'so101_leader', label: 'so101_leader（单臂）', isDual: false },
  { value: 'bi_so100_leader', label: 'bi_so100_leader（双臂）', isDual: true },
];

// 连接状态
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

// 录制阶段状态机
type RecordPhase =
  | 'idle'           // 未启动
  | 'starting'       // 正在启动进程 + 连接socket
  | 'waiting_ready'  // 等待服务端 ready
  | 'countdown'      // 5秒倒计时中
  | 'recording'      // 正在录制
  | 'saving'         // 正在保存
  | 'resetting'      // 回正阶段
  | 'stopping'       // 正在停止
  | 'completed';     // 全部完成

interface DataCollectionFormValues {
  robotType: string;
  robotId: string;
  teleopType: string;
  teleopId: string;
  displayData: boolean;
  datasetName: string;
  datasetSingleTask: string;
  datasetFps: number;
  datasetNumEpisodes: number;
  datasetEpisodeTimeS: number;
  datasetResetTimeS: number;
}

interface ServerMessage {
  time: string;
  text: string;
}

// 日志面板样式（与设备标定页面保持一致）
const S = {
  logPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    margin: '0 0 16px 0',
    height: 600,
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
  },
  logBody: {
    flex: 1,
    overflow: 'auto' as const,
    background: '#1e1e1e',
    padding: '12px',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: '13px',
    color: '#d4d4d4',
  },
};

function DataCollectionPage() {
  const [form] = Form.useForm<DataCollectionFormValues>();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // 录制阶段
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [commandId, setCommandId] = useState<string | null>(null);

  // 录制进度数据
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  // Rerun可视化开关
  const [rerunEnabled, setRerunEnabled] = useState(false);

  // 倒计时
  const [countdown, setCountdown] = useState(5);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownMsgIndexRef = useRef<number | null>(null);

  // 回正倒计时
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 服务端消息日志
  const [serverMessages, setServerMessages] = useState<ServerMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 端口配置状态
  const [robotPortModalVisible, setRobotPortModalVisible] = useState(false);
  const [selectedRobotPorts, setSelectedRobotPorts] = useState<string[]>([]);
  const [isRobotDual, setIsRobotDual] = useState(false);

  const [teleopPortModalVisible, setTeleopPortModalVisible] = useState(false);
  const [selectedTeleopPorts, setSelectedTeleopPorts] = useState<string[]>([]);
  const [isTeleopDual, setIsTeleopDual] = useState(false);

  // 相机配置状态
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedCameras, setSelectedCameras] = useState<CameraInfo[]>([]);
  const [cameraRotations, setCameraRotations] = useState<Map<string, boolean>>(new Map());

  // 相机预览状态
  const [previewCamera, setPreviewCamera] = useState<CameraInfo | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // 日志
  const [logs, setLogs] = useState<string[]>([]);

  // 轮询控制
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket 取消订阅函数
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 检查后端连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        setConnectionStatus('connecting');
        await wsService.systemHealth();
        setConnectionStatus('connected');
        addLog('后端连接成功');
      } catch {
        setConnectionStatus('disconnected');
        addLog('后端未连接');
      }
    };
    checkConnection();
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (resetTimerRef.current) clearInterval(resetTimerRef.current);
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const isActive = phase !== 'idle' && phase !== 'completed';

  const resetTimeS = useMemo(() => {
    const v = form.getFieldValue('datasetResetTimeS');
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }, [form]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 添加服务端消息到面板
  const addServerMessage = (text: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setServerMessages((prev) => [...prev.slice(-99), { time, text }]);
  };

  // 自动滚动消息面板到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serverMessages]);

  // 判断是否为双臂机器人
  const isBimanual = (type: string) => type?.includes('bi_');

  // ===================== 消息轮询 =====================

  const startPolling = (cmdId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const resp = await fetch('/api/record/latest-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandId: cmdId }),
        });
        const result = await resp.json();
        if (result.code === 0 && result.data) {
          const msgs: string[] = result.data.messages || [];
          for (const msg of msgs) {
            handleServerMessage(msg);
          }
        }
      } catch {
        // 静默忽略轮询错误
      }
    }, 1000);
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // ===================== 处理服务端消息 =====================

  const handleServerMessage = (msg: string) => {
    console.log('[服务端消息]', msg);

    if (msg.startsWith('ready|')) {
      const parts = msg.split('|');
      let current = 0;
      let total = 0;
      parts.forEach((part) => {
        if (part.startsWith('current:')) current = parseInt(part.split(':')[1]);
        else if (part.startsWith('total:')) total = parseInt(part.split(':')[1]);
      });

      setCurrentEpisode(current);
      setTotalEpisodes(total);
      setTotalTime(0);
      setRemainingTime(0);
      setPhase('waiting_ready');
      addServerMessage(`Episode ${current}/${total} 准备就绪，可以开始采集`);
      addLog(`就绪: 第 ${current}/${total} 轮`);
    } else if (msg.startsWith('progress|')) {
      const parts = msg.split('|');
      let tot = 0;
      let rem = 0;
      parts.forEach((part) => {
        if (part.startsWith('total:')) tot = parseFloat(part.split(':')[1]);
        else if (part.startsWith('remaining:')) rem = parseFloat(part.split(':')[1]);
      });

      setTotalTime(tot);
      setRemainingTime(rem);
      setPhase('recording');
    } else if (msg === 'saving_start') {
      setPhase('saving');
      addServerMessage('正在保存 episode 数据...');
      addLog('开始保存数据...');
    } else if (msg === 'saving_complete') {
      addServerMessage('episode 数据保存完成');
      addLog('数据保存完成');
      message.success('数据保存完成');
    } else if (msg === 'resetting') {
      setPhase('resetting');
      addServerMessage('请操控遥操设备将机器人移回初始位置');
      addLog('进入回正阶段');
      if (resetTimerRef.current) clearInterval(resetTimerRef.current);
      setResetCountdown(resetTimeS);
      resetTimerRef.current = setInterval(() => {
        setResetCountdown((prev) => {
          if (prev === null) return prev;
          if (prev <= 1) {
            if (resetTimerRef.current) clearInterval(resetTimerRef.current);
            resetTimerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (msg === 'record_finish') {
      setPhase('completed');
      stopPolling();
      addServerMessage('所有 episode 录制完成!');
      addLog('数据采集已完成');
      message.success('数据采集已完成!');
      if (resetTimerRef.current) {
        clearInterval(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      setResetCountdown(null);
    } else {
      addServerMessage(msg);
    }
  };

  // ===================== start: 启动录制 =====================

  const handleStartRecording = async () => {
    try {
      const values = await form.validateFields();

      const robotType = values.robotType;
      const teleopType = values.teleopType;
      const isRobotBimanual = isBimanual(robotType);
      const isTeleopBimanual = isBimanual(teleopType);

      // 验证端口
      if (isRobotBimanual && selectedRobotPorts.length < 2) {
        message.error('双臂操作臂需要配置至少2个端口');
        return;
      }
      if (!isRobotBimanual && selectedRobotPorts.length < 1) {
        message.error('请配置操作臂端口');
        return;
      }
      if (isTeleopBimanual && selectedTeleopPorts.length < 2) {
        message.error('双臂示教臂需要配置至少2个端口');
        return;
      }
      if (!isTeleopBimanual && selectedTeleopPorts.length < 1) {
        message.error('请配置示教臂端口');
        return;
      }
      if (selectedCameras.length === 0) {
        message.error('请至少配置一个相机');
        return;
      }

      // 构建相机配置
      const predefinedCameraNames = ['front', 'side', 'top', 'wrist', 'left', 'right'];
      const cameraConfig: Record<string, any> = {};
      selectedCameras.forEach((camera, index) => {
        const cameraName = predefinedCameraNames[index] || `camera_${index}`;
        const isRotated = cameraRotations.get(`${camera.type}-${camera.id}`) || false;
        cameraConfig[cameraName] = {
          type: 'opencv',
          index_or_path: camera.id,
          width: camera.default_stream_profile?.width || 640,
          height: camera.default_stream_profile?.height || 480,
          fps: camera.default_stream_profile?.fps || 30,
          fourcc: 'MJPG',
          ...(isRotated && { rotation: 'ROTATE_180' }),
        };
      });

      setPhase('starting');
      setServerMessages([]);
      setCurrentEpisode(0);
      setTotalEpisodes(values.datasetNumEpisodes);
      addServerMessage('正在启动录制进程...');
      addLog('启动数据采集...');

      const requestParams: any = {
        robot_type: robotType,
        robot_port: selectedRobotPorts[0],
        robot_id: values.robotId,
        robot_cameras: JSON.stringify(cameraConfig),
        dataset_path: '~/.cache/huggingface/lerobot',
        dataset_name: values.datasetName,
        dataset_fps: values.datasetFps,
        dataset_num_episodes: values.datasetNumEpisodes,
        dataset_single_task: values.datasetSingleTask,
        dataset_episode_time_s: values.datasetEpisodeTimeS,
        dataset_reset_time_s: values.datasetResetTimeS,
        dataset_push_to_hub: false,
        display_data: values.displayData ?? false,
      };

      if (teleopType) {
        requestParams.teleop_type = teleopType;
        requestParams.teleop_port = selectedTeleopPorts[0];
        requestParams.teleop_id = values.teleopId;
      }

      const startResp = await fetch('/api/record/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestParams),
      });
      const startResult = await startResp.json();

      if (startResult.code !== 0 || !startResult.data) {
        throw new Error(startResult.message || '启动失败');
      }

      const cmdId = startResult.data.commandId;
      setCommandId(cmdId);
      addServerMessage(`进程已启动 (commandId: ${cmdId})`);
      addLog(`进程已启动，commandId: ${cmdId}`);

      // 连接 socket
      addServerMessage('正在连接 socket（等待录制脚本就绪）...');
      let connected = false;
      for (let i = 0; i < 30; i++) {
        try {
          const connResp = await fetch('/api/record/connect-socket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandId: cmdId }),
          });
          const connResult = await connResp.json();
          if (connResult.code === 0 && connResult.data?.connected) {
            connected = true;
            addServerMessage(`socket 连接成功`);
            addLog(`socket 连接成功`);
            break;
          }
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!connected) {
        setPhase('idle');
        setCommandId(null);
        addServerMessage('socket 连接超时，启动失败');
        message.error('socket 连接超时，请检查录制脚本是否正常启动');
        return;
      }

      // 开始轮询消息
      addServerMessage('等待服务端就绪...');
      startPolling(cmdId);
    } catch (error: any) {
      console.error('启动录制失败:', error);
      setPhase('idle');
      setCommandId(null);
      message.error(error.message || '启动录制失败');
      addLog(`启动录制失败: ${error.message}`);
    }
  };

  // ===================== begin: 开始采集（5秒倒计时） =====================

  const doBegin = async () => {
    if (!commandId) return;
    try {
      addServerMessage('发送开始采集指令...');
      const resp = await fetch('/api/record/start-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        setPhase('recording');
        addServerMessage('开始采集');
        addLog('开始采集');
      } else {
        throw new Error(result.message || '开始采集失败');
      }
    } catch (error: any) {
      message.error(error.message || '开始采集失败');
      addLog(`开始采集失败: ${error.message}`);
    }
  };

  const handleBegin = () => {
    if (!commandId) return;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(5);
    setPhase('countdown');

    // 添加初始倒计时消息并记录索引
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setServerMessages((prev) => {
      const newMessages = [...prev.slice(-99), { time, text: '即将开始采集：5 秒倒计时...' }];
      countdownMsgIndexRef.current = newMessages.length - 1;
      return newMessages;
    });

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          countdownMsgIndexRef.current = null;
          void doBegin();
          return 0;
        }
        // 更新倒计时消息
        const newVal = prev - 1;
        setServerMessages((msgs) => {
          const updated = [...msgs];
          const idx = countdownMsgIndexRef.current;
          if (idx !== null && idx >= 0 && idx < updated.length && updated[idx].text.includes('秒倒计时')) {
            updated[idx] = { ...updated[idx], text: `即将开始采集：${newVal} 秒倒计时...` };
          }
          return updated;
        });
        return newVal;
      });
    }, 1000);
  };

  // ===================== next: 提前结束并保存 =====================

  const handleNext = async () => {
    if (!commandId) return;
    try {
      addServerMessage('发送下一轮指令（保存当前 episode）...');
      const resp = await fetch('/api/record/next-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        addLog('下一轮指令已发送');
      } else {
        throw new Error(result.message || '下一轮失败');
      }
    } catch (error: any) {
      message.error(error.message || '下一轮失败');
    }
  };

  // ===================== rerecord: 丢弃重录 =====================

  const handleRerecord = async () => {
    if (!commandId) return;
    try {
      addServerMessage('发送重新录制指令（丢弃当前 episode）...');
      const resp = await fetch('/api/record/rerecord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        addLog('重新录制指令已发送');
      } else {
        throw new Error(result.message || '重新录制失败');
      }
    } catch (error: any) {
      message.error(error.message || '重新录制失败');
    }
  };

  // ===================== reset-done: 回正完成（立刻开始下次录制） =====================

  const handleResetDone = async () => {
    if (!commandId) return;
    try {
      addServerMessage('发送回正完成指令...');
      const resp = await fetch('/api/record/reset-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        addServerMessage('回正完成，等待服务端就绪...');
        addLog('回正完成');
        if (resetTimerRef.current) {
          clearInterval(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setResetCountdown(null);
      } else {
        throw new Error(result.message || '回正完成指令发送失败');
      }
    } catch (error: any) {
      message.error(error.message || '回正完成指令发送失败');
    }
  };

  // ===================== 急停 =====================

  const handleEmergencyStop = async () => {
    if (!commandId) return;
    try {
      addServerMessage('急停指令已发送...');
      const resp = await fetch('/api/record/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        stopPolling();
        setPhase('idle');
        setCommandId(null);
        addServerMessage('录制已终止');
        addLog('录制已急停');
        message.warning('录制已急停');
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        if (resetTimerRef.current) {
          clearInterval(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setCountdown(5);
        setResetCountdown(null);
      } else {
        throw new Error(result.message || '急停失败');
      }
    } catch (error: any) {
      message.error(error.message || '急停失败');
    }
  };

  // ===================== 重置（完成后） =====================

  const handleReset = () => {
    setPhase('idle');
    setCommandId(null);
    setCurrentEpisode(0);
    setTotalEpisodes(0);
    setTotalTime(0);
    setRemainingTime(0);
    setServerMessages([]);
    stopPolling();
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      clearInterval(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setCountdown(5);
    setResetCountdown(null);
  };

  // ===================== 端口 & 相机回调 =====================

  const handleRobotTypeChange = (value: string) => {
    const config = ROBOT_TYPES.find((t) => t.value === value);
    setIsRobotDual(config?.isDual || false);
    setSelectedRobotPorts([]);
  };

  const handleTeleopTypeChange = (value: string) => {
    const config = TELEOP_TYPES.find((t) => t.value === value);
    setIsTeleopDual(config?.isDual || false);
    setSelectedTeleopPorts([]);
  };

  const handleRobotPortsChange = (ports: string[]) => {
    setSelectedRobotPorts(ports);
    addLog(`已选择操作臂端口: ${ports.join(', ') || '(无)'}`);
  };

  const handleTeleopPortsChange = (ports: string[]) => {
    setSelectedTeleopPorts(ports);
    addLog(`已选择示教臂端口: ${ports.join(', ') || '(无)'}`);
  };

  const handleClearRobotPorts = () => {
    setSelectedRobotPorts([]);
    addLog('已清除操作臂端口配置');
  };

  const handleClearTeleopPorts = () => {
    setSelectedTeleopPorts([]);
    addLog('已清除示教臂端口配置');
  };

  const handleCamerasChange = (cameras: CameraInfo[]) => {
    setSelectedCameras(cameras);
    addLog(`已选择 ${cameras.length} 个相机`);
    const newRotations = new Map(cameraRotations);
    cameras.forEach((camera) => {
      const cameraKey = `${camera.type}-${camera.id}`;
      if (!newRotations.has(cameraKey)) {
        newRotations.set(cameraKey, false);
      }
    });
    setCameraRotations(newRotations);
  };

  const handleToggleCameraRotation = (camera: CameraInfo) => {
    const cameraKey = `${camera.type}-${camera.id}`;
    const newRotations = new Map(cameraRotations);
    newRotations.set(cameraKey, !newRotations.get(cameraKey));
    setCameraRotations(newRotations);
    addLog(`${camera.name} 翻转${newRotations.get(cameraKey) ? '已启用' : '已禁用'}`);
  };

  const handleClearCameras = () => {
    setSelectedCameras([]);
    setCameraRotations(new Map());
    addLog('已清除相机配置');
  };

  // 相机预览回调
  const handlePreviewCamera = (camera: CameraInfo) => {
    setPreviewCamera(camera);
    setPreviewVisible(true);
  };

  // 关闭预览回调
  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewCamera(null);
  };

  // ===================== 渲染：设备列表 =====================

  const renderDeviceList = (
    devices: string[],
    emptyText: string,
    onClear: () => void,
    icon: React.ReactNode,
  ) => {
    if (devices.length === 0) {
      return <Text type="secondary">{emptyText}</Text>;
    }
    return (
      <Space wrap>
        {devices.map((device, index) => (
          <Tag key={index} icon={icon as React.ReactElement} color="blue">
            {device}
          </Tag>
        ))}
        <Button type="link" size="small" danger icon={<StopOutlined />} onClick={onClear} disabled={isActive}>
          清除
        </Button>
      </Space>
    );
  };

  // ===================== 渲染：相机列表 =====================

  const renderCameraList = () => {
    if (selectedCameras.length === 0) {
      return <Text type="secondary">未配置相机</Text>;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {selectedCameras.map((camera) => {
          const cameraKey = `${camera.type}-${camera.id}`;
          const isRotated = cameraRotations.get(cameraKey) || false;
          return (
            <div key={cameraKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag icon={<VideoCameraOutlined />} color="blue">
                {camera.name}
              </Tag>
              <label style={{ fontSize: '13px', color: '#666' }}>
                <input
                  type="checkbox"
                  checked={isRotated}
                  onChange={() => handleToggleCameraRotation(camera)}
                  disabled={isActive}
                  style={{ marginRight: 4 }}
                />
                翻转180°
              </label>
            </div>
          );
        })}
        <Button type="link" size="small" danger icon={<StopOutlined />} onClick={handleClearCameras} disabled={isActive}>
          清除
        </Button>
      </Space>
    );
  };

  // ===================== 渲染：录制进度 =====================

  const renderProgress = () => {
    if (phase === 'idle') return null;

    // 轮次总进度
    const episodePercent = totalEpisodes > 0 ? Math.round(((currentEpisode - 1) / totalEpisodes) * 100) : 0;

    // 当前轮次时间进度
    const timePercent = totalTime > 0 ? Math.round(((totalTime - remainingTime) / totalTime) * 100) : 0;

    // 进度条颜色
    let episodeStatus: 'normal' | 'active' | 'exception' | 'success' = 'active';
    if (phase === 'saving') episodeStatus = 'active';
    if (phase === 'resetting') episodeStatus = 'exception';
    if (phase === 'completed') episodeStatus = 'success';

    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>
            Episode {currentEpisode} / {totalEpisodes}
          </span>
          <span>
            {phase === 'waiting_ready' && '等待开始采集'}
            {phase === 'countdown' && `即将开始 (${countdown}s)`}
            {phase === 'recording' && `录制中 (剩余 ${remainingTime.toFixed(1)}s)`}
            {phase === 'saving' && '保存数据中...'}
            {phase === 'resetting' && `回正中${resetCountdown !== null ? ` (${resetCountdown}s)` : ''}`}
            {phase === 'stopping' && '正在停止...'}
            {phase === 'completed' && '已完成'}
          </span>
        </div>

        <Progress
          percent={episodePercent}
          status={episodeStatus}
          style={{ marginBottom: phase === 'recording' ? 12 : 0 }}
        />

        {phase === 'recording' && totalTime > 0 && (
          <Progress
            percent={timePercent}
            size="small"
            status="active"
            strokeColor="#fa8c16"
          />
        )}
      </Card>
    );
  };

  // ===================== 渲染：录制中控制面板 =====================

  const renderRecordingPanel = () => {
    if (phase !== 'recording') return null;

    // 当前轮次时间进度
    const timePercent = totalTime > 0 ? Math.round(((totalTime - remainingTime) / totalTime) * 100) : 0;

    return (
      <Card size="small" style={{ background: '#fff7e6', border: '1px solid #ffd591', marginBottom: 16 }}>
        {/* 进度信息 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>Episode {currentEpisode} / {totalEpisodes}</span>
          <span>录制中 (剩余 {remainingTime.toFixed(1)}s)</span>
        </div>

        {/* 进度条 */}
        <Progress
          percent={timePercent}
          status="active"
          strokeColor="#fa8c16"
        />

        {/* 录制中状态 */}
        <div style={{ textAlign: 'center', padding: '8px', background: '#fa8c16', color: '#fff', borderRadius: 4, marginTop: 12 }}>
          录制中
        </div>

        {/* 按钮行 */}
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={16}>
            <Space>
              <Button icon={<FastForwardOutlined />} onClick={handleNext}>下一轮(保存)</Button>
              <Button icon={<UndoOutlined />} onClick={handleRerecord}>重新录制</Button>
            </Space>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              <Text>Rerun:</Text>
              <Switch checked={rerunEnabled} onChange={setRerunEnabled} />
              <Button danger icon={<StopOutlined />} onClick={handleEmergencyStop}>急停</Button>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  };

  // ===================== 渲染：控制按钮 =====================

  const renderControlButtons = () => {
    // 未启动
    if (phase === 'idle') {
      return (
        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          onClick={handleStartRecording}
          block
        >
          开始录制
        </Button>
      );
    }

    // 启动中
    if (phase === 'starting') {
      return (
        <Button type="primary" size="large" block loading disabled>
          启动中...
        </Button>
      );
    }

    // 完成
    if (phase === 'completed') {
      return (
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleReset} size="large" block>
          开始新录制
        </Button>
      );
    }

    // 等待 ready
    if (phase === 'waiting_ready') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleBegin}
            size="large"
            block
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            开始采集 (Episode {currentEpisode})
          </Button>
        </Space>
      );
    }

    // 倒计时中
    if (phase === 'countdown') {
      return (
        <Button type="primary" size="large" block loading disabled>
          即将开始 ({countdown}s)
        </Button>
      );
    }

    // 保存中
    if (phase === 'saving') {
      return (
        <Button type="primary" size="large" block loading disabled>
          保存数据中...
        </Button>
      );
    }

    // 回正阶段
    if (phase === 'resetting') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ textAlign: 'center', padding: '12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: '8px' }}>
            <span style={{ fontSize: 16, color: '#d48806' }}>
              请操控遥操设备将机器人移回初始位置
              {resetCountdown !== null && (
                <span style={{ marginLeft: 8, fontWeight: 600 }}>
                  {resetCountdown === 0 ? '（可开始下一轮）' : `（${resetCountdown}s）`}
                </span>
              )}
            </span>
          </div>
          <Button
            type="primary"
            icon={<FastForwardOutlined />}
            onClick={handleResetDone}
            size="large"
            block
            style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
          >
            立刻开始下次录制
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleResetDone}
            size="large"
            block
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            完成回正
          </Button>
        </Space>
      );
    }

    // 停止中
    if (phase === 'stopping') {
      return (
        <Button type="primary" size="large" block loading disabled>
          正在停止录制...
        </Button>
      );
    }

    // 录制中
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space style={{ width: '100%' }} size="middle" wrap>
          <Button type="primary" icon={<FastForwardOutlined />} onClick={handleNext}>
            下一轮 (保存)
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleRerecord}>
            重新录制当前回合
          </Button>
        </Space>
      </Space>
    );
  };

  // ===================== 渲染：服务端消息面板 =====================

  const renderMessagePanel = () => {
    if (phase === 'idle') return null;

    return (
      <Card
        title="服务端消息"
        size="small"
        styles={{
          body: {
            maxHeight: 180,
            overflowY: 'auto',
            padding: '8px 12px',
            background: '#1e1e1e',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: 13,
          },
        }}
        style={{ marginBottom: 16 }}
      >
        {serverMessages.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 12 }}>等待消息...</div>
        ) : (
          serverMessages.map((msg, i) => (
            <div key={i} style={{ color: '#d4d4d4', lineHeight: '22px' }}>
              <span style={{ color: '#6a9955' }}>[{msg.time}]</span> {msg.text}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </Card>
    );
  };

  // ===================== 日志面板（与设备标定页面保持一致） =====================

  const logPanel = useMemo(
    () => (
      <div style={S.logPanel}>
        <div style={S.logHeader}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>日志输出</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(logs.join('\n'))}>
              复制
            </Button>
            <Button size="small" icon={<ClearOutlined />} onClick={() => setLogs([])}>
              清空
            </Button>
          </div>
        </div>
        <div style={{ ...S.logBody, height: 520 }}>
          {logs.length === 0 ? (
            <div style={{ color: '#888' }}>这是终端控制台，用于输出日志</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    ),
    [logs],
  );

  // ===================== 状态指示灯 =====================

  const renderStatusIndicator = () => {
    if (phase === 'idle' || phase === 'completed') {
      return null;
    }

    let color = '#52c41a';
    let text = '空闲';

    if (phase === 'recording') {
      color = '#fa8c16';
      text = '录制中';
    } else if (phase === 'resetting') {
      color = '#fa8c16';
      text = '重置中';
    } else if (phase === 'saving') {
      color = '#1890ff';
      text = '保存中';
    } else if (phase === 'countdown') {
      color = '#fa8c16';
      text = `倒计时 ${countdown}s`;
    } else if (phase === 'starting' || phase === 'waiting_ready' || phase === 'stopping') {
      color = '#1890ff';
      text = '处理中';
    }

    return (
      <Tag color={color} style={{ fontSize: 14, padding: '4px 12px' }}>
        {text}
      </Tag>
    );
  };

  return (
    <div>
      {/* 页面标题区 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Typography.Title level={2} style={{ margin: 0, fontSize: 20 }}>
          数据采集
        </Typography.Title>
        <Space>
          {renderStatusIndicator()}
          <Tag color={connectionStatus === 'connected' ? 'green' : 'red'}>
            连接状态：{connectionStatus === 'connected' ? '已连接' : '未连接'}
          </Tag>
        </Space>
      </div>

      <Row gutter={16} align="top" style={{ marginBottom: 16 }}>
        {/* 第一行：操作臂配置 + 示教臂配置 */}
        <Col xs={24} md={12}>
          <Card className="config-card" title="机器人（操作臂）配置" style={{ marginBottom: 0, height: '100%' }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                robotType: 'so101_follower',
              }}
            >
              <Form.Item
                label="机器臂类型"
                name="robotType"
                rules={[{ required: true, message: '请选择机器臂类型' }]}
              >
                <Select placeholder="请选择机器臂类型" onChange={handleRobotTypeChange} disabled={isActive}>
                  {ROBOT_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="机器人端口">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<UsbOutlined />}
                    onClick={() => setRobotPortModalVisible(true)}
                    block
                    disabled={isActive}
                  >
                    {selectedRobotPorts.length > 0 ? '修改端口' : '查找端口'}
                  </Button>
                  {renderDeviceList(
                    selectedRobotPorts,
                    '未配置端口',
                    handleClearRobotPorts,
                    <UsbOutlined />,
                  )}
                </Space>
              </Form.Item>

              <Form.Item
                label="机械臂名称 (ID)"
                name="robotId"
                rules={[{ required: true, message: '请输入机械臂名称' }]}
              >
                <Input placeholder="请输入" disabled={isActive} />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="config-card" title="示教臂配置" style={{ marginBottom: 0, height: '100%' }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                teleopType: 'so101_leader',
              }}
            >
              <Form.Item
                label="示教臂类型"
                name="teleopType"
                rules={[{ required: true, message: '请选择示教臂类型' }]}
              >
                <Select placeholder="请选择示教臂类型" onChange={handleTeleopTypeChange} disabled={isActive}>
                  {TELEOP_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="示教臂端口">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<UsbOutlined />}
                    onClick={() => setTeleopPortModalVisible(true)}
                    block
                    disabled={isActive}
                  >
                    {selectedTeleopPorts.length > 0 ? '修改端口' : '查找端口'}
                  </Button>
                  {renderDeviceList(
                    selectedTeleopPorts,
                    '未配置端口',
                    handleClearTeleopPorts,
                    <UsbOutlined />,
                  )}
                </Space>
              </Form.Item>

              <Form.Item
                label="示教臂名称 (ID)"
                name="teleopId"
                rules={[{ required: true, message: '请输入示教臂名称' }]}
              >
                <Input placeholder="请输入" disabled={isActive} />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} align="top">
        {/* 左侧：相机配置 + 数据集配置 + 操作 */}
        <Col xs={24} xl={15}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              datasetFps: 30,
              datasetNumEpisodes: 30,
              datasetEpisodeTimeS: 30,
              datasetResetTimeS: 20,
              displayData: false,
            }}
          >
            <Row gutter={16} style={{ marginBottom: 16 }}>
              {/* 相机配置 - 全宽 */}
              <Col xs={24}>
                <Card className="config-card" title="相机配置" style={{ marginBottom: 0 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button
                      type="primary"
                      icon={<VideoCameraOutlined />}
                      onClick={() => setCameraModalVisible(true)}
                      disabled={isActive}
                    >
                      {selectedCameras.length > 0 ? '修改相机' : '配置相机'}
                    </Button>
                    {renderCameraList()}
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              {/* 数据集配置 - 全宽 */}
              <Col xs={24}>
                <Card className="config-card" title="数据集配置" style={{ marginBottom: 0 }}>
                  <Form.Item
                    label="数据集名称"
                    name="datasetName"
                    rules={[{ required: true, message: '请输入数据集名称' }]}
                  >
                    <Input placeholder="请输入" disabled={isActive} />
                  </Form.Item>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                    格式示例: my_dataset
                  </Paragraph>

                  <Form.Item
                    label="任务描述"
                    name="datasetSingleTask"
                    rules={[{ required: true, message: '请输入任务描述' }]}
                  >
                    <Input.TextArea placeholder="请输入任务描述" rows={2} disabled={isActive} />
                  </Form.Item>
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Form.Item label="帧率 (FPS)" name="datasetFps" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} max={120} defaultValue={30} style={{ width: '100%' }} disabled={isActive} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="采集轮数" name="datasetNumEpisodes" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} max={100} defaultValue={30} style={{ width: '100%' }} disabled={isActive} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Form.Item label="每轮录制时长 (秒)" name="datasetEpisodeTimeS" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} max={300} defaultValue={30} style={{ width: '100%' }} disabled={isActive} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="重置时长 (秒)" name="datasetResetTimeS" style={{ marginBottom: 0 }}>
                  <InputNumber min={1} max={300} defaultValue={20} style={{ width: '100%' }} disabled={isActive} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="数据可视化" name="displayData" valuePropName="checked" style={{ marginBottom: 16 }}>
              <Space>
                <Switch disabled={isActive} />
                <Text>显示</Text>
              </Space>
            </Form.Item>

            {/* 操作 */}
            <Card className="config-card" title="操作" style={{ marginBottom: 0 }}>
              {phase === 'recording' ? (
                <>
                  {renderProgress()}
                  {renderRecordingPanel()}
                </>
              ) : (
                <>
                  {renderProgress()}
                  {renderMessagePanel()}
                  {renderControlButtons()}
                </>
              )}
            </Card>
          </Form>
        </Col>

        {/* 右侧日志面板 */}
        <Col xs={24} xl={9}>
          {logPanel}
        </Col>
      </Row>

      {/* 操作臂端口配置弹窗 */}
      <Modal
        title={isRobotDual ? '配置操作臂端口（双臂 - 需要2个端口）' : '配置操作臂端口（单臂 - 需要1个端口）'}
        open={robotPortModalVisible}
        onCancel={() => setRobotPortModalVisible(false)}
        footer={null}
        width={900}
      >
        <PortFinder
          onPortsChange={handleRobotPortsChange}
          onLog={addLog}
          maxSelection={isRobotDual ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 示教臂端口配置弹窗 */}
      <Modal
        title={isTeleopDual ? '配置示教臂端口（双臂 - 需要2个端口）' : '配置示教臂端口（单臂 - 需要1个端口）'}
        open={teleopPortModalVisible}
        onCancel={() => setTeleopPortModalVisible(false)}
        footer={null}
        width={900}
      >
        <PortFinder
          onPortsChange={handleTeleopPortsChange}
          onLog={addLog}
          maxSelection={isTeleopDual ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 相机配置弹窗 */}
      {cameraModalVisible && (
        <div className="modal-overlay" onClick={() => setCameraModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Card
              title="配置相机"
              extra={<Button onClick={() => setCameraModalVisible(false)}>关闭</Button>}
            >
              <CameraFinder onCamerasChange={handleCamerasChange} onLog={addLog} onPreviewCamera={handlePreviewCamera} />
            </Card>
          </div>
        </div>
      )}

      {/* 相机预览弹窗 */}
      {previewCamera && (
        <CameraPreview
          cameraId={String(previewCamera.id)}
          cameraName={previewCamera.name}
          cameraType={previewCamera.type}
          visible={previewVisible}
          onClose={handleClosePreview}
          onLog={addLog}
          localStream={null}
        />
      )}

      {/* 固定悬浮安全操作面板 */}
      <div className="safety-panel">
        <div className="safety-panel-desc">紧急情况可快速停止</div>
        <div className="safety-panel-title">安全操作</div>
        <div className="safety-panel-buttons">
          <Button
            type="primary"
            danger
            icon={<StopOutlined />}
            onClick={handleEmergencyStop}
            size="large"
            disabled={!commandId || phase === 'idle' || phase === 'completed'}
          >
            急停
          </Button>
        </div>
      </div>

      {/* 5秒倒计时弹窗 */}
      <Modal
        title="即将开始采集"
        open={phase === 'countdown'}
        footer={null}
        closable={false}
        centered
        maskClosable={false}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#fa8c16', marginBottom: 8 }}>{countdown}</div>
          <div style={{ fontSize: 16, color: '#666', marginBottom: 16 }}>
            请准备好操作环境，倒计时结束将自动开始录制本回合。
          </div>
          <div style={{ fontSize: 14, color: '#999' }}>
            如需取消，请点击下方按钮
          </div>
          <Button
            danger
            style={{ marginTop: 16 }}
            onClick={() => {
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              setPhase('waiting_ready');
              addServerMessage('已取消本次开始倒计时');
            }}
          >
            取消开始
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default DataCollectionPage;
