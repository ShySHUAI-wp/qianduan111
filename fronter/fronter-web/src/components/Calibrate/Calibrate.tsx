import { useState } from 'react';
import {
  Form,
  Select,
  Button,
  Input,
  Card,
  Modal,
  Table,
  message,
  Space,
  Tag,
  Empty,
} from 'antd';
import { UsbOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { calibrateApi } from '@/services/api';
import PortFinder from '@/components/PortFinder';
import './Calibrate.css';

const { Option } = Select;

// 机械臂类型（按产品/流程描述的 6 种类型呈现）
// 说明：为保持现有后端兼容，这里将“+底盘”暂时映射到同一套 arm_type；
// 后端扩展支持底盘后，只需在此处替换 value 即可。
const ARM_TYPES = [
  { value: 'so101_leader', label: '单臂（示教臂）', isDual: false },
  { value: 'bi_so100_leader', label: '双臂（示教臂）', isDual: true },
  { value: 'bi_so100_leader', label: '双臂+底盘（示教臂）', isDual: true },
  { value: 'so101_follower', label: '单臂（操作臂）', isDual: false },
  { value: 'bi_so100_follower', label: '双臂（操作臂）', isDual: true },
  { value: 'bi_so100_follower', label: '双臂+底盘（操作臂）', isDual: true },
];

// 校准步骤枚举
enum CalibrationStep {
  IDLE = 'idle',
  CHECK_CONFIG = 'check_config',
  SET_MIDDLE = 'set_middle',
  RECORD_RANGE = 'record_range',
  COMPLETED = 'completed',
}

interface CalibrateProps {
  onLog?: (message: string) => void;
}

function Calibrate({ onLog }: CalibrateProps) {
  const [form] = Form.useForm();
  const [selectedArmType, setSelectedArmType] = useState<string>('');
  const [isDualArm, setIsDualArm] = useState(false);
  const [loading, setLoading] = useState(false);

  // 端口配置状态
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);

  // 校准会话状态
  const [sessionId, setSessionId] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<CalibrationStep>(CalibrationStep.IDLE);
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [stepModalTitle, setStepModalTitle] = useState('');
  const [stepModalContent, setStepModalContent] = useState<React.ReactNode>(null);

  // 记录状态
  const [recordingData, setRecordingData] = useState<
    Array<{ motor: string; min: number; current: number; max: number }>
  >([]);
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[Calibrate]', msg);
    onLog?.(msg);
  };

  // 处理机械臂类型变化
  const handleArmTypeChange = (value: string) => {
    setSelectedArmType(value);
    const armConfig = ARM_TYPES.find((t) => t.value === value);
    setIsDualArm(armConfig?.isDual || false);

    // 清空端口选择
    setSelectedPorts([]);
  };

  // 配置端口
  const handleConfigurePorts = () => {
    setPortModalVisible(true);
  };

  // 端口变化
  const handlePortsChange = (ports: string[]) => {
    setSelectedPorts(ports);
    addLog(`已选择端口: ${ports.join(', ')}`);
  };

  // 清除端口
  const handleClearPorts = () => {
    setSelectedPorts([]);
    addLog('已清除端口配置');
  };

  // 渲染端口列表
  const renderPortList = () => {
    if (selectedPorts.length === 0) {
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
          {selectedPorts.map((port, index) => (
            <Tag key={index} icon={<UsbOutlined />} color="blue">
              {port}
            </Tag>
          ))}
          <Button
            type="link"
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={handleClearPorts}
          >
            清除
          </Button>
        </Space>
      </div>
    );
  };

  // 开始校准流程
  const handleStartCalibration = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();

      if (!values.arm_type || !values.arm_id) {
        message.error('请填写完整信息');
        return;
      }

      // 检查端口配置
      if (isDualArm) {
        if (selectedPorts.length < 2) {
          message.error('双臂机械臂需要配置2个端口（左臂和右臂）');
          return;
        }
      } else {
        if (selectedPorts.length < 1) {
          message.error('单臂机械臂需要配置1个端口');
          return;
        }
      }

      setLoading(true);
      addLog(`开始校准流程: ${values.arm_type} - ${values.arm_id}`);

      // 构建请求参数
      const requestParams: any = {
        arm_type: values.arm_type,
        arm_id: values.arm_id,
      };

      if (isDualArm) {
        requestParams.left_arm_port = selectedPorts[0];
        requestParams.right_arm_port = selectedPorts[1];
      } else {
        requestParams.port = selectedPorts[0];
      }

      // 检查是否存在配置文件
      const checkResult = await calibrateApi.checkConfig(requestParams);
      if (checkResult.data.code === 0 && checkResult.data.data) {
        const { exists, path } = checkResult.data.data;

        if (exists) {
          // 存在配置文件，询问用户
          setCurrentStep(CalibrationStep.CHECK_CONFIG);
          showConfigExistsModal(path);
        } else {
          // 不存在配置文件，直接开始新校准
          await startNewCalibration(requestParams);
        }
      }
    } catch (error: any) {
      console.error('启动校准失败:', error);
      message.error(error.response?.data?.message || '启动校准失败');
    } finally {
      setLoading(false);
    }
  };

  // 显示配置文件存在提示
  const showConfigExistsModal = (configPath: string) => {
    setStepModalTitle('检测到已有配置文件');
    setStepModalContent(
      <div>
        <p>检测到以下路径存在校准配置文件：</p>
        <p style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '8px' }}>
          {configPath}
        </p>
        <p>您是否要使用此配置文件？</p>
        <p style={{ color: '#888', fontSize: '12px' }}>
          选择"使用现有配置"将直接应用该文件，选择"重新校准"将创建新的校准数据。
        </p>
      </div>
    );
    setStepModalVisible(true);
  };

  // 使用现有配置
  const handleUseExistingConfig = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();

      // 构建请求参数
      const requestParams: any = {
        arm_type: values.arm_type,
        arm_id: values.arm_id,
      };

      if (isDualArm) {
        requestParams.left_arm_port = selectedPorts[0];
        requestParams.right_arm_port = selectedPorts[1];
      } else {
        requestParams.port = selectedPorts[0];
      }

      // 启动会话
      const startResult = await calibrateApi.start(requestParams);
      if (startResult.data.code !== 0 || !startResult.data.data) {
        throw new Error(startResult.data.message);
      }

      const newSessionId = startResult.data.data.session_id;
      setSessionId(newSessionId);
      addLog(`会话已创建: ${newSessionId}`);

      // 使用现有配置
      const useResult = await calibrateApi.useExisting(newSessionId);
      if (useResult.data.code === 0 && useResult.data.data) {
        addLog(`${useResult.data.data.message}`);
        message.success('成功应用现有校准配置');
        setStepModalVisible(false);
        setCurrentStep(CalibrationStep.COMPLETED);
        showCompletedModal();
      } else {
        throw new Error(useResult.data.message);
      }
    } catch (error: any) {
      console.error('使用现有配置失败:', error);
      message.error(error.response?.data?.message || '使用现有配置失败');
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  // 开始新校准
  const startNewCalibration = async (params: any) => {
    try {
      setLoading(true);

      // 启动校准会话
      const startResult = await calibrateApi.start(params);
      if (startResult.data.code !== 0 || !startResult.data.data) {
        throw new Error(startResult.data.message);
      }

      const newSessionId = startResult.data.data.session_id;
      setSessionId(newSessionId);
      addLog(`会话已创建: ${newSessionId}`);
      addLog(`设备已连接`);

      setStepModalVisible(false);
      setCurrentStep(CalibrationStep.SET_MIDDLE);

      // 显示设置中间位置的引导
      showSetMiddleModal();
    } catch (error: any) {
      console.error('启动新校准失败:', error);
      message.error(error.response?.data?.message || '启动新校准失败');
      setCurrentStep(CalibrationStep.IDLE);
    } finally {
      setLoading(false);
    }
  };

  // 显示设置中间位置引导
  const showSetMiddleModal = () => {
    setStepModalTitle('步骤 1: 设置中间位置');
    setStepModalContent(
      <div>
        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
          请手动将机械臂移动到行程中间位置
        </p>
        <div style={{ marginTop: '16px' }}>
          <p>操作要求：</p>
          <ul style={{ paddingLeft: '20px' }}>
            <li>将所有关节移动到其可活动角度的<strong>中间位置</strong></li>
            <li>确保每个关节都处于中间位置，不要偏向任何一侧</li>
            <li>目视检查各关节位置是否合理</li>
          </ul>
        </div>
        <div style={{ marginTop: '16px', padding: '12px', background: '#fff7e6', borderRadius: '4px' }}>
          <p style={{ margin: 0, color: '#d46b08' }}>
            注意：此步骤非常重要，中间位置设置不准确会影响后续校准结果
          </p>
        </div>
        <p style={{ marginTop: '16px' }}>完成后点击"确定"继续</p>
      </div>
    );
    setStepModalVisible(true);
  };

  // 设置中间位置
  const handleSetMiddle = async () => {
    try {
      setLoading(true);
      addLog(`正在设置中间位置... (Session: ${sessionId})`);

      const result = await calibrateApi.setMiddle(sessionId);
      console.log('[handleSetMiddle] API response:', result.data);

      if (result.data.code === 0) {
        const backendStep = (result.data.data as any)?.step || 'middle_set';
        addLog(`中间位置已设置 (后端步骤: ${backendStep})`);
        console.log(`[handleSetMiddle] Backend step is now: ${backendStep}, sessionId: ${sessionId}`);

        setStepModalVisible(false);
        setCurrentStep(CalibrationStep.RECORD_RANGE);

        // 显示记录运动范围引导
        showRecordRangeModal();
      } else {
        throw new Error(result.data.message);
      }
    } catch (error: any) {
      console.error('设置中间位置失败:', error);
      const errorMsg = error.response?.data?.message || '设置中间位置失败';
      message.error(errorMsg);
      addLog(`错误: ${errorMsg}`);
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  // 显示记录运动范围引导（但不实际开始记录，等用户点击"开始记录"按钮）
  const showRecordRangeModal = () => {
    setStepModalTitle('步骤 2: 记录运动范围');
    setStepModalContent(
      <div>
        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
          准备记录关节运动范围
        </p>
        <div style={{ marginTop: '16px' }}>
          <p>操作要求：</p>
          <ul style={{ paddingLeft: '20px' }}>
            <li>
              点击"开始记录"后，依次移动<strong>每个关节</strong>到其物理行程的最大角度
            </li>
            <li>
              再依次移动<strong>每个关节</strong>到其物理行程的最小角度
            </li>
            <li>确保所有关节都完整移动过</li>
            <li>完成后点击"完成记录"按钮</li>
          </ul>
        </div>
        <div style={{ marginTop: '16px', padding: '12px', background: '#fff7e6', borderRadius: '4px' }}>
          <p style={{ margin: 0, color: '#d46b08' }}>
            注意：必须移动所有关节到极限位置，否则会报错
          </p>
        </div>
        <p style={{ marginTop: '16px', color: '#666' }}>
          点击"开始记录"按钮后，将显示实时数据表格
        </p>
      </div>
    );
    setStepModalVisible(true);
  };

  // 开始记录运动范围
  const handleStartRecording = async () => {
    try {
      setLoading(true);
      console.log(`[handleStartRecording] Called with sessionId: ${sessionId}, currentStep: ${currentStep}`);
      addLog(`开始记录运动范围... (Session: ${sessionId})`);

      const result = await calibrateApi.startRecording(sessionId);
      console.log('[handleStartRecording] API response:', result.data);

      if (result.data.code === 0) {
        addLog(`正在记录，请移动机械臂...`);

        // 初始化记录数据为空数组
        setRecordingData([]);

        // 显示记录modal
        setStepModalTitle('正在记录运动范围');
        setStepModalVisible(true);

        // 启动轮询获取记录状态
        const interval = setInterval(async () => {
          try {
            const statusResult = await calibrateApi.getRecordingStatus(sessionId);
            if (statusResult.data.code === 0 && statusResult.data.data?.positions) {
              setRecordingData(statusResult.data.data.positions);
            }
          } catch (error) {
            console.error('获取记录状态失败:', error);
          }
        }, 100); // 每100ms更新一次

        setRecordingInterval(interval);
      } else {
        throw new Error(result.data.message);
      }
    } catch (error: any) {
      console.error('开始记录失败:', error);
      console.error('Error details:', error.response?.data);
      const errorMsg = error.response?.data?.message || '开始记录失败';
      message.error(errorMsg);
      addLog(`错误: ${errorMsg}`);
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  // 渲染记录中的表格内容
  const renderRecordingContent = () => {
    return (
      <div>
        <p style={{ fontSize: '14px', color: '#1890ff', marginBottom: '16px' }}>
          正在实时记录各关节位置，请移动机械臂到最大和最小角度
        </p>

        {recordingData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            正在获取关节数据...
          </div>
        ) : (
          <Table
            dataSource={recordingData}
            columns={[
              { title: '关节', dataIndex: 'motor', key: 'motor', width: 120 },
              { title: '最小值', dataIndex: 'min', key: 'min', width: 100 },
              { title: '当前值', dataIndex: 'current', key: 'current', width: 100 },
              { title: '最大值', dataIndex: 'max', key: 'max', width: 100 },
            ]}
            pagination={false}
            size="small"
            rowKey="motor"
            style={{ marginBottom: '16px' }}
          />
        )}

        <div style={{ padding: '12px', background: '#f0f5ff', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#1890ff' }}>
            提示：确保每个关节的 MIN 和 MAX 值都有明显变化，说明已移动到极限位置
          </p>
        </div>

        <p style={{ marginTop: '16px' }}>完成所有关节移动后，点击"完成记录"</p>
      </div>
    );
  };

  // 停止记录
  const handleStopRecording = async () => {
    try {
      // 清除轮询
      if (recordingInterval) {
        clearInterval(recordingInterval);
        setRecordingInterval(null);
      }

      setLoading(true);
      addLog(`停止记录...`);

      const result = await calibrateApi.stopRecording(sessionId);
      if (result.data.code === 0) {
        addLog(`记录完成并验证通过`);
        setStepModalVisible(false);

        // 保存校准
        await handleSaveCalibration();
      } else {
        throw new Error(result.data.message);
      }
    } catch (error: any) {
      console.error('停止记录失败:', error);
      const errorMsg = error.response?.data?.message || '停止记录失败';
      message.error(errorMsg);
      addLog(`错误: ${errorMsg}`);

      // 清除轮询
      if (recordingInterval) {
        clearInterval(recordingInterval);
        setRecordingInterval(null);
      }

      setStepModalVisible(false);
      setCurrentStep(CalibrationStep.IDLE);
      setSessionId('');
    } finally {
      setLoading(false);
    }
  };

  // 保存校准
  const handleSaveCalibration = async () => {
    try {
      setLoading(true);
      addLog(`正在保存校准配置...`);

      const result = await calibrateApi.save(sessionId);
      if (result.data.code === 0 && result.data.data) {
        addLog(`${result.data.data.message}`);
        addLog(`配置文件: ${result.data.data.config_path}`);
        setCurrentStep(CalibrationStep.COMPLETED);
        showCompletedModal();
      } else {
        throw new Error(result.data.message);
      }
    } catch (error: any) {
      console.error('保存校准失败:', error);
      const errorMsg = error.response?.data?.message || '保存校准失败';
      message.error(errorMsg);
      addLog(`错误: ${errorMsg}`);
      setCurrentStep(CalibrationStep.IDLE);
      setSessionId('');
    } finally {
      setLoading(false);
    }
  };

  // 显示完成提示
  const showCompletedModal = () => {
    Modal.success({
      title: '校准完成',
      content: (
        <div>
          <p style={{ fontSize: '16px', color: '#52c41a' }}>机械臂校准已成功完成！</p>
          <p>校准配置已保存，您现在可以使用此机械臂进行遥操或数据采集。</p>
        </div>
      ),
      onOk: () => {
        setCurrentStep(CalibrationStep.IDLE);
        setSessionId('');
        setRecordingData([]);
      },
    });
  };

  // 取消校准
  const handleCancelCalibration = async () => {
    // 清除轮询
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }

    if (sessionId) {
      try {
        await calibrateApi.cancel(sessionId);
        addLog(`校准已安全取消`);
        message.info('校准已安全取消');
      } catch (error) {
        console.error('取消校准失败:', error);
      }
    }

    setStepModalVisible(false);
    setCurrentStep(CalibrationStep.IDLE);
    setSessionId('');
    setRecordingData([]);
  };

  // 处理模态框确定按钮
  const handleModalOk = () => {
    switch (currentStep) {
      case CalibrationStep.CHECK_CONFIG:
        // 重新校准
        const values = form.getFieldsValue();
        const requestParams: any = {
          arm_type: values.arm_type,
          arm_id: values.arm_id,
        };
        if (isDualArm) {
          requestParams.left_arm_port = selectedPorts[0];
          requestParams.right_arm_port = selectedPorts[1];
        } else {
          requestParams.port = selectedPorts[0];
        }
        setStepModalVisible(false);
        startNewCalibration(requestParams);
        break;

      case CalibrationStep.SET_MIDDLE:
        handleSetMiddle();
        break;

      case CalibrationStep.RECORD_RANGE:
        // 根据是否正在记录来决定调用哪个函数
        if (recordingInterval) {
          // 正在记录中 -> 完成记录
          handleStopRecording();
        } else {
          // 未开始记录 -> 开始记录
          handleStartRecording();
        }
        break;

      default:
        setStepModalVisible(false);
    }
  };

  // 处理模态框取消按钮
  const handleModalCancel = () => {
    if (currentStep === CalibrationStep.CHECK_CONFIG) {
      // 在配置检查阶段，取消按钮表示使用现有配置
      handleUseExistingConfig();
    } else {
      // 其他阶段都是取消校准
      handleCancelCalibration();
    }
  };

  return (
    <div className="calibrate-container">
      <Card title="机械臂校准">
        <Form form={form} layout="vertical">
          <Form.Item
            label="机械臂类型"
            name="arm_type"
            rules={[{ required: true, message: '请选择机械臂类型' }]}
          >
            <Select
              placeholder="请选择机械臂类型"
              onChange={handleArmTypeChange}
              disabled={currentStep !== CalibrationStep.IDLE}
            >
              {ARM_TYPES.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedArmType && (
            <Form.Item label={isDualArm ? '机械臂端口（双臂 - 需要2个端口）' : '机械臂端口'}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  icon={<UsbOutlined />}
                  onClick={handleConfigurePorts}
                  disabled={currentStep !== CalibrationStep.IDLE}
                >
                  配置端口
                </Button>
                {renderPortList()}
              </Space>
            </Form.Item>
          )}

          {selectedArmType && (
            <Form.Item
              label="机械臂名称"
              name="arm_id"
              rules={[{ required: true, message: '请输入机械臂名称' }]}
            >
              <Input
                placeholder="例如: my_awesome_arm"
                disabled={currentStep !== CalibrationStep.IDLE}
              />
            </Form.Item>
          )}

          <Form.Item>
            <Button
              type="primary"
              onClick={handleStartCalibration}
              loading={loading}
              disabled={!selectedArmType || currentStep !== CalibrationStep.IDLE}
              size="large"
              block
            >
              开始校准
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 端口配置模态框 */}
      <Modal
        title={
          isDualArm
            ? '配置机械臂端口（双臂 - 需要2个端口）'
            : '配置机械臂端口（单臂 - 需要1个端口）'
        }
        open={portModalVisible}
        onCancel={() => setPortModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setPortModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <PortFinder
          onPortsChange={handlePortsChange}
          onLog={addLog}
          maxSelection={isDualArm ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 步骤引导模态框 */}
      <Modal
        title={stepModalTitle}
        open={stepModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText={
          currentStep === CalibrationStep.CHECK_CONFIG
            ? '重新校准'
            : currentStep === CalibrationStep.RECORD_RANGE && recordingInterval
            ? '完成记录'
            : currentStep === CalibrationStep.RECORD_RANGE && !recordingInterval
            ? '开始记录'
            : '确定'
        }
        cancelText={currentStep === CalibrationStep.CHECK_CONFIG ? '使用现有配置' : '取消'}
        confirmLoading={loading}
        width={600}
        maskClosable={false}
        keyboard={false}
      >
        {/* 根据当前步骤动态渲染内容 */}
        {currentStep === CalibrationStep.RECORD_RANGE && recordingInterval
          ? renderRecordingContent()
          : stepModalContent}
      </Modal>
    </div>
  );
}

export default Calibrate;
