import { useEffect, useState, useMemo } from 'react';
import { Button, Form, Input, Modal, Select, Steps, Tag, message } from 'antd';
import {
  CheckCircleOutlined, PlayCircleOutlined, StopOutlined, UsbOutlined,
  CopyOutlined, ClearOutlined, RobotOutlined,
} from '@ant-design/icons';
import { calibrateApi, systemApi, portApi } from '@/services/api';
import LogViewer from '@/components/LogViewer';
import PortFinder from '@/components/PortFinder';
import type { PortInfo } from '@/types';

// 机械臂类型选项 - 前端通用类型
const ARM_TYPES = [
  { label: '单臂（示教臂）', value: 'single_leader', isDual: false },
  { label: '双臂（示教臂）', value: 'dual_leader', isDual: true },
  { label: '双臂+底盘（示教臂）', value: 'dual_chassis_leader', isDual: true },
  { label: '单臂（操作臂）', value: 'single_follower', isDual: false },
  { label: '双臂（操作臂）', value: 'dual_follower', isDual: true },
  { label: '双臂+底盘（操作臂）', value: 'dual_chassis_follower', isDual: true },
];

// 前端类型到后端API类型的映射
const ARM_TYPE_MAPPING: Record<string, string> = {
  'single_leader': 'so101_leader',
  'dual_leader': 'bi_so100_leader',
  'dual_chassis_leader': 'bi_so100_leader', // 双臂+底盘暂用bi_so100_leader
  'single_follower': 'so101_follower',
  'dual_follower': 'bi_so100_follower',
  'dual_chassis_follower': 'bi_so100_follower', // 双臂+底盘暂用bi_so100_follower
};

// 校准步骤枚举
enum CalibStep {
  IDLE = 'idle',
  SET_MIDDLE = 'set_middle',
  RECORD_RANGE = 'record_range',
  COMPLETED = 'completed',
}

const WIZARD_STEPS = [
  { title: '配置信息' },
  { title: '中间位置' },
  { title: '运动范围' },
  { title: '完成' },
];

const stepIndexMap: Record<CalibStep, number> = {
  [CalibStep.IDLE]: 0,
  [CalibStep.SET_MIDDLE]: 1,
  [CalibStep.RECORD_RANGE]: 2,
  [CalibStep.COMPLETED]: 3,
};

type RecordRow = { motor: string; min: number; current: number; max: number };
type ConnectionStatus = '未连接' | '成功';
type CalibrationStatus = '待开始' | '校准中' | '校准完成';

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: '#f5f7fa',
    fontFamily: "'Segoe UI','Helvetica Neue','Arial',sans-serif",
    margin: '-24px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #e8ecf1',
    background: '#fff',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  stepsWrap: {
    padding: '16px 24px',
    background: '#fff',
    borderBottom: '1px solid #e8ecf1',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    overflow: 'auto',
    background: '#fff',
    margin: '16px',
    marginRight: 0,
    borderRadius: 8,
  },
  logPanel: {
    width: '400px',
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    margin: '16px',
    borderRadius: 8,
    overflow: 'hidden',
  },
  section: {
    marginBottom: '24px',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    marginBottom: '8px',
    display: 'block',
  },
  formItem: {
    marginBottom: '16px',
  },
  portRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  buttonPrimary: {
    height: 44,
    fontWeight: 600,
    fontSize: 15,
    borderRadius: 6,
  },
  buttonSecondary: {
    height: 36,
    borderRadius: 6,
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
    overflow: 'auto',
    background: '#1e1e1e',
    padding: '12px',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: '13px',
    color: '#d4d4d4',
  },
};

function CalibrationPage() {
  const [form] = Form.useForm();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('未连接');
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>('待开始');
  const [isDualArm, setIsDualArm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>('');

  // 端口配置相关状态
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);

  const [sessionId, setSessionId] = useState('');
  const [currentStep, setCurrentStep] = useState<CalibStep>(CalibStep.IDLE);
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [stepModalTitle, setStepModalTitle] = useState('');
  const [stepModalContent, setStepModalContent] = useState<React.ReactNode>(null);
  const [recordingData, setRecordingData] = useState<RecordRow[]>([]);
  const [recordingInterval, setRecordingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${t}] ${msg}`]);
  };

  // 检查后端连接状态
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await systemApi.health();
        setConnectionStatus('成功');
        addLog('后端连接成功');
      } catch {
        setConnectionStatus('未连接');
        addLog('后端未连接');
      }
    };
    checkConnection();
  }, []);

  const handleArmTypeChange = (value: string) => {
    const found = ARM_TYPES.find((t) => t.value === value);
    setIsDualArm(found?.isDual || false);
    setSelectedPort('');
    setSelectedPorts([]);
    form.setFieldValue('arm_type', value);
    form.setFieldValue('port', '');
  };

  // 端口变化
  const handlePortsChange = (ports: string[]) => {
    setSelectedPorts(ports);
    if (ports.length > 0) {
      setSelectedPort(ports[0]);
      addLog(`已选择端口: ${ports.join(', ')}`);
    }
  };

  // 打开端口配置弹窗
  const handleOpenPortModal = () => {
    setPortModalVisible(true);
    addLog(' 打开端口配置');
  };

  const isFormComplete = useMemo(() => {
    const values = form.getFieldsValue();
    return values.arm_type && values.arm_id && selectedPort;
  }, [form, selectedPort]);

  const buildParams = () => {
    const v = form.getFieldsValue();
    const apiArmType = ARM_TYPE_MAPPING[v.arm_type] || v.arm_type;
    return {
      arm_type: apiArmType,
      arm_id: v.arm_id,
      port: selectedPort,
    };
  };

  const handleStartCalibration = async () => {
    try {
      await form.validateFields();
      const v = form.getFieldsValue();
      if (!v.arm_type || !v.arm_id) {
        message.error('请填写完整信息');
        return;
      }
      if (!selectedPort) {
        message.error('请配置端口');
        return;
      }
      setLoading(true);
      addLog(`开始校准: ${v.arm_type} — ${v.arm_id}`);

      const params = buildParams();
      const res = await calibrateApi.checkConfig(params);

      if (res.data.code === 0 && res.data.data) {
        const { exists, path } = res.data.data;
        if (exists) {
          // 存在配置文件，询问是重新校准还是使用现有
          Modal.confirm({
            title: '检测到已有配置文件',
            content: (
              <div>
                <p style={{ color: '#595959' }}>检测到以下路径存在校准配置：</p>
                <pre style={{ background: '#f9fafb', padding: 10, borderRadius: 4, fontSize: 12, overflow: 'auto', color: '#1890ff' }}>
                  {path}
                </pre>
                <p style={{ color: '#8c95a0', marginTop: 8, fontSize: 13 }}>
                  选择「重新校准」将覆盖；选择「使用现有配置」将直接应用。
                </p>
              </div>
            ),
            okText: '重新校准',
            cancelText: '使用现有配置',
            onOk: () => void startNewCalibration(params),
            onCancel: () => void useExistingConfig(),
          });
        } else {
          await startNewCalibration(params);
        }
      }
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '启动校准失败');
    } finally {
      setLoading(false);
    }
  };

  const startNewCalibration = async (params: { arm_type: string; arm_id: string; port: string }) => {
    try {
      setLoading(true);
      const startRes = await calibrateApi.start(params);
      if (startRes.data.code !== 0 || !startRes.data.data) {
        throw new Error(startRes.data.message);
      }
      const sid = startRes.data.data.session_id;
      setSessionId(sid);
      addLog(`会话: ${sid}`);
      addLog('设备已连接');
      setCalibrationStatus('校准中');
      setCurrentStep(CalibStep.SET_MIDDLE);
      showSetMiddleModal();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '启动新校准失败');
      setCurrentStep(CalibStep.IDLE);
      setCalibrationStatus('待开始');
    } finally {
      setLoading(false);
    }
  };

  const useExistingConfig = async () => {
    try {
      setLoading(true);
      const startRes = await calibrateApi.start(buildParams());
      if (startRes.data.code !== 0 || !startRes.data.data) {
        throw new Error(startRes.data.message);
      }
      const sid = startRes.data.data.session_id;
      setSessionId(sid);
      const useRes = await calibrateApi.useExisting(sid);
      if (useRes.data.code === 0 && useRes.data.data) {
        addLog(useRes.data.data.message);
        message.success('成功应用现有校准配置');
        setCurrentStep(CalibStep.COMPLETED);
        setCalibrationStatus('校准完成');
        showCompletedModal();
      } else {
        throw new Error(useRes.data.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '使用现有配置失败');
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  const showSetMiddleModal = () => {
    setStepModalTitle('设置中间位置');
    setStepModalContent(
      <div>
        <p style={{ fontSize: 15, color: '#333', marginBottom: 16 }}>
          您需要将机器人移动到所有关节都位于其活动范围中间的位置。
        </p>
        <p style={{ fontSize: 15, color: '#333', marginBottom: 16 }}>
          然后，按下确认键后，您必须将每个关节在其完整的运动范围内移动。
        </p>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleSetMiddle = async () => {
    try {
      setLoading(true);
      addLog('正在设置中间位置...');
      const res = await calibrateApi.setMiddle(sessionId);
      if (res.data.code === 0) {
        addLog('中间位置已设置');
        setStepModalVisible(false);
        setCurrentStep(CalibStep.RECORD_RANGE);
        showRecordRangeModal();
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '设置中间位置失败');
      addLog('设置中间位置失败');
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  const showRecordRangeModal = () => {
    setStepModalTitle('正在实时记录各关节位置，请移动机械臂到最大和最小角度');
    setStepModalContent('record_range');
    setStepModalVisible(true);
  };

  const handleStartRecording = async () => {
    try {
      setLoading(true);
      addLog('开始记录运动范围...');
      const res = await calibrateApi.startRecording(sessionId);
      if (res.data.code === 0) {
        addLog('正在记录，请移动机械臂...');
        setRecordingData([]);

        const fixedMotors = [
          'left_shoulder_pan',
          'left_shoulder_lift',
          'left_shoulder_rotate',
          'left_elbow_flex',
          'left_wrist_flex',
          'left_wrist_roll',
          'left_gripper',
        ];

        const initialData: RecordRow[] = fixedMotors.map((motor) => ({
          motor,
          min: 0,
          current: 0,
          max: 0,
        }));
        setRecordingData(initialData);

        const iv = setInterval(async () => {
          try {
            const sr = await calibrateApi.getRecordingStatus(sessionId);
            if (sr.data.code === 0 && sr.data.data?.positions) {
              setRecordingData(sr.data.data.positions);
            }
          } catch {
            /* ignore */
          }
        }, 150);
        setRecordingInterval(iv);
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '开始记录失败');
      addLog('开始记录失败');
      await handleCancelCalibration();
    } finally {
      setLoading(false);
    }
  };

  const handleStopRecording = async () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }
    try {
      setLoading(true);
      addLog('停止记录...');
      const res = await calibrateApi.stopRecording(sessionId);
      if (res.data.code === 0) {
        addLog('记录完成');
        setStepModalVisible(false);
        await handleSaveCalibration();
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '停止记录失败');
      addLog('停止记录失败');
      setCurrentStep(CalibStep.IDLE);
      setSessionId('');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCalibration = async () => {
    try {
      setLoading(true);
      addLog('正在保存校准配置...');
      const res = await calibrateApi.save(sessionId);
      if (res.data.code === 0 && res.data.data) {
        addLog(` ${res.data.data.message}`);
        addLog(`${res.data.data.config_path}`);
        setCurrentStep(CalibStep.COMPLETED);
        setCalibrationStatus('校准完成');
        showCompletedModal();
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '保存失败');
      setCurrentStep(CalibStep.IDLE);
      setSessionId('');
      setCalibrationStatus('待开始');
    } finally {
      setLoading(false);
    }
  };

  const showCompletedModal = () => {
    Modal.success({
      title: '校准成功',
      content: (
        <div>
          <p style={{ color: '#52c41a', fontSize: 15 }}>
            校准成功！校准文件已保存至软件根目录下的校准文件夹中。
          </p>
        </div>
      ),
      onOk: () => {
        setCurrentStep(CalibStep.IDLE);
        setSessionId('');
        setRecordingData([]);
        setCalibrationStatus('待开始');
      },
    });
  };

  const handleCancelCalibration = async () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }
    if (sessionId) {
      try {
        await calibrateApi.cancel(sessionId);
        addLog('校准已取消');
      } catch {
        /* ignore */
      }
    }
    setStepModalVisible(false);
    setCurrentStep(CalibStep.IDLE);
    setSessionId('');
    setRecordingData([]);
    setCalibrationStatus('待开始');
  };

  const handleModalOk = () => {
    switch (currentStep) {
      case CalibStep.SET_MIDDLE:
        void handleSetMiddle();
        break;
      case CalibStep.RECORD_RANGE:
        recordingInterval ? void handleStopRecording() : void handleStartRecording();
        break;
      default:
        setStepModalVisible(false);
    }
  };

  const handleModalCancel = () => {
    void handleCancelCalibration();
  };

  const curStepIdx = stepIndexMap[currentStep];
  const stepStatus = currentStep === CalibStep.COMPLETED ? 'finish' : 'process';

  // 渲染记录范围的弹窗内容
  const renderRecordRangeContent = () => (
    <div>
      {recordingData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          正在获取关节数据...
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['关节名称', '最小值', '当前值', '最大值'].map((h) => (
                    <th
                      key={h}
                      style={{
                        background: '#f9fafb',
                        padding: '10px 12px',
                        textAlign: 'left',
                        borderBottom: '1px solid #e8ecf1',
                        fontWeight: 600,
                        color: '#595959',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordingData.map((row) => (
                  <tr key={row.motor}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: '#1a1a1a' }}>
                      {row.motor}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#1890ff', borderBottom: '1px solid #f0f0f0' }}>
                      {row.min}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#52c41a', borderBottom: '1px solid #f0f0f0' }}>
                      {row.current}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#ff4d4f', borderBottom: '1px solid #f0f0f0' }}>
                      {row.max}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              width: '200px',
              padding: '16px',
              background: '#e6f7ff',
              borderRadius: 8,
              fontSize: 13,
              color: '#0050b3',
            }}
          >
            <RobotOutlined style={{ fontSize: 20, marginBottom: 8 }} />
            <p style={{ margin: 0 }}>说明：校准逻辑为中位校准</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={S.root}>
      {/* 顶部标题栏 */}
      <div style={S.header}>
        <h1 style={S.headerTitle}>设备标定</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Tag
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 13,
              background: calibrationStatus === '待开始' ? '#f5f5f5' : calibrationStatus === '校准中' ? '#e6f7ff' : '#f6ffed',
              color: calibrationStatus === '待开始' ? '#8c8c8c' : calibrationStatus === '校准中' ? '#1890ff' : '#52c41a',
              border: `1px solid ${calibrationStatus === '待开始' ? '#d9d9d9' : calibrationStatus === '校准中' ? '#91d5ff' : '#b7eb8f'}`,
            }}
          >
            {calibrationStatus}
          </Tag>
          <Tag color={connectionStatus === '成功' ? 'green' : 'red'}>
            连接状态：{connectionStatus}
          </Tag>
        </div>
      </div>

      {/* 步骤条 */}
      <div style={S.stepsWrap}>
        <Steps current={curStepIdx} items={WIZARD_STEPS} size="small" status={stepStatus} style={{ maxWidth: 560 }} />
      </div>

      {/* 主体内容 */}
      <div style={S.body}>
        {/* 主内容区 */}
        <div style={S.mainContent}>
          <Form form={form} layout="vertical">
            {/* 机械臂类型 */}
            <div style={S.section}>
              <label style={S.sectionLabel}>机械臂类型：</label>
              <Form.Item name="arm_type" rules={[{ required: true, message: '请选择机械臂类型' }]}>
                <Select
                  placeholder="请选择机械臂类型"
                  onChange={handleArmTypeChange}
                  disabled={currentStep !== CalibStep.IDLE}
                  size="large"
                  options={ARM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                />
              </Form.Item>
            </div>

            {/* 机器人端口 */}
            <div style={S.section}>
              <label style={S.sectionLabel}>机器人端口：</label>
              <div style={S.portRow}>
                <Input
                  value={selectedPort}
                  placeholder="未配置端口"
                  readOnly
                  disabled={currentStep !== CalibStep.IDLE}
                  size="large"
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<UsbOutlined />}
                  onClick={handleOpenPortModal}
                  disabled={currentStep !== CalibStep.IDLE}
                  size="large"
                  style={S.buttonSecondary}
                >
                  查找端口
                </Button>
              </div>
            </div>

            {/* 机械臂名称 */}
            <div style={S.section}>
              <label style={S.sectionLabel}>机械臂名称：</label>
              <Form.Item name="arm_id" rules={[{ required: true, message: '请输入机械臂名称' }]}>
                <Input
                  placeholder="例如：my_awesome_arm"
                  disabled={currentStep !== CalibStep.IDLE}
                  size="large"
                />
              </Form.Item>
            </div>

            {/* 开始校准按钮 */}
            <div style={{ marginTop: '24px' }}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartCalibration}
                loading={loading}
                disabled={!isFormComplete || currentStep !== CalibStep.IDLE}
                size="large"
                style={{ ...S.buttonPrimary, width: '100%', background: isFormComplete && currentStep === CalibStep.IDLE ? '#1890ff' : undefined }}
              >
                开始校准
              </Button>
              {currentStep !== CalibStep.IDLE && (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={handleCancelCalibration}
                  size="large"
                  style={{ ...S.buttonPrimary, width: '100%', marginTop: '12px' }}
                >
                  取消校准
                </Button>
              )}
            </div>
          </Form>
        </div>

        {/* 右侧日志面板 */}
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
          <div style={S.logBody}>
            {logs.length === 0 ? (
              <div style={{ color: '#888' }}>这是终端控制台，用于输出日志</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 端口配置弹窗 */}
      <Modal
        title={isDualArm ? '配置机械臂端口（双臂）' : '配置机械臂端口（单臂）'}
        open={portModalVisible}
        onCancel={() => setPortModalVisible(false)}
        footer={null}
        width={900}
      >
        <PortFinder
          onPortsChange={handlePortsChange}
          onLog={addLog}
          maxSelection={isDualArm ? 2 : 1}
          selectionType="checkbox"
        />
      </Modal>

      {/* 校准流程弹窗 */}
      <Modal
        title={stepModalTitle}
        open={stepModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText={currentStep === CalibStep.RECORD_RANGE && recordingInterval ? '确认校准' : currentStep === CalibStep.RECORD_RANGE ? '开始记录' : '确认'}
        cancelText="取消"
        confirmLoading={loading}
        width={currentStep === CalibStep.RECORD_RANGE ? '80%' : 500}
        maskClosable={false}
        closable={currentStep !== CalibStep.RECORD_RANGE}
      >
        {stepModalContent === 'record_range' ? renderRecordRangeContent() : stepModalContent}
      </Modal>
    </div>
  );
}

export default CalibrationPage;
