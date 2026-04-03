import { useState } from 'react';
import { Modal, Button, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import styles from './GuideModal.module.css';

// ============================================================
// 步骤内容配置 - 可在此处修改步骤数量和内容
// ============================================================
export interface GuideStep {
  /** 步骤标题 */
  title: string;
  /** 步骤描述 */
  description: string;
  /** 插画图标（当前使用占位图标，后续替换为实际插画） */
  icon: React.ReactNode;
  /** 是否显示AI标识（第四步使用） */
  showAILabel?: boolean;
}

export const guideSteps: GuideStep[] = [
  {
    title: '第一步：创建数据集',
    description: '统一管理数据集，支持数据查看/导入/删除',
    icon: <DatasetIcon />,
  },
  {
    title: '第二步：数据智能处理',
    description: '创建标注任务后，平台会自动对数据进行预处理，再进行人工标注环节',
    icon: <ProcessIcon />,
  },
  {
    title: '第三步：数据标注',
    description: '添加标签，根据指导提示进行标注',
    icon: <LabelIcon />,
  },
  {
    title: '第四步：发布并使用数据集',
    description: '发布该版本数据集，供后续大模型精调环节使用',
    icon: <PublishIcon />,
    showAILabel: true,
  },
];

// ============================================================
// 占位插画图标（后续替换为实际插画图片）
// ============================================================
function DatasetIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="30" width="80" height="60" rx="8" fill="#E6F7FF" stroke="#1890FF" strokeWidth="2"/>
      <rect x="30" y="40" width="25" height="20" rx="4" fill="#91D5FF"/>
      <rect x="60" y="40" width="25" height="20" rx="4" fill="#91D5FF"/>
      <rect x="30" y="65" width="55" height="15" rx="4" fill="#69C0FF"/>
      <path d="M60 15L75 30H45L60 15Z" fill="#1890FF"/>
    </svg>
  );
}

function ProcessIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="35" stroke="#1890FF" strokeWidth="3" strokeDasharray="8 4" fill="#E6F7FF"/>
      <path d="M45 55L55 60L45 65" stroke="#1890FF" strokeWidth="2" strokeLinecap="round"/>
      <path d="M75 55L65 60L75 65" stroke="#1890FF" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="60" cy="60" r="8" fill="#1890FF"/>
    </svg>
  );
}

function LabelIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="25" y="35" width="70" height="50" rx="6" fill="#E6F7FF" stroke="#1890FF" strokeWidth="2"/>
      <path d="M40 50H80M40 60H70" stroke="#1890FF" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="85" cy="35" r="15" fill="#FF7A45" stroke="#FFF" strokeWidth="2"/>
      <path d="M80 35L85 40L92 30" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="45" width="80" height="50" rx="6" fill="#E6F7FF" stroke="#1890FF" strokeWidth="2"/>
      <path d="M60 25L75 45H45L60 25Z" fill="#1890FF"/>
      <rect x="40" y="55" width="40" height="6" rx="3" fill="#69C0FF"/>
      <rect x="40" y="65" width="30" height="6" rx="3" fill="#91D5FF"/>
      <rect x="40" y="75" width="35" height="6" rx="3" fill="#91D5FF"/>
      {/* AI 标识 */}
      <rect x="75" y="20" width="25" height="16" rx="4" fill="#FF7A45"/>
      <text x="87.5" y="31" textAnchor="middle" fill="#FFF" fontSize="10" fontWeight="bold">AI</text>
    </svg>
  );
}

// ============================================================
// 组件接口定义
// ============================================================
export interface GuideModalProps {
  /** 控制弹窗显隐 */
  visible: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 点击完成回调 */
  onFinish: () => void;
  /** 自定义步骤数据（可选，默认使用 guideSteps） */
  steps?: GuideStep[];
}

// ============================================================
// 组件主体
// ============================================================
function GuideModal({ visible, onClose, onFinish, steps = guideSteps }: GuideModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // 当前步骤数据
  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  // 重置步骤到第一步（弹窗重新打开时）
  const handleAfterOpenChange = (open: boolean) => {
    if (open) {
      setCurrentStep(0);
    }
  };

  // 上一步
  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 下一步
  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    }
  };

  // 完成
  const handleFinish = () => {
    onFinish();
    onClose();
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      afterOpenChange={handleAfterOpenChange}
      footer={null}
      centered
      width={520}
      closable={false}
      maskClosable={true}
      className={styles.guideModal}
    >
      <div className={styles.container}>
        {/* ───────────────────────────────────────────── */}
        {/* 顶部插画区域 */}
        {/* ───────────────────────────────────────────── */}
        <div className={styles.illustrationArea}>
          {/* TODO: 替换插画图片 - 当前步骤插画位于 step.icon */}
          {/* 替换方法：将 step.icon 替换为 <img src="实际插画路径" className={styles.illustration} /> */}
          <div className={styles.iconWrapper}>
            {step.icon}
            {/* AI 标识（第四步显示） */}
            {step.showAILabel && (
              <div className={styles.aiLabel}>AI</div>
            )}
          </div>
        </div>

        {/* ───────────────────────────────────────────── */}
        {/* 中间文字区域 */}
        {/* ───────────────────────────────────────────── */}
        <div className={styles.textArea}>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepDescription}>{step.description}</p>
        </div>

        {/* ───────────────────────────────────────────── */}
        {/* 底部操作区域 */}
        {/* ───────────────────────────────────────────── */}
        <div className={styles.actionArea}>
          {/* 步骤指示器 - 左下角 */}
          <div className={styles.stepIndicators}>
            {steps.map((_, index) => (
              <span
                key={index}
                className={`${styles.dot} ${index === currentStep ? styles.dotActive : ''}`}
              />
            ))}
          </div>

          {/* 操作按钮 - 右下角 */}
          <Space>
            {/* 上一步按钮（第一步不显示） */}
            {!isFirstStep && (
              <Button
                className={styles.btnSecondary}
                icon={<LeftOutlined />}
                onClick={handlePrev}
              >
                上一步
              </Button>
            )}

            {/* 下一步 / 完成按钮 */}
            {isLastStep ? (
              <Button
                type="primary"
                className={styles.btnPrimary}
                onClick={handleFinish}
              >
                完成
              </Button>
            ) : (
              <Button
                type="primary"
                className={styles.btnPrimary}
                icon={<RightOutlined />}
                onClick={handleNext}
              >
                下一步
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  );
}

export default GuideModal;
