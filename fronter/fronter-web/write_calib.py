# -*- coding: utf-8 -*-
from pathlib import Path

OUT = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')

TSX = r"""
import { useState, useRef, useEffect } from 'react';
import { Button, Form, Input, Modal, Select, Steps, Typography, message } from 'antd';
import {
  UsbOutlined, CheckCircleOutlined, PlayCircleOutlined,
  StopOutlined, SettingOutlined,
} from '@ant-design/icons';
import { calibrateApi } from '@/services/api';
import PortFinder from '@/components/PortFinder';

const { Text } = Typography;

// ─── 机械臂类型配置 ─────────────────────────────────────
const ARM_TYPE_OPTIONS = [
  { value: 'so101_leader',        label: '单臂（示教臂）',       isDual: false },
  { value: 'bi_so100_leader',     label: '双臂（示教臂）',       isDual: true  },
  { value: 'bi_so100_leader_c',   label: '双臂+底盘（示教臂）', isDual: true  },
  { value: 'so101_follower',      label: '单臂（操作臂）',       isDual: false },
  { value: 'bi_so100_follower',   label: '双臂（操作臂）',       isDual: true  },
  { value: 'bi_so100_follower_c', label: '双臂+底盘（操作臂）', isDual: true  },
];

const ARM_TYPE_MAP: Record<string, string> = {
  so101_leader: 'so101_leader',
  bi_so100_leader: 'bi_so100_leader',
  bi_so100_leader_c: 'bi_so100_leader',
  so101_follower: 'so101_follower',
  bi_so100_follower: 'bi_so100_follower',
  bi_so100_follower_c: 'bi_so100_follower',
};

// ─── 校准步骤枚举 ────────────────────────────────────────
enum CalibStep {
  IDLE = 'idle',
  CHECK_CONFIG = 'check_config',
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
  [CalibStep.CHECK_CONFIG]: 0,
  [CalibStep.SET_MIDDLE]: 1,
  [CalibStep.RECORD_RANGE]: 2,
  [CalibStep.COMPLETED]: 3,
};

type RecordRow = { motor: string; min: number; current: number; max: number };

// ─── 内联样式 ────────────────────────────────────────────
const S: Record<string, any> = {
  root: {
    minHeight: '100vh', background: '#0d1117',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px 12px',
    borderBottom: '1px solid rgba(0,212,255,0.14)',
    background: 'linear-gradient(180deg,rgba(0,212,255,0.04) 0%,transparent 100%)',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 38, height: 38,
    background: 'linear-gradient(135deg,#00d4ff 0%,#0066cc 100%)',
    borderRadius: 8, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 20, color: '#fff', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: 700, color: '#e6f4ff', margin: 0 },
  headerSub:   { fontSize: 12, color: 'rgba(140,180,220,0.6)', marginTop: 2 },
  stepsWrap: {
    padding: '12px 24px', background: 'rgba(0,0,0,0.18)',
    borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
  },
  body: {
    display: 'grid', gridTemplateColumns: '272px 1fr 288px',
    flex: 1, overflow: 'hidden', minHeight: 0,
  },
  leftPanel: {
    background: 'rgba(255,255,255,0.015)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto', padding: '14px 12px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  section: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, overflow: 'hidden',
  },
  sectionHead: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.14)',
  },
  sectionBar:      { width: 3, height: 13, borderRadius: 2, background: '#00d4ff',  flexShrink: 0 },
  sectionBarGreen: { width: 3, height: 13, borderRadius: 2, background: '#00c853',  flexShrink: 0 },
  sectionBarBlue:  { width: 3, height: 13, borderRadius: 2, background: '#00aaff',  flexShrink: 0 },
  sectionLabel: {
    fontSize: 11, fontWeight: 600,
    color: 'rgba(160,200,230,0.85)',
    letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'inherit',
  },
  sectionBody: { padding: 12 },
  portEmpty: {
    padding: '12px 8px', textAlign: 'center',
    color: 'rgba(140,170,200,0.28)', fontSize: 11, fontStyle: 'italic',
    border: '1px dashed rgba(255,255,255,0.08)',
    borderRadius: 6, marginBottom: 10,
  },
  portTag: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px',
    background: 'rgba(0,102,204,0.12)',
    border: '1px solid rgba(0,212,255,0.28)',
    borderRadius: 20, fontSize: 11, color: '#7ec8e3',
    fontFamily: 'inherit', margin: '0 4px 4px 0',
  },
  centerPanel: {
    background: 'rgba(0,0,0,0.08)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto', padding: 20,
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  stateCard: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, overflow: 'hidden',
  },
  stateCardActive: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(0,212,255,0.22)',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 0 24px rgba(0,212,255,0.06)',
  },
  stateCardDone: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(0,200,83,0.22)',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 0 24px rgba(0,200,83,0.06)',
  },
  stateHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.2)',
    fontSize: 11, fontWeight: 600,
    color: 'rgba(170,200,230,0.8)',
    textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: 'inherit',
  },
  stateBody: {
    padding: '24px 20px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', minHeight: 200,
  },
  logPanel: {
    display: 'flex', flexDirection: 'column',
    background: 'rgba(0,0,0,0.28)', overflow: 'hidden',
  },
  logHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.22)', flexShrink: 0,
  },
  logTitle: {
    fontSize: 11, fontWeight: 600,
    color: 'rgba(160,200,230,0.7)',
    letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'inherit',
  },
  logBody: {
    flex: 1, overflowY: 'auto',
    padding: '10px 14px',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  logLine: {
    fontSize: 11, color: 'rgba(180,210,240,0.75)',
    lineHeight: '1.7', fontFamily: 'inherit',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    paddingBottom: 3, wordBreak: 'break-all',
  },
  logEmpty: {
    color: 'rgba(120,150,180,0.28)', fontSize: 11,
    fontStyle: 'italic', textAlign: 'center', marginTop: 40,
  },
  warnBox: {
    marginTop: 12, padding: '10px 14px',
    background: '#fff7e6', border: '1px solid #ffd591',
    borderRadius: 6, fontSize: 13, color: '#d48806',
  },
};

// ─── 组件 ────────────────────────────────────────────────
function Calibration() {
  const [form] = Form.useForm();
  const [isDualArm, setIsDualArm]       = useState(false);
  const [loading, setLoading]           = useState(false);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [portModalVisible, setPortModalVisible] = useState(false);
  const [sessionId, setSessionId]       = useState('');
  const [currentStep, setCurrentStep]   = useState<CalibStep>(CalibStep.IDLE);
  const [stepModalVisible, setStepModalVisible] = useState(false);
  const [stepModalTitle, setStepModalTitle]     = useState('');
  const [stepModalContent, setStepModalContent] = useState<React.ReactNode>(null);
  const [recordingData, setRecordingData]       = useState<RecordRow[]>([]);
  const [recordingInterval, setRecordingInterval] =
    useState<ReturnType<typeof setInterval> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${t}] ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleArmTypeChange = (value: string) => {
    const found = ARM_TYPE_OPTIONS.find((t) => t.value === value);
    setIsDualArm(found?.isDual || false);
    setSelectedPorts([]);
    form.setFieldValue('arm_type', value);
  };

  const buildParams = () => {
    const v = form.getFieldsValue();
    const realType = ARM_TYPE_MAP[v.arm_type] || v.arm_type;
    const p: Record<string, string> = { arm_type: realType, arm_id: v.arm_id };
    if (isDualArm) {
      p.left_arm_port  = selectedPorts[0] || '';
      p.right_arm_port = selectedPorts[1] || '';
    } else {
      p.port = selectedPorts[0] || '';
    }
    return p;
  };

  // ── 校准流程 ────────────────────────────────────────────
  const handleStartCalibration = async () => {
    try {
      await form.validateFields();
      const v = form.getFieldsValue();
      if (!v.arm_type || !v.arm_id)               { message.error('请填写完整信息'); return; }
      if (isDualArm && selectedPorts.length < 2)  { message.error('双臂需要配置 2 个端口'); return; }
      if (!isDualArm && selectedPorts.length < 1) { message.error('单臂需要配置 1 个端口'); return; }
      setLoading(true);
      addLog(`🚀 开始校准: ${v.arm_type} — ${v.arm_id}`);
      const params = buildParams();
      const res = await calibrateApi.checkConfig(params);
      if (res.data.code === 0 && res.data.data) {
        const { exists, path } = res.data.data;
        if (exists) { setCurrentStep(CalibStep.CHECK_CONFIG); showConfigExistsModal(path); }
        else        { await startNewCalibration(params); }
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
        <p>检测到以下路径存在校准配置：</p>
        <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, fontSize: 12, overflow: 'auto' }}>
          {configPath}
        </pre>
        <p style={{ color: '#666', marginTop: 8 }}>选择「重新校准」将覆盖；选择「使用现有配置」将直接应用。</p>
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
      setSessionId(sid); addLog(`📝 