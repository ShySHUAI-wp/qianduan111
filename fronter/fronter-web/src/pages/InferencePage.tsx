import { useState, useMemo } from 'react';
import {
  Typography,
  Card,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
  Switch,
  Modal,
  Tag,
  Empty,
} from 'antd';
import {
  PlayCircleOutlined,
  UsbOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  ClearOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import PortFinder from '@/components/PortFinder';
import './DataCollectionPage.css';

const { Option } = Select;
const { Text, Paragraph } = Typography;

// 机器臂类型选项（复用Calibrate的配置）
const ARM_TYPES = [
  { value: 'so101_follower', label: '单臂（操作臂）', isDual: false },
  { value: 'bi_so100_follower', label: '双臂（操作臂）', isDual: true },
  { value: 'bi_so100_follower', label: '双臂+底盘（操作臂）', isDual: true },
];

interface InferenceFormValues {
  robotType: string;
  robotId: string;
  modelPath: string;
  datasetName: string;
  displayData: boolean;
  datasetSingleTask: string;
  datasetFps: number;
  datasetNumEpisodes: number;
  datasetEpisodeTimeS: number;
  datasetResetTimeS: number;
}

// 日志面板样式
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

function InferencePage() {
  const [form] = Form.useForm<InferenceFormValues>();
  const [logs, setLogs] = useState<string[]>([]);

  // 操作臂端口配置状态
  const [robotPortModalVisible, setRobotPortModalVisible] = useState(false);
  const [selectedRobotPorts, setSelectedRobotPorts] = useState<string[]>([]);
  const [isRobotDual, setIsRobotDual] = useState(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 处理机器臂类型变化
  const handleRobotTypeChange = (value: string) => {
    const armConfig = ARM_TYPES.find((t) => t.value === value);
    setIsRobotDual(armConfig?.isDual || false);
    setSelectedRobotPorts([]);
  };

  // 配置操作臂端口
  const handleConfigureRobotPorts = () => {
    setRobotPortModalVisible(true);
  };

  // 处理端口变化
  const handleRobotPortsChange = (ports: string[]) => {
    setSelectedRobotPorts(ports);
    addLog(`已选择操作臂端口: ${ports.join(', ')}`);
  };

  // 清除端口
  const handleClearRobotPorts = () => {
    setSelectedRobotPorts([]);
    addLog('已清除操作臂端口配置');
  };

  // 渲染端口列表
  const renderPortList = () => {
    if (selectedRobotPorts.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未配置端口"
          style={{ margin: '12px 0' }}
        />
      );
    }
    return (
      <div style={{ marginTop: 8 }}>
        <Space wrap>
          {selectedRobotPorts.map((port, index) => (
            <Tag key={index} icon={<UsbOutlined />} color="blue">
              {port}
            </Tag>
          ))}
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleClearRobotPorts}
          >
            清除
          </Button>
        </Space>
      </div>
    );
  };

  const handleStartInference = () => {
    addLog('开始推理（等待后端接口返回）');
  };

  // 日志面板
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
            <div style={{ color: '#888' }}>这是终端控制台</div>
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
    [logs]
  );

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
          模型推理
        </Typography.Title>
        <Space>
          <Text type="secondary">说明：查找端口逻辑，同上</Text>
        </Space>
      </div>

      <Row gutter={16} align="top">
        {/* 左侧表单区域 */}
        <Col xs={24} xl={15}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              robotType: 'so101_follower',
              datasetName: 'my_dataset',
              datasetFps: 30,
              datasetNumEpisodes: 30,
              datasetEpisodeTimeS: 30,
              datasetResetTimeS: 20,
              displayData: false,
              datasetSingleTask: 'Grab a block',
            }}
          >
            {/* 模块大标题 */}
            <Card className="config-card" title="机器人（操作臂）配置" style={{ marginBottom: 16 }}>
              {/* 机器臂类型 */}
              <Form.Item
                label="机器臂类型"
                name="robotType"
                rules={[{ required: true, message: '请选择机器臂类型' }]}
              >
                <Select
                  placeholder="请选择机器臂类型"
                  onChange={handleRobotTypeChange}
                >
                  {ARM_TYPES.map((type) => (
                    <Option key={type.value} value={type.value}>
                      {type.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {/* 操作臂端口 */}
              <Form.Item label={isRobotDual ? '操作臂端口（双臂 - 需要2个端口）' : '操作臂端口'}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<UsbOutlined />}
                    onClick={handleConfigureRobotPorts}
                  >
                    配置端口
                  </Button>
                  {renderPortList()}
                </Space>
              </Form.Item>

              {/* 机械臂名称 */}
              <Form.Item
                label="机械臂名称"
                name="robotId"
                rules={[{ required: true, message: '请输入机械臂名称' }]}
              >
                <Input placeholder="请输入机械臂名称" />
              </Form.Item>
            </Card>

            {/* 数据集配置 */}
            <Card className="config-card" title="模型与数据集配置" style={{ marginBottom: 16 }}>
              {/* 模型路径 */}
              <Form.Item
                label="模型路径"
                name="modelPath"
                rules={[{ required: true, message: '请选择或输入模型路径' }]}
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="请输入模型路径" />
                  <Button type="primary" icon={<FolderOpenOutlined />}>
                    浏览文件
                  </Button>
                </Space.Compact>
              </Form.Item>

              {/* 数据集名称 */}
              <Form.Item
                label="数据集名称"
                name="datasetName"
                rules={[{ required: true, message: '请输入数据集名称' }]}
              >
                <Input placeholder="请输入" />
              </Form.Item>
              <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0, marginBottom: 16 }}>
                格式示例: my_dataset (将存储到 ~/.cache/huggingface/lerobot/my_dataset/my_dataset_000001)
                需要在数据集名称前，加一个 eval_ 的前缀
              </Paragraph>

              {/* 任务描述 */}
              <Form.Item
                label="任务描述"
                name="datasetSingleTask"
                rules={[{ required: true, message: '请输入任务描述' }]}
              >
                <Input.TextArea placeholder="请输入任务描述" rows={3} />
              </Form.Item>

              {/* 帧率、采集轮数 */}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="帧率(FPS)" name="datasetFps" style={{ marginBottom: 16 }}>
                    <InputNumber min={1} max={120} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="采集轮数" name="datasetNumEpisodes" style={{ marginBottom: 16 }}>
                    <InputNumber min={1} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              {/* 每轮录制时长、重置时长 */}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="每轮录制时长(秒)" name="datasetEpisodeTimeS" style={{ marginBottom: 16 }}>
                    <InputNumber min={1} max={300} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="重置时长(秒)" name="datasetResetTimeS" style={{ marginBottom: 16 }}>
                    <InputNumber min={1} max={300} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              {/* 数据可视化 */}
              <Form.Item label="数据可视化" name="displayData" valuePropName="checked">
                <Switch checkedChildren="显示" />
              </Form.Item>
            </Card>

            {/* 底部按钮 */}
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleStartInference}
                style={{ minWidth: 200 }}
              >
                开始推理
              </Button>
            </div>
          </Form>
        </Col>

        {/* 右侧日志区域 */}
        <Col xs={24} xl={9}>
          {logPanel}
        </Col>
      </Row>

      {/* 操作臂端口配置模态框 */}
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
    </div>
  );
}

export default InferencePage;
