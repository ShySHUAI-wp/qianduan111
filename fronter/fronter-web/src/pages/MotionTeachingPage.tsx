import { useEffect, useState, useMemo, useRef } from 'react';
import { Typography, Card, Form, Select, Input, Button, Space, Tag, Affix, Row, Col, message, Tabs } from 'antd';
import { UsbOutlined, VideoCameraOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import PortFinder from '@/components/PortFinder';
import CameraFinder from '@/components/CameraFinder';
import LogViewer from '@/components/LogViewer';
import { wsService } from '@/services/socket';
import type { CameraInfo } from '@/types';
import './MotionTeachingPage.css';

const { Option } = Select;
const { Text } = Typography;

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

// 遥操状态
type TeleopStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

interface TeleoperationFormValues {
  robotType: string;
  robotId: string;
  teleopType: string;
  teleopId: string;
  displayData: boolean;
  fps: number;
}

function MotionTeachingPage() {
  const [form] = Form.useForm<TeleoperationFormValues>();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  // 遥操状态
  const [teleopStatus, setTeleopStatus] = useState<TeleopStatus>('idle');
  const [activeTab, setActiveTab] = useState<'wired' | 'wireless'>('wired');
  const [commandId, setCommandId] = useState<string | null>(null);
  const [rerunUrl, setRerunUrl] = useState<string | null>(null);

  // 操作臂端口配置
  const [robotPortModalVisible, setRobotPortModalVisible] = useState(false);
  const [selectedRobotPorts, setSelectedRobotPorts] = useState<string[]>([]);
  const [isRobotDual, setIsRobotDual] = useState(false);

  // 示教臂端口配置
  const [teleopPortModalVisible, setTeleopPortModalVisible] = useState(false);
  const [selectedTeleopPorts, setSelectedTeleopPorts] = useState<string[]>([]);
  const [isTeleopDual, setIsTeleopDual] = useState(false);

  // 相机配置
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedCameras, setSelectedCameras] = useState<CameraInfo[]>([]);
  const [cameraRotations, setCameraRotations] = useState<Map<string, boolean>>(new Map());

  // 日志
  const [logs, setLogs] = useState<string[]>([]);

  // WebSocket 取消订阅函数
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 检查后端连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        setConnectionStatus('connecting');
        const resp = await fetch('/api/health');
        if (resp.ok) {
          setConnectionStatus('connected');
          addLog('✅ 后端连接成功');
        } else {
          throw new Error();
        }
      } catch {
        setConnectionStatus('disconnected');
        addLog('❌ 后端未连接');
      }
    };
    checkConnection();
  }, []);

  // 清理 WebSocket 订阅
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 判断是否为双臂
  const isBimanual = (type: string) => type?.includes('bi_');

  // 操作臂类型变化
  const handleRobotTypeChange = (value: string) => {
    const config = ROBOT_TYPES.find((t) => t.value === value);
    setIsRobotDual(config?.isDual || false);
    setSelectedRobotPorts([]);
    form.setFieldValue('robot_port', undefined);
    form.setFieldValue('robot_left_arm_port', undefined);
    form.setFieldValue('robot_right_arm_port', undefined);
  };

  // 示教臂类型变化
  const handleTeleopTypeChange = (value: string) => {
    const config = TELEOP_TYPES.find((t) => t.value === value);
    setIsTeleopDual(config?.isDual || false);
    setSelectedTeleopPorts([]);
    form.setFieldValue('teleop_port', undefined);
    form.setFieldValue('teleop_left_arm_port', undefined);
    form.setFieldValue('teleop_right_arm_port', undefined);
  };

  // 操作臂端口变化
  const handleRobotPortsChange = (ports: string[]) => {
    setSelectedRobotPorts(ports);
    addLog(`🤖 已选择操作臂端口: ${ports.join(', ') || '(无)'}`);
  };

  // 示教臂端口变化
  const handleTeleopPortsChange = (ports: string[]) => {
    setSelectedTeleopPorts(ports);
    addLog(`🎮 已选择示教臂端口: ${ports.join(', ') || '(无)'}`);
  };

  // 相机变化
  const handleCamerasChange = (cameras: CameraInfo[]) => {
    setSelectedCameras(cameras);
    addLog(`📹 已选择 ${cameras.length} 个相机`);

    const newRotations = new Map(cameraRotations);
    cameras.forEach((camera) => {
      const cameraKey = `${camera.type}-${camera.id}`;
      if (!newRotations.has(cameraKey)) {
        newRotations.set(cameraKey, false);
      }
    });
    setCameraRotations(newRotations);
  };

  // 切换相机翻转状态
  const handleToggleCameraRotation = (camera: CameraInfo) => {
    const cameraKey = `${camera.type}-${camera.id}`;
    const newRotations = new Map(cameraRotations);
    newRotations.set(cameraKey, !newRotations.get(cameraKey));
    setCameraRotations(newRotations);
    addLog(`🔄 ${camera.name} 翻转${newRotations.get(cameraKey) ? '已启用' : '已禁用'}`);
  };

  // 清除操作臂端口
  const handleClearRobotPorts = () => {
    setSelectedRobotPorts([]);
    addLog('🗑️ 已清除操作臂端口配置');
  };

  // 清除示教臂端口
  const handleClearTeleopPorts = () => {
    setSelectedTeleopPorts([]);
    addLog('🗑️ 已清除示教臂端口配置');
  };

  // 清除相机
  const handleClearCameras = () => {
    setSelectedCameras([]);
    setCameraRotations(new Map());
    addLog('🗑️ 已清除相机配置');
  };

  // 渲染设备列表
  const renderDeviceList = (
    devices: string[],
    emptyText: string,
    onClear: () => void,
    icon: React.ReactNode
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
        <Button type="link" size="small" danger icon={<StopOutlined />} onClick={onClear}>
          清除
        </Button>
      </Space>
    );
  };

  // 渲染相机列表（包含翻转选项）
  const renderCameraList = () => {
    if (selectedCameras.length === 0) {
      return <Text type="secondary">未配置相机（可选）</Text>;
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        {selectedCameras.map((camera, index) => {
          const cameraKey = `${camera.type}-${camera.id}`;
          const isRotated = cameraRotations.get(cameraKey) || false;
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag icon={<VideoCameraOutlined />} color="blue">
                {camera.name}
              </Tag>
              <label style={{ fontSize: '13px', color: '#666' }}>
                <input
                  type="checkbox"
                  checked={isRotated}
                  onChange={() => handleToggleCameraRotation(camera)}
                  style={{ marginRight: 4 }}
                />
                翻转180°
              </label>
            </div>
          );
        })}
        <Button type="link" size="small" danger icon={<StopOutlined />} onClick={handleClearCameras}>
          清除
        </Button>
      </Space>
    );
  };

  // 开始遥操作
  const handleStartTeleoperation = async () => {
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
        message.error('单臂操作臂需要配置至少1个端口');
        return;
      }
      if (isTeleopBimanual && selectedTeleopPorts.length < 2) {
        message.error('双臂示教臂需要配置至少2个端口');
        return;
      }
      if (!isTeleopBimanual && selectedTeleopPorts.length < 1) {
        message.error('单臂示教臂需要配置至少1个端口');
        return;
      }

      addLog('🚀 正在启动遥操...');
      setTeleopStatus('starting');

      // 构建请求数据
      const requestData: any = {
        robot_type: robotType,
        robot_id: values.robotId,
        teleop_type: teleopType,
        teleop_id: values.teleopId,
        fps: values.fps || 30,
        display_data: values.displayData ?? false,
      };

      // 操作臂端口配置
      if (isRobotBimanual) {
        requestData.robot_left_arm_port = selectedRobotPorts[0];
        requestData.robot_right_arm_port = selectedRobotPorts[1];
      } else {
        requestData.robot_port = selectedRobotPorts[0];
      }

      // 示教臂端口配置
      if (isTeleopBimanual) {
        requestData.teleop_left_arm_port = selectedTeleopPorts[0];
        requestData.teleop_right_arm_port = selectedTeleopPorts[1];
      } else {
        requestData.teleop_port = selectedTeleopPorts[0];
      }

      // 相机配置
      if (selectedCameras.length > 0) {
        requestData.enable_cameras = true;
        const cameraConfig: Record<string, any> = {};

        selectedCameras.forEach((camera, idx) => {
          const cameraName = `camera_${idx}`;
          let deviceIndex: number;
          if (typeof camera.id === 'number') {
            deviceIndex = camera.id;
          } else {
            const match = camera.id.match(/(\d+)$/);
            deviceIndex = match ? parseInt(match[1], 10) : 0;
          }

          const config: Record<string, any> = {
            type: camera.type.toLowerCase(),
            index_or_path: deviceIndex,
            width: camera.default_stream_profile?.width || 640,
            height: camera.default_stream_profile?.height || 480,
            fps: camera.default_stream_profile?.fps || 30,
            fourcc: 'MJPG',
          };

          const cameraKey = `${camera.type}-${camera.id}`;
          if (cameraRotations.get(cameraKey)) {
            config.rotation = 'ROTATE_180';
          }

          cameraConfig[cameraName] = config;
        });
        requestData.cameras = cameraConfig;
      } else {
        requestData.enable_cameras = false;
        requestData.cameras = null;
      }

      // 调用 API
      const response = await fetch('/api/commands/teleoperate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (result.code === 0) {
        const cmdId = result.data.commandId;
        setCommandId(cmdId);
        setRerunUrl(result.data.rerunUrl);
        addLog(`✅ 遥操已启动，命令ID: ${cmdId}`);
        setTeleopStatus('running');

        // 订阅 WebSocket 命令输出
        wsService.subscribeCommand(cmdId);
        const unsubCommandOutput = wsService.on('command_output', (data: { commandId: string; output: string }) => {
          if (data.commandId === cmdId && data.output) {
            addLog(data.output);
          }
        });

        const unsubError = wsService.on('error', (data: { commandId: string; message: string }) => {
          if (data.commandId === cmdId) {
            addLog(`❌ 错误: ${data.message}`);
          }
        });

        const unsubStatus = wsService.on('command_status', (data: { commandId: string; status: string }) => {
          if (data.commandId === cmdId) {
            if (data.status === 'stopped' || data.status === 'error') {
              setTeleopStatus('stopped');
              addLog(`📊 命令状态: ${data.status}`);
            }
          }
        });

        unsubscribeRef.current = () => {
          wsService.unsubscribeCommand(cmdId);
          unsubCommandOutput();
          unsubError();
          unsubStatus();
        };

        if (values.displayData && result.data.rerunUrl) {
          addLog('📊 Rerun可视化已启动');
        }
      } else {
        throw new Error(result.message || '启动失败');
      }
    } catch (error: any) {
      message.error(`启动失败: ${error.message}`);
      addLog(`❌ 启动失败: ${error.message}`);
      setTeleopStatus('idle');
    }
  };

  // 停止遥操作
  const handleStopTeleoperation = async () => {
    if (!commandId) return;

    try {
      setTeleopStatus('stopping');
      addLog('⏸️ 正在停止遥操...');

      const response = await fetch('/api/commands/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });

      const result = await response.json();

      if (result.code === 0) {
        message.success('遥操已停止');
        addLog('⏹️ 遥操已停止');
        setTeleopStatus('stopped');

        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      } else {
        throw new Error(result.message || '停止失败');
      }
    } catch (error: any) {
      message.error(`停止失败: ${error.message}`);
      addLog(`❌ 停止失败: ${error.message}`);
      setTeleopStatus('running');
    }
  };

  // 日志面板
  const logPanel = useMemo(
    () => (
      <Affix offsetTop={16}>
        <Card
          title="日志输出"
          styles={{ body: { paddingTop: 12 } }}
        >
          <LogViewer logs={logs} height={520} onClear={() => setLogs([])} />
        </Card>
      </Affix>
    ),
    [logs]
  );

  return (
    <div>
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
          动作示教
        </Typography.Title>
        <Tag color={connectionStatus === 'connected' ? 'green' : 'red'}>
          连接状态：{connectionStatus === 'connected' ? '成功' : '未连接'}
        </Tag>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'wired' | 'wireless')}
        items={[
          {
            key: 'wired',
            label: '有线遥操作',
            children: (
              <Row gutter={16} align="top">
                {/* 左侧配置面板 */}
                <Col xs={24} xl={15}>
          <Form form={form} layout="vertical">
            {/* 操作臂配置 */}
            <Card className="config-card" title="操作臂配置" style={{ marginBottom: 16 }}>
              <Form.Item name="robotType" label="操作臂类型" rules={[{ required: true, message: '请选择操作臂类型' }]}>
                <Select placeholder="请选择操作臂类型" onChange={handleRobotTypeChange}>
                  {ROBOT_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="机器人端口">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button icon={<UsbOutlined />} onClick={() => setRobotPortModalVisible(true)} block>
                    {selectedRobotPorts.length > 0 ? '修改端口' : '配置端口'}
                  </Button>
                  {renderDeviceList(
                    selectedRobotPorts,
                    '未配置端口',
                    handleClearRobotPorts,
                    <UsbOutlined />
                  )}
                </Space>
              </Form.Item>

              <Form.Item name="robotId" label="操作臂ID" rules={[{ required: true, message: '请输入操作臂ID' }]}>
                <Input placeholder="例如: my_awesome_follower_arm" />
              </Form.Item>
            </Card>

            {/* 示教臂配置 */}
            <Card className="config-card" title="示教臂配置" style={{ marginBottom: 16 }}>
              <Form.Item name="teleopType" label="示教臂类型" rules={[{ required: true, message: '请选择示教臂类型' }]}>
                <Select placeholder="请选择示教臂类型" onChange={handleTeleopTypeChange}>
                  {TELEOP_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="遥操端口">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button icon={<UsbOutlined />} onClick={() => setTeleopPortModalVisible(true)} block>
                    {selectedTeleopPorts.length > 0 ? '修改端口' : '配置端口'}
                  </Button>
                  {renderDeviceList(
                    selectedTeleopPorts,
                    '未配置端口',
                    handleClearTeleopPorts,
                    <UsbOutlined />
                  )}
                </Space>
              </Form.Item>

              <Form.Item name="teleopId" label="示教臂ID" rules={[{ required: true, message: '请输入示教臂ID' }]}>
                <Input placeholder="例如: my_awesome_leader_arm" />
              </Form.Item>
            </Card>

            {/* 相机与其他配置 */}
            <Card className="config-card" title="相机与其他配置" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button icon={<VideoCameraOutlined />} onClick={() => setCameraModalVisible(true)} block>
                  {selectedCameras.length > 0 ? '修改相机' : '配置相机'}
                </Button>
                {renderCameraList()}

                <Form.Item name="displayData" label="数据显示" style={{ marginBottom: 8 }}>
                  <Select>
                    <Option value={false}>不显示</Option>
                    <Option value={true}>显示（Rerun可视化）</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="fps" label="FPS" style={{ marginBottom: 0 }}>
                  <Input min={1} max={120} type="number" defaultValue={30} />
                </Form.Item>
              </Space>
            </Card>

            {/* 开始/停止按钮 */}
            <Card className="config-card" title="操作">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={handleStartTeleoperation}
                  disabled={teleopStatus === 'running' || teleopStatus === 'starting'}
                  loading={teleopStatus === 'starting'}
                  block
                >
                  开始遥操作
                </Button>
                <Button
                  danger
                  size="large"
                  icon={<StopOutlined />}
                  onClick={handleStopTeleoperation}
                  disabled={teleopStatus !== 'running'}
                  block
                >
                  停止遥操
                </Button>
              </Space>
            </Card>
          </Form>
        </Col>

        {/* 右侧日志面板 */}
        <Col xs={24} xl={9}>
          {logPanel}
        </Col>
        </Row>
          ),
        },
        {
          key: 'wireless',
          label: '无线遥操作',
          children: (
            <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
              无线遥操作功能开发中...
            </div>
          ),
        },
      ]}
      />

      {/* 操作臂端口配置弹窗 */}
      {robotPortModalVisible && (
        <div className="modal-overlay" onClick={() => setRobotPortModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Card
              title={isRobotDual ? '配置操作臂端口（双臂 - 需要2个端口）' : '配置操作臂端口（单臂 - 需要1个端口）'}
              extra={<Button onClick={() => setRobotPortModalVisible(false)}>关闭</Button>}
            >
              <PortFinder
                onPortsChange={handleRobotPortsChange}
                onLog={addLog}
                maxSelection={isRobotDual ? 2 : 1}
                selectionType="checkbox"
              />
            </Card>
          </div>
        </div>
      )}

      {/* 示教臂端口配置弹窗 */}
      {teleopPortModalVisible && (
        <div className="modal-overlay" onClick={() => setTeleopPortModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Card
              title={isTeleopDual ? '配置示教臂端口（双臂 - 需要2个端口）' : '配置示教臂端口（单臂 - 需要1个端口）'}
              extra={<Button onClick={() => setTeleopPortModalVisible(false)}>关闭</Button>}
            >
              <PortFinder
                onPortsChange={handleTeleopPortsChange}
                onLog={addLog}
                maxSelection={isTeleopDual ? 2 : 1}
                selectionType="checkbox"
              />
            </Card>
          </div>
        </div>
      )}

      {/* 相机配置弹窗 */}
      {cameraModalVisible && (
        <div className="modal-overlay" onClick={() => setCameraModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Card
              title="配置相机"
              extra={<Button onClick={() => setCameraModalVisible(false)}>关闭</Button>}
            >
              <CameraFinder onCamerasChange={handleCamerasChange} onLog={addLog} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default MotionTeachingPage;
