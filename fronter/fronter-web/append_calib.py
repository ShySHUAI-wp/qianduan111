# -*- coding: utf-8 -*-
import os

p = r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx'

# ---- STYLES OBJECT ----
styles_part = '''
const S: Record<string, any> = {
  root: { minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 12px', borderBottom: '1px solid rgba(0,212,255,0.14)', background: 'linear-gradient(180deg,rgba(0,212,255,0.04) 0%,transparent 100%)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { width: 38, height: 38, background: 'linear-gradient(135deg,#00d4ff 0%,#0066cc 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', flexShrink: 0 },
  headerTitle: { fontSize: 20, fontWeight: 700, color: '#e6f4ff', margin: 0 },
  headerSub: { fontSize: 12, color: 'rgba(140,180,220,0.6)', marginTop: 2 },
  stepsWrap: { padding: '12px 24px', background: 'rgba(0,0,0,0.18)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 },
  body: { display: 'grid', gridTemplateColumns: '272px 1fr 288px', flex: 1, overflow: 'hidden', minHeight: 0 },
  leftPanel: { background: 'rgba(255,255,255,0.015)', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
  section: { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.14)' },
  sectionBar: { width: 3, height: 13, borderRadius: 2, background: '#00d4ff', flexShrink: 0 },
  sectionBarGreen: { width: 3, height: 13, borderRadius: 2, background: '#00c853', flexShrink: 0 },
  sectionBarBlue: { width: 3, height: 13, borderRadius: 2, background: '#00aaff', flexShrink: 0 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(160,200,230,0.85)', letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'inherit' },
  sectionBody: { padding: 12 },
  portEmpty: { padding: '12px 8px', textAlign: 'center', color: 'rgba(140,170,200,0.28)', fontSize: 11, fontStyle: 'italic', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6, marginBottom: 10 },
  portTag: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(0,102,204,0.12)', border: '1px solid rgba(0,212,255,0.28)', borderRadius: 20, fontSize: 11, color: '#7ec8e3', fontFamily: 'inherit', margin: '0 4px 4px 0' },
  centerPanel: { background: 'rgba(0,0,0,0.08)', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  stateCard: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' },
  stateCardActive: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,212,255,0.22)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 0 24px rgba(0,212,255,0.06)' },
  stateCardDone: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,200,83,0.22)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 0 24px rgba(0,200,83,0.06)' },
  stateHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', fontSize: 11, fontWeight: 600, color: 'rgba(170,200,230,0.8)', textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: 'inherit' },
  stateBody: { padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  logPanel: { display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.28)', overflow: 'hidden' },
  logHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.22)', flexShrink: 0 },
  logTitle: { fontSize: 11, fontWeight: 600, color: 'rgba(160,200,230,0.7)', letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'inherit' },
  logBody: { flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 },
  logLine: { fontSize: 11, color: 'rgba(180,210,240,0.75)', lineHeight: '1.7', fontFamily: 'inherit', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 3, wordBreak: 'break-all' },
  logEmpty: { color: 'rgba(120,150,180,0.28)', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  warnBox: { marginTop: 12, padding: '10px 14px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 13, color: '#d48806' },
};
'''

# ---- MODAL HELPERS ----
modal_helpers = '''
  const showSetMiddleModal = () => {
    setStepModalTitle('步骤 1/2：设置中间位置');
    setStepModalContent(
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}>请手动将机械臂移至行程中间位置</p>
        <ul style={{ paddingLeft: 20, marginTop: 12, lineHeight: 2.2 }}>
          <li>将所有关节移动到可活动角度的<strong>中间位置</strong></li>
          <li>确保每个关节都不偏向任何一侧</li>
          <li>目视检查各关节位置是否合理</li>
        </ul>
        <div style={S.warnBox}>⚠️ 此步骤非常重要，中间位置不准确会影响校准结果</div>
        <p style={{ marginTop: 12, color: \'#888\' }}>完成后点击「确定」继续</p>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleSetMiddle = async () => {
    try {
      setLoading(true); addLog(\'⏳ 正在设置中间位置...\');
      const res = await calibrateApi.setMiddle(sessionId);
      if (res.data.code === 0) {
        addLog(\'✅ 中间位置已设置\');
        setStepModalVisible(false); setCurrentStep(CalibStep.RECORD_RANGE); showRecordRangeModal();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || \'设置中间位置失败\');
      addLog(\'❌ 设置中间位置失败\'); await handleCancelCalibration();
    } finally { setLoading(false); }
  };

  const showRecordRangeModal = () => {
    setStepModalTitle(\'步骤 2/2：记录运动范围\');
    setStepModalContent(
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: \'#1677ff\' }}>准备记录关节运动范围</p>
        <ul style={{ paddingLeft: 20, marginTop: 12, lineHeight: 2.2 }}>
          <li>点击「开始记录」后，依次将<strong>每个关节</strong>移至物理行程<strong>最大角度</strong></li>
          <li>再依次将<strong>每个关节</strong>移至物理行程<strong>最小角度</strong></li>
          <li>确保所有关节都完整移动过</li>
        </ul>
        <div style={S.warnBox}>⚠️ 必须移动所有关节到极限位置，否则校准会报错</div>
      </div>
    );
    setStepModalVisible(true);
  };

  const handleStartRecording = async () => {
    try {
      setLoading(true); addLog(\'📊 开始记录运动范围...\');
      const res = await calibrateApi.startRecording(sessionId);
      if (res.data.code === 0) {
        addLog(\'✅ 正在记录，请移动机械臂...\');
        setRecordingData([]);
        setStepModalTitle(\'正在记录运动范围 — 请移动所有关节\');
        setStepModalVisible(true);
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
      message.error(e?.response?.data?.message || \'开始记录失败\');
      addLog(\'❌ 开始记录失败\'); await handleCancelCalibration();
    } finally { setLoading(false); }
  };

  const handleStopRecording = async () => {
    if (recordingInterval) { clearInterval(recordingInterval); setRecordingInterval(null); }
    try {
      setLoading(true); addLog(\'⏸️ 停止记录...\');
      const res = await calibrateApi.stopRecording(sessionId);
      if (res.data.code === 0) {
        addLog(\'✅ 记录完成\'); setStepModalVisible(false); await handleSaveCalibration();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || \'停止记录失败\');
      addLog(\'❌ 停止记录失败\');
      setStepModalVisible(false); setCurrentStep(CalibStep.IDLE); setSessionId(\'\');
    } finally { setLoading(false); }
  };

  const handleSaveCalibration = async () => {
    try {
      setLoading(true); addLog(\'💾 正在保存校准配置...\');
      const res = await calibrateApi.save(sessionId);
      if (res.data.code === 0 && res.data.data) {
        addLog(`✅ ${res.data.data.message}`);
        addLog(`📁 ${res.data.data.config_path}`);
        setCurrentStep(CalibStep.COMPLETED); showCompletedModal();
      } else throw new Error(res.data.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || \'保存失败\');
      setCurrentStep(CalibStep.IDLE); setSessionId(\'\');
    } finally { setLoading(false); }
  };

  const showCompletedModal = () => {
    Modal.success({
      title: \'校准完成\',
      content: (
        <div>
          <p style={{ color: \'#52c41a\', fontSize: 15 }}>✅ 机械臂校准已成功完成！</p>
          <p>校准配置已保存，您现在可以进行遥操或数据采集。</p>
        </div>
      ),
      onOk: () => { setCurrentStep(CalibStep.IDLE); setSessionId(\'\'); setRecordingData([]); },
    });
  };

  const handleCancelCalibration = async () => {
    if (recordingInterval) { clearInterval(recordingInterval); setRecordingInterval(null); }
    if (sessionId) {
      try { await calibrateApi.cancel(sessionId); addLog(\'🛑 校准已取消\'); } catch { /* ignore */ }
    }
    setStepModalVisible(false); setCurrentStep(CalibStep.IDLE); setSessionId(\'\'); setRecordingData([]);
  };

  const handleModalOk = () => {
    switch (currentStep) {
      case CalibStep.CHECK_CONFIG:
        setStepModalVisible(false); void startNewCalibration(buildParams()); break;
      case CalibStep.SET_MIDDLE:
        void handleSetMiddle(); break;
      case CalibStep.RECORD_RANGE:
        recordingInterval ? void handleStopRecording() : void handleStartRecording(); break;
      default:
        setStepModalVisible(false);
    }
  };

  const handleModalCancel = () => {
    currentStep === CalibStep.CHECK_CONFIG
      ? void handleUseExistingConfig()
      : void handleCancelCalibration();
  };

  const isIdle = currentStep === CalibStep.IDLE;
  const curStepIdx = stepIndexMap[currentStep];
'''

# ---- JSX RETURN ----
jsx_part = '''
  const stateCardStyle = currentStep === CalibStep.COMPLETED ? S.stateCardDone
    : currentStep !== CalibStep.IDLE ? S.stateCardActive : S.stateCard;

  const badgeStyle: any = {
    display: \'flex\', alignItems: \'center\', gap: 8, padding: \'5px 14px\',
    borderRadius: 20, fontSize: 13, fontWeight: 500, border: \'1px solid\',
    ...(currentStep === CalibStep.COMPLETED
      ? { background: \'rgba(0,200,83,0.08)\', borderColor: \'rgba(0,200,83,0.35)\', color: \'#00c853\' }
      : currentStep === CalibStep.IDLE
      ? { background: \'rgba(80,80,80,0.12)\', borderColor: \'rgba(120,120,120,0.22)\', color: \'#8c8c8c\' }
      : { background: \'rgba(0,212,255,0.08)\', borderColor: \'rgba(0,212,255,0.32)\', color: \'#00d4ff\' }
    ),
  };

  return (
    <div style={S.root}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerIcon}><SettingOutlined /></div>
          <div>
            <div style={S.headerTitle}>设备标定</div>
            <div style={S.headerSub}>对机械臂进行关节校准，确保运动精度</div>
          </div>
        </div>
        <div style={badgeStyle}>
          <span style={{ width: 7, height: 7, 