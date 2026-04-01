import { useState, useRef } from 'react';
import {
  Form,
  Input,
  Button,
  InputNumber,
  Select,
  Space,
  Card,
  Divider,
  Modal,
  message,
  Spin,
  Tag,
  Empty,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CloseCircleOutlined,
  UsbOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import CameraFinder from '@/components/CameraFinder';
import PortFinder from '@/components/PortFinder';
import type { CameraInfo } from '@/types';
import './Teleoperate.css';

interface TeleoperateProps {
  onLog?: (message: string) => void;
}

interface TeleoperateFormValues {
  // Robot配置
  robotType: string;
  robotId: string;

  // Teleop配置
  teleopType: string;
  teleopId: string;

  // 显示选项
  displayData: boolean;
  fps: number;
}

function Teleoperate({ onLog }: TeleoperateProps) {
  const [form] = Form.useForm<TeleoperateFormValues>();
  const [isRunning, setIsRunning] = useState(false);

  // 端口配置状态
  const [robotPortModalVisible, setRobotPortModalVisible] = useState(false);
  const [teleopPortModalVisible, setTeleopPortModalVisible] = useState(false);
  const [selectedRobotPorts, setSelectedRobotPorts] = useState<string[]>([]);
  const [selectedTeleopPorts, setSelectedTeleopPorts] = useState<string[]>([]);

  // 相机配置状态
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedCameras, setSelectedCameras] = useState<CameraInfo[]>([]);
  // 相机翻转状态：Map<相机ID, 是否翻转>
  const [cameraRotations, setCameraRotations] = useState<Map<string, boolean>>(new Map());

  // 运行状态
  const [rerunUrl, setRerunUrl] = useState<string | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[Teleoperate]', msg);
    onLog?.(msg);
  };

  // 判断是否为双臂机器人
  const isBimanualRobot = (type: string) => type?.includes('bi_');

  // 开始遥操
  const handleStart = async () => {
    try {
      const values = await form.validateFields();

      // 检查端口配置
      const robotType = values.robotType;
      const teleopType = values.teleopType;
      const isRobotBimanual = isBimanualRobot(robotType);
      const isTeleopBimanual = isBimanualRobot(teleopType);

      // 验证端口配置
      if (isRobotBimanual && selectedRobotPorts.length < 2) {
        message.error('双臂机器人需要配置至少2个端口（左臂和右臂）');
        return;
      }
      if (!isRobotBimanual && selectedRobotPorts.length < 1) {
        message.error('单臂机器人需要配置至少1个端口');
        return;
      }
      if (isTeleopBimanual && selectedTeleopPorts.length < 2) {
        message.error('双臂遥操需要配置至少2个端口（左臂和右臂）');
        return;
      }
      if (!isTeleopBimanual && selectedTeleopPorts.length < 1) {
        message.error('单臂遥操需要配置至少1个端口');
        return;
      }

      addLog('准备启动遥操...');
      setIsRunning(true);

      // 如果启用了数据显示，lerobot-teleoperate 会自动处理 Rerun
      if (values.displayData) {
        addLog('遥操将启用 Rerun 数据记录');
        addLog('Rerun 可视化将通过 app.rerun.io 连接到本地数据');
      }

      // 构建请求数据
      const requestData: any = {
        robot_type: robotType,
        robot_id: values.robotId,
        teleop_type: teleopType,
        teleop_id: values.teleopId,
        fps: values.fps,
        display_data: values.displayData,
      };

      // 配置机器人端口
      if (isRobotBimanual) {
        requestData.robot_left_arm_port = selectedRobotPorts[0];
        requestData.robot_right_arm_port = selectedRobotPorts[1];
      } else {
        requestData.robot_port = selectedRobotPorts[0];
      }

      // 配置遥操端口
      if (isTeleopBimanual) {
        requestData.teleop_left_arm_port = selectedTeleopPorts[0];
        requestData.teleop_right_arm_port = selectedTeleopPorts[1];
      } else {
        requestData.teleop_port = selectedTeleopPorts[0];
      }

      // 配置相机（如果有选择）
      if (selectedCameras.length > 0) {
        requestData.enable_cameras = true;
        const cameraConfig: Record<string, any> = {};

        selectedCameras.forEach((camera, idx) => {
          // 相机名称：camera_0, camera_1...
          const cameraName = `camera_${idx}`;

          // 从CameraInfo构建配置对象
          // 提取设备索引：从 "/dev/video0" 中提取 0，从 "/dev/video11" 中提取 11
          let deviceIndex: number;
          if (typeof camera.id === 'number') {
            deviceIndex = camera.id;
          } else {
            // 从路径末尾提取数字，如 "/dev/video0" -> 0
            const match = camera.id.match(/(\d+)$/);
            deviceIndex = match ? parseInt(match[1], 10) : 0;
          }

          const config: Record<string, any> = {
            type: camera.type.toLowerCase(),  // 转为小写
            index_or_path: deviceIndex,  // 从设备路径提取的索引
            width: camera.default_stream_profile.width,
            height: camera.default_stream_profile.height,
            fps: camera.default_stream_profile.fps,
            fourcc: 'MJPG',  // 固定使用MJPG
          };

          // 检查是否启用翻转（只有启用时才添加rotation字段）
          const cameraKey = `${camera.type}-${camera.id}`;
          if (cameraRotations.get(cameraKey)) {
            config.rotation = 'ROTATE_180';
          }

          cameraConfig[cameraName] = config;
        });
        addLog(`使用 ${selectedCameras.length} 个相机: ${JSON.stringify(Object.values(cameraConfig))}`);
        requestData.cameras = cameraConfig;
      } else {
        requestData.enable_cameras = false;
        requestData.cameras = null;
      } 

      // 调用API
      const response = await fetch('/api/commands/teleoperate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (result.code === 0) {
        setCommandId(result.data.commandId);
        message.success('遥操已启动');
        addLog(`遥操已启动，命令ID: ${result.data.commandId}`);

        // 如果启用了数据显示，设置Rerun URL
        if (values.displayData && result.data.rerunUrl) {
          setRerunUrl(result.data.rerunUrl);
          addLog('Rerun可视化已启动');
        }
      } else {
        throw new Error(result.message || '启动失败');
      }
    } catch (error: any) {
      message.error(`启动失败: ${error.message}`);
      addLog(`启动失败: ${error.message}`);
      setIsRunning(false);
    }
  };

  // 停止遥操
  const handleStop = async () => {
    if (!commandId) return;

    try {
      addLog('正在停止遥操...');

      const response = await fetch('/api/commands/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });

      const result = await response.json();

      if (result.code === 0) {
        message.success('遥操已停止');
        addLog('遥操已停止');
        setIsRunning(false);
        setCommandId(null);
        setRerunUrl(null);
      } else {
        throw new Error(result.message || '停止失败');
      }
    } catch (error: any) {
      message.error(`停止失败: ${error.message}`);
      addLog(`停止失败: ${error.message}`);
    }
  };

  // 配置机器人端口
  const handleConfigureRobotPorts = () => {
    setRobotPortModalVisible(true);
  };

  // 配置遥操端口
  const handleConfigureTeleopPorts = () => {
    setTeleopPortModalVisible(true);
  };

  // 配置相机
  const handleConfigureCameras = () => {
    setCameraModalVisible(true);
  };

  // 机器人端口变化
  const handleRobotPortsChange = (ports: string[]) => {
    setSelectedRobotPorts(ports);
    addLog(`已选择机器人端口: ${ports.join(', ')}`);
  };

  // 遥操端口变化
  const handleTeleopPortsChange = (ports: string[]) => {
    setSelectedTeleopPorts(ports);
    addLog(`已选择遥操端口: ${ports.join(', ')}`);
  };

  // 相机变化
  const handleCamerasChange = (cameras: CameraInfo[]) => {
    setSelectedCameras(cameras);
    addLog(`已选择 ${cameras.length} 个相机`);

    // 初始化新相机的翻转状态为false
    const newRotations = new Map(cameraRotations);
    cameras.forEach(camera => {
      const cameraKey = `${camera.type}-${camera.id}`;
      if (!newRotations.has(cameraKey)) {
        newRotations.set(cameraKey, false);
      }
    });
    setCameraRotations(newRotations);
  };

  // 清除机器人端口
  const handleClearRobotPorts = () => {
    setSelectedRobotPorts([]);
    addLog('已清除机器人端口配置');
  };

  // 清除遥操端口
  const handleClearTeleopPorts = () => {
    setSelectedTeleopPorts([]);
    addLog('已清除遥操端口配置');
  };

  // 清除相机
  const handleClearCameras = () => {
    setSelectedCameras([]);
    setCameraRotations(new Map());
    addLog('已清除相机配置');
  };

  // 切换相机翻转状态
  const handleToggleCameraRotation = (camera: CameraInfo) => {
    const cameraKey = `${camera.type}-${camera.id}`;
    const newRotations = new Map(cameraRotations);
    newRotations.set(cameraKey, !newRotations.get(cameraKey));
    setCameraRotations(newRotations);

    const rotationStatus = newRotations.get(cameraKey) ? '已启用' : '已禁用';
    addLog(`${camera.name} 翻转功能${rotationStatus}`);
  };

  // 渲染相机列表（包含翻转选项）
  const renderCameraList = () => {
    if (selectedCameras.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未配置相机（可选）"
          style={{ margin: '12px 0' }}
        />
      );
    }

    return (
      <div style={{ marginTop: 8 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {selectedCameras.map((camera, index) => {
            const cameraKey = `${camera.type}-${camera.id}`;
            const isRotated = cameraRotations.get(cameraKey) || false;

            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag icon={<CameraOutlined />} color="blue">
                  {camera.name}
                </Tag>
                <Form.Item
                  style={{ margin: 0 }}
                  label={null}
                >
                  <Space>
                    <label style={{ fontSize: '13px', color: '#666' }}>
                      <input
                        type="checkbox"
                        checked={isRotated}
                        onChange={() => handleToggleCameraRotation(camera)}
                        disabled={isRunning}
                        style={{ marginRight: 4 }}
                      />
                      翻转180°
                    </label>
                  </Space>
                </Form.Item>
              </div>
            );
          })}
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleClearCameras}
            disabled={isRunning}
          >
            清除
          </Button>
        </Space>
      </div>
    );
  };

  // 渲染设备列表
  const renderDeviceList = (
    devices: string[],
    emptyText: string,
    onClear: () => void,
    icon: React.ReactNode
  ) => {
    if (devices.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyText}
          style={{ margin: '12px 0' }}
        />
      );
    }

    return (
      <div style={{ marginTop: 8 }}>
        <Space wrap>
          {devices.map((device, index) => (
            <Tag key={index} icon={icon} color="blue">
              {device}
            </Tag>
          ))}
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={onClear}
          >
            清除
          </Button>
        </Space>
      </div>
    );
  };

  return (
    <div className="teleoperate-container">
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          robotType: 'so101_follower',
          robotId: 'my_awesome_follower_arm',
          teleopType: 'so101_leader',
          teleopId: 'my_awesome_leader_arm',
          displayData: false,
          fps: 30,
        }}
      >
        <Card title="Robot（Follower）配置" style={{ marginBottom: 16 }}>
          <Form.Item
            label="机器人类型"
            name="robotType"
            rules={[{ required: true, message: '请选择机器人类型' }]}
          >
            <Select>
              <Select.Option value="so100_follower">so100_follower（单臂）</Select.Option>
              <Select.Option value="so101_follower">so101_follower（单臂）</Select.Option>
              <Select.Option value="bi_so100_follower">bi_so100_follower（双臂）</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="机器人端口">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<UsbOutlined />}
                onClick={handleConfigureRobotPorts}
                disabled={isRunning}
              >
                配置机器人端口
              </Button>
              {renderDeviceList(
                selectedRobotPorts,
                '未配置端口',
                handleClearRobotPorts,
                <UsbOutlined />
              )}
            </Space>
          </Form.Item>

          <Form.Item
            label="机器人ID"
            name="robotId"
            rules={[{ required: true, message: '请输入机器人ID' }]}
          >
            <Input placeholder="my_awesome_follower_arm" />
          </Form.Item>
        </Card>

        <Card title="Teleop（Leader）配置" style={{ marginBottom: 16 }}>
          <Form.Item
            label="遥操类型"
            name="teleopType"
            rules={[{ required: true, message: '请选择遥操类型' }]}
          >
            <Select>
              <Select.Option value="so100_leader">so100_leader（单臂）</Select.Option>
              <Select.Option value="so101_leader">so101_leader（单臂）</Select.Option>
              <Select.Option value="bi_so100_leader">bi_so100_leader（双臂）</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="遥操端口">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<UsbOutlined />}
                onClick={handleConfigureTeleopPorts}
                disabled={isRunning}
              >
                配置遥操端口
              </Button>
              {renderDeviceList(
                selectedTeleopPorts,
                '未配置端口',
                handleClearTeleopPorts,
                <UsbOutlined />
              )}
            </Space>
          </Form.Item>

          <Form.Item
            label="遥操ID"
            name="teleopId"
            rules={[{ required: true, message: '请输入遥操ID' }]}
          >
            <Input placeholder="my_awesome_leader_arm" />
          </Form.Item>
        </Card>

        <Card title="相机与显示选项" style={{ marginBottom: 16 }}>
          <Form.Item label="相机配置">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<CameraOutlined />}
                onClick={handleConfigureCameras}
                disabled={isRunning}
              >
                配置相机
              </Button>
              {renderCameraList()}
            </Space>
          </Form.Item>

          <Form.Item label="显示数据界面" name="displayData">
            <Select>
              <Select.Option value={false}>不显示</Select.Option>
              <Select.Option value={true}>显示（Rerun可视化）</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="FPS" name="fps">
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Divider />

        <Space>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={handleStart}
            disabled={isRunning}
            loading={isRunning}
          >
            开始遥操
          </Button>

          <Button
            danger
            size="large"
            icon={<StopOutlined />}
            onClick={handleStop}
            disabled={!isRunning}
          >
            停止遥操
          </Button>
        </Space>
      </Form>

      {/* Rerun可视化iframe */}
      {rerunUrl && (
        <Card title="数据可视化（Rerun）" style={{ marginTop: 16 }}>
          <div style={{ position: 'relative', width: '100%', height: '600px' }}>
            <Spin spinning={false} tip="加载Rerun可视化...">
              <iframe
                ref={iframeRef}
                // src={`https://rerun.io/viewer/version/0.26.2?url=${encodeURIComponent('rerun+http://127.0.0.1:9876/proxy')}`}
                src={`https://rerun.io/viewer/version/0.26.2?url=rerun%2Bhttp%3A%2F%2F127.0.0.1%3A9876%2Fproxy`}
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
          <div style={{ marginTop: 8, fontSize: '12px', color: '#8c8c8c' }}>
            提示：Rerun 可视化通过 WebSocket 连接到本地服务 (ws://127.0.0.1:9876)
          </div>
        </Card>
      )}

      {/* 机器人端口配置模态框 */}
      <Modal
        title={
          isBimanualRobot(form.getFieldValue('robotType'))
            ? '配置机器人端口（双臂 - 需要2个端口）'
            : '配置机器人端口（单臂 - 需要1个端口）'
        }
        open={robotPortModalVisible}
        onCancel={() => setRobotPortModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setRobotPortModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <PortFinder
          onPortsChange={handleRobotPortsChange}
          onLog={addLog}
          maxSelection={isBimanualRobot(form.getFieldValue('robotType')) ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 遥操端口配置模态框 */}
      <Modal
        title={
          isBimanualRobot(form.getFieldValue('teleopType'))
            ? '配置遥操端口（双臂 - 需要2个端口）'
            : '配置遥操端口（单臂 - 需要1个端口）'
        }
        open={teleopPortModalVisible}
        onCancel={() => setTeleopPortModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setTeleopPortModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <PortFinder
          onPortsChange={handleTeleopPortsChange}
          onLog={addLog}
          maxSelection={isBimanualRobot(form.getFieldValue('teleopType')) ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 相机配置模态框 */}
      <Modal
        title="配置相机"
        open={cameraModalVisible}
        onCancel={() => setCameraModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setCameraModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <CameraFinder onCamerasChange={handleCamerasChange} onLog={addLog} />
      </Modal>
    </div>
  );
}

export default Teleoperate;
