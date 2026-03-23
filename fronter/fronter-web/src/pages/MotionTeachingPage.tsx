import { useEffect, useState, useMemo } from 'react';
import { Typography, Card, Form, Select, Input, Button, Space, Tag, Affix } from 'antd';
import { UsbOutlined, CheckCircleOutlined, CloseCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { systemApi } from '@/services/api';
import PortFinder from '@/components/PortFinder';
import CameraFinder from '@/components/CameraFinder';
import LogViewer from '@/components/LogViewer';
import './MotionTeachingPage.css';

const { Option } = Select;
const { Text } = Typography;

// 机械臂类型（与设备标定页面保持一致）
const ARM_TYPES = [
  { value: 'single_leader', label: '单臂（示教臂）', isDual: false },
  { value: 'dual_leader', label: '双臂（示教臂）', isDual: true },
  { value: 'dual_chassis_leader', label: '双臂+底盘（示教臂）', isDual: true },
  { value: 'single_follower', label: '单臂（操作臂）', isDual: false },
  { value: 'dual_follower', label: '双臂（操作臂）', isDual: true },
  { value: 'dual_chassis_follower', label: '双臂+底盘（操作臂）', isDual: true },
];

// 连接状态
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

function MotionTeachingPage() {
  const [form] = Form.useForm();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [selectedArmType, setSelectedArmType] = useState<string>('');
  const [isDualArm, setIsDualArm] = useState(false);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);

  // 检查后端连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        setConnectionStatus('connecting');
        await systemApi.health();
        setConnectionStatus('connected');
        addLog('✅ 后端连接成功');
      } catch {
        setConnectionStatus('disconnected');
        addLog('❌ 后端未连接');
      }
    };
    checkConnection();
  }, []);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // 处理机械臂类型变化
  const handleArmTypeChange = (value: string) => {
    setSelectedArmType(value);
    const armConfig = ARM_TYPES.find((t) => t.value === value);
    setIsDualArm(armConfig?.isDual || false);
    setSelectedPorts([]);
    form.setFieldValue('port', '');
  };

  // 端口变化
  const handlePortsChange = (ports: string[]) => {
    setSelectedPorts(ports);
    addLog(`🔌 已选择端口: ${ports.join(', ')}`);
  };

  // 相机变化
  const handleCamerasChange = (cameras: any[]) => {
    setSelectedCameras(cameras);
    addLog(`📹 已选择相机: ${cameras.length} 个`);
  };

  // 清除端口
  const handleClearPorts = () => {
    setSelectedPorts([]);
    addLog('🗑️ 已清除端口配置');
  };

  // 渲染端口列表
  const renderPortList = () => {
    if (selectedPorts.length === 0) {
      return <Text type="secondary">未配置端口</Text>;
    }
    return (
      <Space wrap>
        {selectedPorts.map((port, index) => (
          <Tag key={index} icon={<UsbOutlined />} color="blue">
            {port}
          </Tag>
        ))}
        <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={handleClearPorts}>
          清除
        </Button>
      </Space>
    );
  };

  // 渲染相机列表
  const renderCameraList = () => {
    if (selectedCameras.length === 0) {
      return <Text type="secondary">未配置相机</Text>;
    }
    return (
      <Space wrap>
        {selectedCameras.map((cam, index) => (
          <Tag key={index} icon={<VideoCameraOutlined />} color="green">
            {cam.name}
          </Tag>
        ))}
      </Space>
    );
  };

  // 状态标签
  const statusTag = useMemo(() => {
    if (connectionStatus === 'connected') return <Tag color="green">连接状态：成功</Tag>;
    if (connectionStatus === 'connecting') return <Tag color="gold">连接状态：连接中</Tag>;
    return <Tag color="red">连接状态：未连接</Tag>;
  }, [connectionStatus]);

  // 右侧日志面板
  const logPanel = useMemo(
    () => (
      <Card
        title={
          <Space size="middle">
            <span>日志输出</span>
            {statusTag}
          </Space>
        }
        styles={{ body: { paddingTop: 12 } }}
      >
        <LogViewer logs={logs} height={400} onClear={() => setLogs([])} />
      </Card>
    ),
    [connectionStatus, logs, statusTag]
  );

  return (
    <div className="motion-teaching-page">
      {/* 顶部标题栏 */}
      <div className="page-header">
        <h1 className="page-title">动作示教</h1>
        <div className="header-status">{statusTag}</div>
      </div>

      {/* 主体内容 */}
      <div className="page-body">
        {/* 左侧配置面板 */}
        <div className="left-panel">
          {/* 机械臂类型 */}
          <Card className="config-card" title="机械臂类型">
            <Form form={form} layout="vertical">
              <Form.Item name="arm_type" label="机械臂类型">
                <Select
                  placeholder="请选择机械臂类型"
                  onChange={handleArmTypeChange}
                  value={selectedArmType || undefined}
                >
                  {ARM_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedArmType && (
                <>
                  <Form.Item label={isDualArm ? '机械臂端口（双臂）' : '机械臂端口'}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Button icon={<UsbOutlined />} onClick={() => setPortModalVisible(true)} block>
                        {selectedPorts.length > 0 ? '修改端口' : '配置端口'}
                      </Button>
                      {renderPortList()}
                    </Space>
                  </Form.Item>

                  <Form.Item name="arm_id" label="机械臂名称">
                    <Input placeholder="例如: my_awesome_arm" />
                  </Form.Item>
                </>
              )}
            </Form>
          </Card>

          {/* 机器人（示教臂）配置 */}
          {selectedArmType && (
            <Card className="config-card" title="机器人（示教臂）配置">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">暂无额外配置项</Text>
              </Space>
            </Card>
          )}

          {/* 相机与其他配置 */}
          {selectedArmType && (
            <Card className="config-card" title="相机与其他配置">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  icon={<VideoCameraOutlined />}
                  onClick={() => setCameraModalVisible(true)}
                  block
                >
                  {selectedCameras.length > 0 ? '修改相机' : '配置相机'}
                </Button>
                {renderCameraList()}
              </Space>
            </Card>
          )}
        </div>

        {/* 右侧视频预览 */}
        <div className="right-panel">
          <Card className="video-card" styles={{ body: { height: '100%', padding: 0 } }}>
            <div className="video-placeholder">
              <VideoCameraOutlined style={{ fontSize: 48, color: '#ccc' }} />
              <Text type="secondary">视频预览区域</Text>
            </div>
          </Card>
        </div>

        {/* 右侧日志面板 */}
        <div className="log-panel">
          <Affix offsetTop={16}>{logPanel}</Affix>
        </div>
      </div>

      {/* 端口配置弹窗 */}
      <Card
        title="配置机械臂端口"
        style={{ display: 'none' }}
      />
      <div style={{ display: portModalVisible ? 'block' : 'none' }}>
        <Card className="modal-card" title="配置机械臂端口">
          <PortFinder
            onPortsChange={handlePortsChange}
            onLog={addLog}
            maxSelection={isDualArm ? 2 : 1}
            selectionType="checkbox"
          />
        </Card>
      </div>
      {portModalVisible && (
        <div className="modal-overlay" onClick={() => setPortModalVisible(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Card
              title={isDualArm ? '配置机械臂端口（双臂）' : '配置机械臂端口（单臂）'}
              extra={<Button onClick={() => setPortModalVisible(false)}>关闭</Button>}
            >
              <PortFinder
                onPortsChange={handlePortsChange}
                onLog={addLog}
                maxSelection={isDualArm ? 2 : 1}
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