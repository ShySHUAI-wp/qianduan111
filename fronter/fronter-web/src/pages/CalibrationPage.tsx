import { useEffect, useState, useMemo } from 'react';
import { Button, Form, Input, Modal, Select, Steps, Tag, message } from 'antd';
import {
  CheckCircleOutlined, PlayCircleOutlined, StopOutlined, UsbOutlined,
} from '@ant-design/icons';
import { calibrateApi, systemApi } from '@/services/api';
import PortFinder from '@/components/PortFinder';
import LogViewer from '@/components/LogViewer';

const ARM_TYPE_OPTIONS = [
  { value: 'so101_leader',        label: '单臂（示教臂）',       isDual: false },
  { value: 'bi_so100_leader',     label: '双臂（示教臂）',       isDual: true  },
  { value: 'bi_so100_leader_c',   label: '双臂+底盘（示教臂）', isDual: true  },
  { value: 'so101_follower',      label: '单臂（操作臂）',       isDual: false },
  { value: 'bi_so100_follower',   label: '双臂（操作臂）',       isDual: true  },
  { value: 'bi_so100_follower_c', label: '双臂+底盘（操作臂）', isDual: true  },
];
const ARM_TYPE_MAP: Record<string, string> = {
  so101_leader: 'so101_leader', bi_so100_leader: 'bi_so100_leader',
  bi_so100_leader_c: 'bi_so100_leader', so101_follower: 'so101_follower',
  bi_so100_follower: 'bi_so100_follower', bi_so100_follower_c: 'bi_so100_follower',
};
enum CalibStep {
  IDLE = 'idle', CHECK_CONFIG = 'check_config', SET_MIDDLE = 'set_middle',
  RECORD_RANGE = 'record_range', COMPLETED = 'completed',
}
const WIZARD_STEPS = [
  { title: '配置信息' }, { title: '中间位置' }, { title: '运动范围' }, { title: '完成' },
];
const stepIndexMap: Record<CalibStep, number> = {
  [CalibStep.IDLE]: 0, [CalibStep.CHECK_CONFIG]: 0, [CalibStep.SET_MIDDLE]: 1,
  [CalibStep.RECORD_RANGE]: 2, [CalibStep.COMPLETED]: 3,
};
type RecordRow = { motor: string; min: number; current: number; max: number };
type ConnState = 'disconnected' | 'connecting' | 'connected';
type CalibrateParams = {
  arm_type: string; arm_id: string;
  port?: string; left_arm_port?: string; right_arm_port?: string;
};

const S: Record<string, React.CSSProperties> = {
  root: { display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:'#f5f7fa', fontFamily:"'Segoe UI','Helvetica Neue','Arial',sans-serif", margin:'-24px' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px', borderBottom:'1px solid #e8ecf1', background:'#fff', flexShrink:0 },
  headerLeft:  { display:'flex', alignItems:'center', gap:10 },
  headerRight: { display:'flex', alignItems:'center', gap:12 },
  headerIcon: { width:32, height:32, background:'linear-gradient(135deg,#ff6b6b 0%,#ee5a6f 100%)', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#fff', flexShrink:0, fontWeight:'bold' },
  headerTitle: { fontSize:18, fontWeight:700, color:'#1a1a1a', margin:0 },
  headerSub:   { fontSize:13, color:'#8c95a0', marginTop:2 },
  stepsWrap: { padding:'12px 24px', background:'#fff', borderBottom:'1px solid #e8ecf1', flexShrink:0 },
  body: { display:'grid', gridTemplateColumns:'280px 1fr 320px', flex:1, overflow:'hidden', minHeight:0 },
  leftPanel: { background:'#fff', borderRight:'1px solid #e8ecf1', overflowY:'auto', padding:'16px 14px', display:'flex', flexDirection:'column', gap:14 },
  section: { background:'#fff', border:'1px solid #e8ecf1', borderRadius:8, overflow:'hidden' },
  sectionHead: { display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid #e8ecf1', background:'#f9fafb' },
  sectionBar:      { width:3, height:14, borderRadius:2, background:'#1890ff', flexShrink:0 },
  sectionBarGreen: { width:3, height:14, borderRadius:2, background:'#52c41a', flexShrink:0 },
  sectionBarBlue:  { width:3, height:14, borderRadius:2, background:'#1890ff', flexShrink:0 },
  sectionLabel: { fontSize:12, fontWeight:600, color:'#1a1a1a', letterSpacing:'0.3px', textTransform:'uppercase', fontFamily:'inherit' },
  sectionBody: { padding:14 },
  portEmpty: { padding:'12px 10px', textAlign:'center', color:'#bfbfbf', fontSize:12, fontStyle:'italic', border:'1px dashed #d9d9d9', borderRadius:6, marginBottom:10 },
  portTag: { display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', background:'#e6f7ff', border:'1px solid #91d5ff', borderRadius:20, fontSize:11, color:'#0050b3', fontFamily:'inherit', margin:'0 4px 4px 0' },
  centerPanel: { background:'#fff', borderRight:'1px solid #e8ecf1', overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 },
  stateCard:       { background:'#fff', border:'1px solid #e8ecf1', borderRadius:8, overflow:'hidden' },
  stateCardActive: { background:'#fff', border:'1px solid #1890ff',  borderRadius:8, overflow:'hidden', boxShadow:'0 2px 8px rgba(24,144,255,0.12)' },
  stateCardDone:   { background:'#fff', border:'1px solid #52c41a',   borderRadius:8, overflow:'hidden', boxShadow:'0 2px 8px rgba(82,196,26,0.12)' },
  stateHead: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #e8ecf1', background:'#f9fafb', fontSize:12, fontWeight:600, color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'0.3px', fontFamily:'inherit' },
  stateBody: { padding:'28px 24px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:220 },
  warnBox: { marginTop:12, padding:'10px 14px', background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:6, fontSize:13, color:'#ad6800' },
  hintBox: { marginTop:10, padding:'8px 12px', background:'#e6f7ff', border:'1px solid #91d5ff', borderRadius:6, fontSize:12, color:'#0050b3' },
  logPanel: { display:'flex', flexDirection:'column', background:'#fff', border:'1px solid #e8ecf1', borderRadius:8, overflow:'hidden' },
};

function CalibrationPage() {
  const [form] = Form.useForm();
  const [conn, setConn] = useState<ConnState>('disconnected');
  const [isDualArm, setIsDualArm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [currentStep, setCurrentStep] = useState<CalibStep>(CalibStep.IDLE);
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [stepModalTitle, setStepModalTitle] = useState('');
  const [stepModalContent, setStepModalContent] = useState<React.ReactNode>(null);
  const [recordingData, setRecordingData] = useState<RecordRow[]>([]);
  const [recordingInterval, setRecordingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => { }, []);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${t}] ${msg}`]);
  };

  const handleConnect = async () => {
    setConn('connecting');
    try {
      await systemApi.health();
      setConn('connected'); message.success('设备连接成功'); addLog('✅ 后端连接成功');
    } catch {
      setConn('disconnected'); message.error('连接失败：请检查后端服务是否启动'); addLog('❌ 连接失败');
    }
  };

  const handleDisconnect = () => {
    Modal.confirm({
      title: '确认断开连接？', content: '断开后前端数据流将暂停。',
      okText: '断开', cancelText: '取消', okButtonProps: { danger: true },
      onOk: () => { setConn('disconnected'); addLog('🔌 已断开连接'); },
    });
  };

  const statusTag = useMemo(() => {
    if (conn === 'connected')  return <Tag color="green" style={{ fontSize: 12 }}>连接状态：成功</Tag>;
    if (conn === 'connecting') return <Tag color="gold" style={{ fontSize: 12 }}>连接状态：连接中</Tag>;
    return <Tag color="red" style={{ fontSize: 12 }}>连接状态：未连接</Tag>;
  }, [conn]);

  const buildParams = (): CalibrateParams => {
    const v = form.getFieldsValue();
    const realType = ARM_TYPE_MAP[v.arm_type] || v.arm_type;
    if (isDualArm) return { arm_type: realType, arm_id: v.arm_id, left_arm_port: selectedPorts[0] || '', right_arm_port: selectedPorts[1] || '' };
    return { arm_type: realType, arm_id: v.arm_id, port: selectedPorts[0] || '' };
  };

  const handleArmTypeChange = (value: string) => {
    const found = ARM_TYPE_OPTIONS.find((t) => t.value === value);
    setIsDualArm(found?.isDual || false); setSelectedPorts([]); form.setFieldValue('arm_type', value);
  };

  const handleStartCalibration = async () => {
    try {
      await form.validateFields();
      const v = form.getFieldsValue();
      if (!v.arm_type || !v.arm_id) { message.error('请填写完整信息'); return; }
      if (isDualArm && selectedPorts.length < 2) { message.error('双臂需要配置 2 个端口'); return; }
      if (!isDualArm && selectedPorts.length < 1) { message.error('单臂需要配置 1 个端口'); return; }
      setLoading(true);
      addLog(`🚀 开始校准: ${v.arm_type} — ${v.arm_id}`);
      const params = buildParams();
      const res = await calibrateApi.checkConfig(params);
      if (res.data.code === 0 && res.data.data) {
        const { exists, path } = res.data.data;
        if (exists) { setCurrentStep(CalibStep.CHECK_CONFIG); showConfigExistsModal(path); }
        else { await startNewCalibration(params); }
      }
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '启动校准失败');
    } finally { setLoading(false); }
  };

  const showConfigExistsModal = (configPath: string) => {
    setStepModalTitle('检测到已有配置文件');
    setStepModalContent(
      <div>
        <p style={{ color: '#595959' }}>检测到以下路径存在校准配置：</p>
        <pre style={{ background: '#f9fafb', border: '1px solid #e8ecf1', padding: 10, borderRadius: 4, fontSize: 12, overflow: 'auto', color: '#1890ff' }}>{configPath}</pre>
        <p style={{ color: '#8c95a0', marginTop: 8, fontSize: 13 }}>选择「重新校准」将覆盖；选择「使用现有配置」将直接应用。</p>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleUseExistingConfig = async () => {
    try {
      setLoading(true);
      const startRes = await calibrateApi.start(buildParams());
      if (startRes.data.code !== 0 || !startRes.data.data) throw new Error(startRes.data.message);
      const sid = startRes.data.data.session_id;
      setSessionId(sid); addLog(`📝 会话: ${sid}`);
      const useRes = await calibrateApi.useExisting(sid);
      if (useRes.data.code === 0 && useRes.data.data) {
        addLog(`✅ ${useRes.data.data.message}`);
        message.success('成功应用现有校准配置');
        setStepModalVisible(false); setCurrentStep(CalibStep.COMPLETED); showCompletedModal();
      } else throw new Error(useRes.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '使用现有配置失败');
      await handleCancelCalibration();
    } finally { setLoading(false); }
  };

  const startNewCalibration = async (params: CalibrateParams) => {
    try {
      setLoading(true);
      const startRes = await calibrateApi.start(params);
      if (startRes.data.code !== 0 || !startRes.data.data) throw new Error(startRes.data.message);
      const sid = startRes.data.data.session_id;
      setSessionId(sid); addLog(`📝 会话: ${sid}`); addLog('📡 设备已连接');
      setStepModalVisible(false); setCurrentStep(CalibStep.SET_MIDDLE); showSetMiddleModal();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '启动新校准失败');
      setCurrentStep(CalibStep.IDLE);
    } finally { setLoading(false); }
  };

  const showSetMiddleModal = () => {
    setStepModalTitle('步骤 1/2：设置中间位置');
    setStepModalContent(
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1890ff' }}>请手动将机械臂移至行程中间位置</p>
        <ul style={{ paddingLeft: 20, marginTop: 12, color: '#595959', lineHeight: 2.2 }}>
          <li>将所有关节移动到可活动角度的<strong style={{ color: '#1a1a1a' }}>中间位置</strong></li>
          <li>确保每个关节都不偏向任何一侧</li>
          <li>目视检查各关节位置是否合理</li>
        </ul>
        <div style={S.warnBox}>⚠️ 此步骤非常重要，中间位置不准确会影响校准结果</div>
        <p style={{ marginTop: 12, color: '#8c95a0', fontSize: 13 }}>完成后点击「确定」继续</p>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleSetMiddle = async () => {
    try {
      setLoading(true); addLog('⏳ 正在设置中间位置...');
      const res = await calibrateApi.setMiddle(sessionId);
      if (res.data.code === 0) {
        addLog('✅ 中间位置已设置');
        setStepModalVisible(false); setCurrentStep(CalibStep.RECORD_RANGE); showRecordRangeModal();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '设置中间位置失败');
      addLog('❌ 设置中间位置失败'); await handleCancelCalibration();
    } finally { setLoading(false); }
  };

  const showRecordRangeModal = () => {
    setStepModalTitle('步骤 2/2：记录运动范围');
    setStepModalContent(
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1890ff' }}>准备记录关节运动范围</p>
        <ul style={{ paddingLeft: 20, marginTop: 12, color: '#595959', lineHeight: 2.2 }}>
          <li>点击「开始记录」后，依次将<strong style={{ color: '#1a1a1a' }}>每个关节</strong>移至物理行程<strong style={{ color: '#1a1a1a' }}>最大角度</strong></li>
          <li>再依次将<strong style={{ color: '#1a1a1a' }}>每个关节</strong>移至物理行程<strong style={{ color: '#1a1a1a' }}>最小角度</strong></li>
          <li>确保所有关节都完整移动过后点击「完成记录」</li>
        </ul>
        <div style={S.warnBox}>⚠️ 必须移动所有关节到极限位置，否则校准会报错</div>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleStartRecording = async () => {
    try {
      setLoading(true); addLog('📊 开始记录运动范围...');
      const res = await calibrateApi.startRecording(sessionId);
      if (res.data.code === 0) {
        addLog('✅ 正在记录，请移动机械臂...');
        setRecordingData([]);
        const iv = setInterval(async () => {
          try {
            const sr = await calibrateApi.getRecordingStatus(sessionId);
            if (sr.data.code === 0 && sr.data.data?.positions) setRecordingData(sr.data.data.positions);
          } catch { /* ignore */ }
        }, 150);
        setRecordingInterval(iv);
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '开始记录失败');
      addLog('❌ 开始记录失败'); await handleCancelCalibration();
    } finally { setLoading(false); }
  };

  const handleStopRecording = async () => {
    if (recordingInterval) { clearInterval(recordingInterval); setRecordingInterval(null); }
    try {
      setLoading(true); addLog('⏸️ 停止记录...');
      const res = await calibrateApi.stopRecording(sessionId);
      if (res.data.code === 0) {
        addLog('✅ 记录完成'); setStepModalVisible(false); await handleSaveCalibration();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '停止记录失败');
      addLog('❌ 停止记录失败');
      setStepModalVisible(false); setCurrentStep(CalibStep.IDLE); setSessionId('');
    } finally { setLoading(false); }
  };

  const handleSaveCalibration = async () => {
    try {
      setLoading(true); addLog('💾 正在保存校准配置...');
      const res = await calibrateApi.save(sessionId);
      if (res.data.code === 0 && res.data.data) {
        addLog(`✅ ${res.data.data.message}`);
        addLog(`📁 ${res.data.data.config_path}`);
        setCurrentStep(CalibStep.COMPLETED); showCompletedModal();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '保存失败');
      setCurrentStep(CalibStep.IDLE); setSessionId('');
    } finally { setLoading(false); }
  };

  const showCompletedModal = () => {
    Modal.success({
      title: '校准完成',
      content: (
        <div>
          <p style={{ color: '#52c41a', fontSize: 15 }}>✅ 机械臂校准已成功完成！</p>
          <p style={{ color: '#595959' }}>校准配置已保存，您现在可以进行遥操或数据采集。</p>
        </div>
      ),
      onOk: () => { setCurrentStep(CalibStep.IDLE); setSessionId(''); setRecordingData([]); },
    });
  };

  const handleCancelCalibration = async () => {
    if (recordingInterval) { clearInterval(recordingInterval); setRecordingInterval(null); }
    if (sessionId) {
      try { await calibrateApi.cancel(sessionId); addLog('🛑 校准已取消'); } catch { /* ignore */ }
    }
    setStepModalVisible(false); setCurrentStep(CalibStep.IDLE); setSessionId(''); setRecordingData([]);
  };

  const handleModalOk = () => {
    switch (currentStep) {
      case CalibStep.CHECK_CONFIG: setStepModalVisible(false); void startNewCalibration(buildParams()); break;
      case CalibStep.SET_MIDDLE: void handleSetMiddle(); break;
      case CalibStep.RECORD_RANGE: recordingInterval ? void handleStopRecording() : void handleStartRecording(); break;
      default: setStepModalVisible(false);
    }
  };

  const handleModalCancel = () => {
    currentStep === CalibStep.CHECK_CONFIG ? void handleUseExistingConfig() : void handleCancelCalibration();
  };

  const isIdle = currentStep === CalibStep.IDLE;
  const curStepIdx = stepIndexMap[currentStep];
  const stateCardStyle = currentStep === CalibStep.COMPLETED ? S.stateCardDone : currentStep !== CalibStep.IDLE ? S.stateCardActive : S.stateCard;
  const badgeColor = currentStep === CalibStep.COMPLETED
    ? { bg: '#f6ffed', border: '#b7eb8f', color: '#52c41a' }
    : currentStep === CalibStep.IDLE
    ? { bg: '#f5f5f5', border: '#d9d9d9', color: '#8c8c8c' }
    : { bg: '#e6f7ff', border: '#91d5ff', color: '#1890ff' };
  const badgeLabel = currentStep === CalibStep.COMPLETED ? '校准完成' : currentStep === CalibStep.IDLE ? '待开始' : '校准中...';

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div>
            <div style={S.headerTitle}>设备标定</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:20, fontSize:13, fontWeight:500, border:'1px solid', background:badgeColor.bg, borderColor:badgeColor.border, color:badgeColor.color }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'currentColor', display:'inline-block' }} />
            {badgeLabel}
          </div>
          {statusTag}
        </div>
      </div>

      <div style={S.stepsWrap}>
        <Steps current={curStepIdx} items={WIZARD_STEPS} size="small" status={currentStep === CalibStep.COMPLETED ? 'finish' : 'process'} style={{ maxWidth: 560 }} />
      </div>

      <div style={S.body}>
        <div style={S.leftPanel}>
          <div style={S.section}>
            <div style={S.sectionHead}><div style={S.sectionBar} /><span style={S.sectionLabel}>机械臂类型</span></div>
            <div style={S.sectionBody}>
              <Form form={form} layout="vertical">
                <Form.Item name="arm_type" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请选择类型' }]}>
                  <Select placeholder="请选择机械臂类型" onChange={handleArmTypeChange} disabled={!isIdle} size="large" style={{ width: '100%' }} options={ARM_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} />
                </Form.Item>
              </Form>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionHead}><div style={S.sectionBarBlue} /><span style={S.sectionLabel}>端口配置{isDualArm ? '（双臂）' : '（单臂）'}</span></div>
            <div style={S.sectionBody}>
              {selectedPorts.length === 0 ? (
                <div style={S.portEmpty}>未配置端口</div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  {selectedPorts.map((port, i) => (
                    <span key={i} style={S.portTag}><UsbOutlined style={{ fontSize: 11 }} />{isDualArm ? (i === 0 ? '左臂: ' : '右臂: ') : ''}{port}</span>
                  ))}
                </div>
              )}
              <Button icon={<UsbOutlined />} onClick={() => setPortModalVisible(true)} disabled={!isIdle} block size="small" style={{ background:'#fff', border:'1px solid #d9d9d9', color:'#1890ff', height:36 }}>
                {selectedPorts.length > 0 ? '重新配置端口' : '配置端口'}
              </Button>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionHead}><div style={S.sectionBarGreen} /><span style={S.sectionLabel}>机械臂名称</span></div>
            <div style={S.sectionBody}>
              <Form form={form} layout="vertical">
                <Form.Item name="arm_id" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请输入名称' }]}>
                  <Input placeholder="例如：my_awesome_arm" disabled={!isIdle} size="large" />
                </Form.Item>
              </Form>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
            <Button type="primary" size="large" block icon={<PlayCircleOutlined />} loading={loading} disabled={!isIdle} onClick={handleStartCalibration}
              style={{ height:44, border:'none', fontWeight:700, background: isIdle ? '#1890ff' : undefined, boxShadow: isIdle ? '0 2px 8px rgba(24,144,255,0.25)' : undefined }}>
              开始校准
            </Button>
            {!isIdle && (<Button danger block icon={<StopOutlined />} onClick={handleCancelCalibration} style={{ height:40 }}>取消校准</Button>)}
          </div>
        </div>

        <div style={S.centerPanel}>
        </div>

        <div style={{ display:'flex', flexDirection:'column', background:'#fff', border:'1px solid #e8ecf1', borderRadius:8, overflow:'hidden' }}>
          <LogViewer logs={logs} height={520} onClear={() => setLogs([])} />
        </div>
      </div>

      <Modal title={isDualArm ? '配置机械臂端口（双臂·需 2 个）' : '配置机械臂端口（单臂·需 1 个）'} open={portModalVisible} onCancel={() => setPortModalVisible(false)} width={900} footer={[<Button key="close" onClick={() => setPortModalVisible(false)}>关闭</Button>]}>
        <PortFinder onPortsChange={(ports) => { setSelectedPorts(ports); addLog(`🔌 已选择端口: ${ports.join(', ')}`); }} onLog={addLog} maxSelection={isDualArm ? 2 : 1} selectionType={isDualArm ? 'checkbox' : 'radio'} />
      </Modal>

      <Modal title={stepModalTitle} open={stepModalVisible} onOk={handleModalOk} onCancel={handleModalCancel}
        okText={currentStep === CalibStep.CHECK_CONFIG ? '重新校准' : currentStep === CalibStep.RECORD_RANGE && recordingInterval ? '完成记录' : currentStep === CalibStep.RECORD_RANGE ? '开始记录' : '确定'}
        cancelText={currentStep === CalibStep.CHECK_CONFIG ? '使用现有配置' : '取消'}
        confirmLoading={loading} width={600} maskClosable={false} keyboard={false}>
        {currentStep === CalibStep.RECORD_RANGE && recordingInterval ? (
          <div>
            <p style={{ color:'#1890ff', marginBottom:12 }}>🔄 正在实时记录各关节位置，请移动机械臂到最大和最小角度</p>
            {recordingData.length === 0 ? (
              <div style={{ textAlign:'center', padding:20, color:'#999' }}>正在获取关节数据...</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr>{['关节','最小值','当前值','最大值'].map((h) => (
                  <th key={h} style={{ background:'#f9fafb', padding:'8px 12px', textAlign:'left', borderBottom:'1px solid #e8ecf1', fontWeight:600, color:'#595959' }}>{h}</th>
                ))}</tr></thead>
                <tbody>{recordingData.map((row) => (
                  <tr key={row.motor}>
                    <td style={{ padding:'8px 12px', borderBottom:'1px solid #f0f0f0', color:'#1a1a1a' }}>{row.motor}</td>
                    <td style={{ padding:'8px 12px', color:'#1890ff', borderBottom:'1px solid #f0f0f0' }}>{row.min}</td>
                    <td style={{ padding:'8px 12px', color:'#52c41a', borderBottom:'1px solid #f0f0f0' }}>{row.current}</td>
                    <td style={{ padding:'8px 12px', color:'#ff4d4f', borderBottom:'1px solid #f0f0f0' }}>{row.max}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <div style={{ padding:'8px 12px', background:'#e6f7ff', borderRadius:4, marginTop:12, fontSize:12, color:'#0050b3' }}>
              💡 确保每个关节的 MIN 和 MAX 都有明显变化
            </div>
          </div>
        ) : stepModalContent}
      </Modal>
    </div>
  );
}

export default CalibrationPage;
