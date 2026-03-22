import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Form,
  Input,
  Button,
  InputNumber,
  Select,
  Space,
  Card,
  Modal,
  message,
  Tag,
  Empty,
  Progress,
  Divider,
  Switch,
  Spin,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CloseCircleOutlined,
  UsbOutlined,
  CameraOutlined,
  CaretRightOutlined,
  FastForwardOutlined,
  UndoOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import CameraFinder from '@/components/CameraFinder';
import PortFinder from '@/components/PortFinder';
import type { CameraInfo } from '@/types';
import './Record.css';

const { Option } = Select;

interface RecordProps {
  onLog?: (message: string) => void;
}

interface RecordFormValues {
  robotType: string;
  robotId: string;
  teleopType: string;
  teleopId: string;
  datasetPath: string;
  datasetName: string;
  datasetFps: number;
  datasetNumEpisodes: number;
  datasetSingleTask: string;
  datasetEpisodeTimeS: number;
  datasetResetTimeS: number;
  datasetPushToHub: boolean;
  displayData: boolean;
}

// 录制阶段状态机
type RecordPhase =
  | 'idle'           // 未启动
  | 'starting'       // 正在启动进程 + 连接socket
  | 'waiting_ready'  // 等待服务端 ready
  | 'recording'      // 正在录制
  | 'saving'         // 正在保存
  | 'resetting'      // 回正阶段（等待用户操控机器人回到初始位置）
  | 'stopping'       // 正在停止（等待 record_finish）
  | 'completed';     // 全部完成

interface ServerMessage {
  time: string;
  text: string;
}

function Record({ onLog }: RecordProps) {
  const [form] = Form.useForm<RecordFormValues>();
  const [commandId, setCommandId] = useState<string | null>(null);

  // 端口配置状态
  const [robotPortModalVisible, setRobotPortModalVisible] = useState(false);
  const [teleopPortModalVisible, setTeleopPortModalVisible] = useState(false);
  const [selectedRobotPorts, setSelectedRobotPorts] = useState<string[]>([]);
  const [selectedTeleopPorts, setSelectedTeleopPorts] = useState<string[]>([]);

  // 相机配置状态
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedCameras, setSelectedCameras] = useState<CameraInfo[]>([]);
  const [cameraRotations, setCameraRotations] = useState<Map<string, boolean>>(new Map());

  // 录制阶段
  const [phase, setPhase] = useState<RecordPhase>('idle');

  // 录制进度数据
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  // 服务端消息日志
  const [serverMessages, setServerMessages] = useState<ServerMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 轮询控制
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Rerun 可视化
  const [rerunUrl, setRerunUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 保存数据弹窗
  const [savingModalVisible, setSavingModalVisible] = useState(false);

  // Episode 开始倒计时（5秒提醒）
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset 倒计时（回正阶段提示）
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isActive = phase !== 'idle' && phase !== 'completed';

  const resetTimeS = useMemo(() => {
    const v = form.getFieldValue('datasetResetTimeS');
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }, [form]);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[Record]', msg);
    onLog?.(msg);
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

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (resetTimerRef.current) {
        clearInterval(resetTimerRef.current);
      }
    };
  }, []);

  // 判断是否为双臂机器人
  const isBimanualRobot = (type: string) => type?.includes('bi_');

  // ===================== 消息轮询 =====================

  const startPolling = (cmdId: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

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
      setCurrentTime(0);
      setRemainingTime(0);
      setPhase('waiting_ready');
      addServerMessage(`Episode ${current}/${total} 准备就绪，可以开始采集`);
      addLog(`就绪: 第 ${current}/${total} 轮`);
    } else if (msg.startsWith('progress|')) {
      const parts = msg.split('|');
      let cur = 0;
      let tot = 0;
      let rem = 0;
      parts.forEach((part) => {
        if (part.startsWith('current:')) cur = parseFloat(part.split(':')[1]);
        else if (part.startsWith('total:')) tot = parseFloat(part.split(':')[1]);
        else if (part.startsWith('remaining:')) rem = parseFloat(part.split(':')[1]);
      });

      setCurrentTime(cur);
      setTotalTime(tot);
      setRemainingTime(rem);
      setPhase('recording');
      // progress 消息频繁，不写入消息面板
    } else if (msg === 'saving_start') {
      setPhase('saving');
      setSavingModalVisible(true);
      addServerMessage('正在保存 episode 数据...');
      addLog('开始保存数据...');
    } else if (msg === 'saving_complete') {
      setSavingModalVisible(false);
      addServerMessage('episode 数据保存完成');
      addLog('数据保存完成');
      message.success('数据保存完成');
      // phase 会在收到 resetting 时切到 resetting
    } else if (msg === 'resetting') {
      setPhase('resetting');
      addServerMessage('请操控遥操设备将机器人移回初始位置，完成后点击"完成回正"');
      addLog('进入回正阶段');
      // 启动本地 reset 倒计时（仅用于 UI 提示）
      if (resetTimerRef.current) {
        clearInterval(resetTimerRef.current);
      }
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
      setSavingModalVisible(false);
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

  const handleStart = async () => {
    try {
      const values = await form.validateFields();

      // 验证端口
      const robotType = values.robotType;
      const teleopType = values.teleopType;
      const isRobotBimanual = isBimanualRobot(robotType);
      const isTeleopBimanual = isBimanualRobot(teleopType);

      if (isRobotBimanual && selectedRobotPorts.length < 2) {
        message.error('双臂机器人需要配置至少2个端口');
        return;
      }
      if (!isRobotBimanual && selectedRobotPorts.length < 1) {
        message.error('请配置 Robot 端口');
        return;
      }
      if (teleopType && isTeleopBimanual && selectedTeleopPorts.length < 2) {
        message.error('双臂遥操需要配置至少2个端口');
        return;
      }
      if (teleopType && !isTeleopBimanual && selectedTeleopPorts.length < 1) {
        message.error('请配置 Teleop 端口');
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
        const isRotated = cameraRotations.get(String(camera.id)) || false;
        cameraConfig[cameraName] = {
          type: 'opencv',
          index_or_path: camera.id,
          width: 640,
          height: 480,
          fps: 30,
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

      // 1. 调用 /start
      const requestParams: any = {
        robot_type: values.robotType,
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
        dataset_push_to_hub: values.datasetPushToHub || false,
        display_data: values.displayData !== undefined ? values.displayData : true,
      };

      if (teleopType) {
        requestParams.teleop_type = values.teleopType;
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

      if (values.displayData && startResult.data.rerunUrl) {
        setRerunUrl(startResult.data.rerunUrl);
      }

      // 2. 自动重试 /connect-socket
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
            addServerMessage(`socket 连接成功（第 ${i + 1} 次尝试）`);
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

      // 3. 开始轮询消息
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

  // ===================== begin: 开始采集 =====================

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

  const handleBegin = async () => {
    if (!commandId) return;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(5);
    setCountdownVisible(true);
    addServerMessage('即将开始采集：5 秒倒计时...');

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdownVisible(false);
          void doBegin();
          return 0;
        }
        return prev - 1;
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

  // ===================== reset-done: 回正完成 =====================

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

  // ===================== stop: 停止全部录制 =====================

  const handleStop = async () => {
    if (!commandId) return;
    try {
      addServerMessage('发送停止录制指令...');
      setPhase('stopping');
      const resp = await fetch('/api/record/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      const result = await resp.json();
      if (result.code === 0) {
        addServerMessage('停止指令已发送，等待录制结束...');
        addLog('停止指令已发送');
      } else {
        throw new Error(result.message || '停止失败');
      }
    } catch (error: any) {
      setPhase('recording'); // 恢复状态
      message.error(error.message || '停止失败');
    }
  };

  // ===================== cancel: 取消并终止进程 =====================

  const handleCancel = async () => {
    if (!commandId) return;
    try {
      addServerMessage('取消录制...');
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
        setRerunUrl(null);
        setSavingModalVisible(false);
        addServerMessage('录制已取消');
        addLog('录制已取消');
        message.success('录制已取消');
        if (resetTimerRef.current) {
          clearInterval(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setResetCountdown(null);
      } else {
        throw new Error(result.message || '取消失败');
      }
    } catch (error: any) {
      message.error(error.message || '取消失败');
    }
  };

  // ===================== 重置（完成后） =====================

  const handleReset = () => {
    setPhase('idle');
    setCommandId(null);
    setRerunUrl(null);
    setCurrentEpisode(0);
    setTotalEpisodes(0);
    setCurrentTime(0);
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
    setCountdownVisible(false);
    setResetCountdown(null);
  };

  // ===================== 端口 & 相机回调 =====================

  const handleConfigureRobotPort = () => setRobotPortModalVisible(true);
  const handleConfigureTeleopPort = () => setTeleopPortModalVisible(true);

  const handleRobotPortsChange = (ports: string[]) => {
    setSelectedRobotPorts(ports);
    addLog(`Robot 端口已选择: ${ports.join(', ')}`);
  };

  const handleTeleopPortsChange = (ports: string[]) => {
    setSelectedTeleopPorts(ports);
    addLog(`Teleop 端口已选择: ${ports.join(', ')}`);
  };

  const handleClearRobotPorts = () => {
    setSelectedRobotPorts([]);
    addLog('Robot 端口已清除');
  };

  const handleClearTeleopPorts = () => {
    setSelectedTeleopPorts([]);
    addLog('Teleop 端口已清除');
  };

  const handleConfigureCamera = () => setCameraModalVisible(true);

  const handleCamerasChange = (cameras: CameraInfo[]) => {
    setSelectedCameras(cameras);
    addLog(`相机已选择: ${cameras.map((c) => c.name).join(', ')}`);
  };

  const handleClearCameras = () => {
    setSelectedCameras([]);
    setCameraRotations(new Map());
    addLog('相机已清除');
  };

  const handleToggleCameraRotation = (cameraId: string) => {
    const newRotations = new Map(cameraRotations);
    newRotations.set(cameraId, !newRotations.get(cameraId));
    setCameraRotations(newRotations);
  };

  // ===================== 渲染：端口列表 =====================

  const renderPortList = (ports: string[], onClear: () => void, label: string) => {
    if (ports.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`未配置${label}端口`}
          style={{ margin: '12px 0' }}
        />
      );
    }
    return (
      <div style={{ marginTop: 8 }}>
        <Space wrap>
          {ports.map((port, index) => (
            <Tag key={index} icon={<UsbOutlined />} color="blue">
              {port}
            </Tag>
          ))}
          <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={onClear}>
            清除
          </Button>
        </Space>
      </div>
    );
  };

  // ===================== 渲染：相机列表 =====================

  const renderCameraList = () => {
    if (selectedCameras.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未配置相机"
          style={{ margin: '12px 0' }}
        />
      );
    }
    return (
      <div style={{ marginTop: 8 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {selectedCameras.map((camera) => {
            const cameraKey = String(camera.id);
            const isRotated = cameraRotations.get(cameraKey) || false;
            return (
              <div
                key={cameraKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                }}
              >
                <Space>
                  <CameraOutlined style={{ fontSize: '16px', color: '#1890ff' }} />
                  <span>{camera.name}</span>
                  <Tag color="blue">{camera.id}</Tag>
                  {isRotated && <Tag color="orange">旋转180°</Tag>}
                </Space>
                <Button size="small" onClick={() => handleToggleCameraRotation(cameraKey)}>
                  {isRotated ? '取消旋转' : '旋转180°'}
                </Button>
              </div>
            );
          })}
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleClearCameras}
          >
            清除所有相机
          </Button>
        </Space>
      </div>
    );
  };

  // ===================== 渲染：服务端消息面板 =====================

  const renderMessagePanel = () => {
    if (phase === 'idle') return null;

    return (
      <Card
        title="服务端消息"
        size="small"
        style={{ marginBottom: 16 }}
        styles={{
          body: {
            maxHeight: 200,
            overflowY: 'auto',
            padding: '8px 12px',
            background: '#1e1e1e',
            fontFamily: 'monospace',
            fontSize: 13,
          },
        }}
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

  // ===================== 渲染：进度面板 =====================

  const renderProgressPanel = () => {
    if (phase === 'idle' || phase === 'starting') return null;

    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>
            Episode {currentEpisode} / {totalEpisodes}
          </span>
          <span>
            {phase === 'waiting_ready' && '等待开始采集'}
            {phase === 'recording' && `录制中 (剩余 ${remainingTime.toFixed(1)}s)`}
            {phase === 'saving' && '保存数据中...'}
            {phase === 'resetting' &&
              `回正中${resetCountdown !== null ? `（重置倒计时 ${resetCountdown}s）` : ''} - 请将机器人移回初始位置`}
            {phase === 'stopping' && '正在停止录制...'}
            {phase === 'completed' && '已完成'}
          </span>
        </div>

        {/* 轮次总进度 */}
        <Progress
          percent={
            totalEpisodes > 0
              ? Math.round(((currentEpisode - 1) / totalEpisodes) * 100)
              : 0
          }
          status={phase === 'completed' ? 'success' : 'active'}
          style={{ marginBottom: 8 }}
        />

        {/* 当前轮次时间进度 */}
        {phase === 'recording' && totalTime > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
                fontSize: 12,
              }}
            >
              <span>当前轮次</span>
              <span>
                {currentTime.toFixed(1)}s / {totalTime}s
              </span>
            </div>
            <Progress
              percent={Math.round(((totalTime - remainingTime) / totalTime) * 100)}
              size="small"
              status="active"
            />
          </div>
        )}
      </Card>
    );
  };

  // ===================== 渲染：控制按钮 =====================

  const renderControlButtons = () => {
    // 未启动：显示 start 按钮
    if (phase === 'idle') {
      return (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleStart}
          size="large"
          block
        >
          启动录制
        </Button>
      );
    }

    // 正在启动中
    if (phase === 'starting') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button type="primary" size="large" block loading disabled>
            启动中...
          </Button>
          <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel} block>
            取消
          </Button>
        </Space>
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

    // 等待 ready：显示 begin + cancel
    if (phase === 'waiting_ready') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={handleBegin}
            size="large"
            block
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            开始采集 (Episode {currentEpisode})
          </Button>
          <Space style={{ width: '100%' }} size="middle">
            <Button danger icon={<StopOutlined />} onClick={handleStop}>
              停止全部录制
            </Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel}>
              取消并终止
            </Button>
          </Space>
        </Space>
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

    // 回正阶段：显示 完成回正 + cancel
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
            icon={<CaretRightOutlined />}
            onClick={handleResetDone}
            size="large"
            block
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            完成回正
          </Button>
          <Space style={{ width: '100%' }} size="middle">
            <Button danger icon={<StopOutlined />} onClick={handleStop}>
              停止全部录制
            </Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel}>
              强制关闭（慎用）
            </Button>
          </Space>
        </Space>
      );
    }

    // 正在停止中
    if (phase === 'stopping') {
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button type="primary" size="large" block loading disabled>
            正在停止录制...
          </Button>
          <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel} block>
            强制关闭（慎用）
          </Button>
        </Space>
      );
    }

    // 录制中：显示 next / rerecord / stop / cancel
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space style={{ width: '100%' }} size="middle" wrap>
          <Button
            type="primary"
            icon={<FastForwardOutlined />}
            onClick={handleNext}
          >
            下一轮 (保存)
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleRerecord}>
            重新录制 (丢弃)
          </Button>
          <Button danger icon={<PoweroffOutlined />} onClick={handleStop}>
            停止全部录制并保存
          </Button>
          <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel}>
            强制关闭（慎用）
          </Button>
        </Space>
      </Space>
    );
  };

  // ===================== 主渲染 =====================

  return (
    <div className="record-container">
      <Card title="数据采集">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            robotType: 'so101_follower',
            robotId: 'my_awesome_follower_arm',
            teleopType: 'so101_leader',
            teleopId: 'my_awesome_leader_arm',
            datasetName: 'dj_test',
            datasetSingleTask: 'Grab a block',
            datasetFps: 30,
            datasetNumEpisodes: 5,
            datasetEpisodeTimeS: 30,
            datasetResetTimeS: 20,
            datasetPushToHub: false,
            displayData: true,
          }}
        >
          {/* Robot 配置 */}
          <Divider>Robot 配置</Divider>

          <Form.Item
            label="Robot 类型"
            name="robotType"
            rules={[{ required: true, message: '请选择 Robot 类型' }]}
          >
            <Select placeholder="请选择 Robot 类型" disabled={isActive}>
              <Option value="so100_follower">SO-100 Follower</Option>
              <Option value="so101_follower">SO-101 Follower</Option>
              <Option value="bi_so100_follower">Bi-SO-100 Follower</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Robot 端口">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button icon={<UsbOutlined />} onClick={handleConfigureRobotPort} disabled={isActive}>
                配置 Robot 端口
              </Button>
              {renderPortList(selectedRobotPorts, handleClearRobotPorts, 'Robot')}
            </Space>
          </Form.Item>

          <Form.Item
            label="Robot ID"
            name="robotId"
            rules={[{ required: true, message: '请输入 Robot ID' }]}
          >
            <Input placeholder="例如: my_awesome_follower_arm" disabled={isActive} />
          </Form.Item>

          <Divider>Teleop 配置（可选）</Divider>

          <Form.Item label="Teleop 类型" name="teleopType">
            <Select placeholder="请选择 Teleop 类型（可选）" disabled={isActive} allowClear>
              <Option value="so100_leader">SO-100 Leader</Option>
              <Option value="so101_leader">SO-101 Leader</Option>
              <Option value="bi_so100_leader">Bi-SO-100 Leader</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Teleop 端口">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button icon={<UsbOutlined />} onClick={handleConfigureTeleopPort} disabled={isActive}>
                配置 Teleop 端口
              </Button>
              {renderPortList(selectedTeleopPorts, handleClearTeleopPorts, 'Teleop')}
            </Space>
          </Form.Item>

          <Form.Item label="Teleop ID" name="teleopId">
            <Input placeholder="例如: my_awesome_leader_arm" disabled={isActive} />
          </Form.Item>

          {/* 相机配置 */}
          <Divider>相机配置</Divider>

          <Form.Item label="相机">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button icon={<CameraOutlined />} onClick={handleConfigureCamera} disabled={isActive}>
                配置相机
              </Button>
              {renderCameraList()}
            </Space>
          </Form.Item>

          {/* Dataset 配置 */}
          <Divider>Dataset 配置</Divider>

          <Form.Item
            label="数据集名称"
            name="datasetName"
            rules={[{ required: true, message: '请输入数据集名称' }]}
            extra="格式示例: my_dataset （将存储到 ~/.cache/huggingface/lerobot/my_dataset/my_dataset_000001）"
          >
            <Input placeholder="my_dataset" disabled={isActive} />
          </Form.Item>

          <Form.Item
            label="任务描述"
            name="datasetSingleTask"
            rules={[{ required: true, message: '请输入任务描述' }]}
          >
            <Input.TextArea
              placeholder="例如: Grab the pink cube and place it in the box"
              rows={3}
              disabled={isActive}
            />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="FPS" name="datasetFps" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={60} disabled={isActive} />
            </Form.Item>
            <Form.Item label="采集轮数" name="datasetNumEpisodes" style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={100} disabled={isActive} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="每轮录制时长(秒)" name="datasetEpisodeTimeS" style={{ marginBottom: 0 }}>
              <InputNumber min={5} max={300} disabled={isActive} />
            </Form.Item>
            <Form.Item label="重置时长(秒)" name="datasetResetTimeS" style={{ marginBottom: 0 }}>
              <InputNumber min={5} max={300} disabled={isActive} />
            </Form.Item>
          </Space>

          <Form.Item
            label="可视化显示"
            name="displayData"
            valuePropName="checked"
            extra="开启后将在 Rerun 中实时显示数据"
          >
            <Switch disabled={isActive} />
          </Form.Item>

          {/* 控制区域 */}
          <Divider>控制</Divider>

          {renderMessagePanel()}
          {renderProgressPanel()}
          {renderControlButtons()}
        </Form>
      </Card>

      {/* Rerun 可视化 */}
      {rerunUrl && isActive && (
        <Card title="数据可视化（Rerun）" style={{ marginTop: 16 }}>
          <div style={{ position: 'relative', width: '100%', height: '600px' }}>
            <Spin spinning={false} tip="加载 Rerun 可视化...">
              <iframe
                ref={iframeRef}
                src="https://rerun.io/viewer/version/0.26.2?url=rerun%2Bhttp%3A%2F%2F127.0.0.1%3A9876%2Fproxy"
                style={{
                  width: '100%',
                  height: '600px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                }}
                title="Rerun Visualization"
                allow="cross-origin-isolated"
              />
            </Spin>
          </div>
        </Card>
      )}

      {/* Robot 端口模态框 */}
      <Modal
        title="配置 Robot 端口"
        open={robotPortModalVisible}
        onCancel={() => setRobotPortModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setRobotPortModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <PortFinder onPortsChange={handleRobotPortsChange} onLog={addLog} maxSelection={1} selectionType="checkbox" />
      </Modal>

      {/* Teleop 端口模态框 */}
      <Modal
        title="配置 Teleop 端口"
        open={teleopPortModalVisible}
        onCancel={() => setTeleopPortModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setTeleopPortModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <PortFinder onPortsChange={handleTeleopPortsChange} onLog={addLog} maxSelection={1} selectionType="checkbox" />
      </Modal>

      {/* 相机配置模态框 */}
      <Modal
        title="配置相机"
        open={cameraModalVisible}
        onCancel={() => setCameraModalVisible(false)}
        width={1200}
        footer={[
          <Button key="close" onClick={() => setCameraModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <CameraFinder onCamerasChange={handleCamerasChange} onLog={addLog} />
      </Modal>

      {/* 保存数据弹窗 */}
      <Modal
        title="正在保存数据"
        open={savingModalVisible}
        footer={null}
        closable={false}
        centered
        maskClosable={false}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <p style={{ fontSize: '16px', marginTop: '20px', color: '#666' }}>
            正在保存录制数据，请稍候...
          </p>
          <p style={{ marginTop: '16px', color: '#999' }}>此期间请勿进行任何操作</p>
        </div>
      </Modal>

      {/* Episode 倒计时弹窗 */}
      <Modal
        title="即将开始采集"
        open={countdownVisible}
        footer={null}
        closable={false}
        centered
        maskClosable={false}
      >
        <div style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{countdown}</div>
          <div style={{ color: '#666' }}>请准备好操作环境，倒计时结束将自动开始录制本回合。</div>
          <div style={{ marginTop: 12 }}>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => {
                if (countdownTimerRef.current) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                }
                setCountdownVisible(false);
                addServerMessage('已取消本次开始倒计时');
              }}
            >
              取消开始
            </Button>
          </div>
        </div>
      </Modal>

      {/* 录制中：悬浮安全操作窗（固定在页面中部） */}
      {isActive && (
        <div className="record-safety-float">
          <div className="record-safety-title">安全操作</div>
          <div className="record-safety-desc">紧急情况可快速停止</div>
          <div className="record-safety-actions">
            <Button danger icon={<StopOutlined />} onClick={handleStop} disabled={!commandId}>
              停止
            </Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel} disabled={!commandId}>
              强制
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Record;
