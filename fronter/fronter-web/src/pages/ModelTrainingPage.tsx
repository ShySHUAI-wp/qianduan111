import { useState } from 'react';
import { Tabs, Button, Card, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import Training from '@/components/Training';
import DatasetMerge from '@/components/DatasetMerge';
import ModelDeploy from '@/components/ModelDeploy';
import LogViewer from '@/components/Common/LogViewer';
import GuideModal from '@/components/Common/GuideModal';

function ModelTrainingPage() {
  const [activeTab, setActiveTab] = useState('training');
  const [logs, setLogs] = useState<string[]>([]);
  const [mergeLogs, setMergeLogs] = useState<string[]>([]);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [guideVisible, setGuideVisible] = useState(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const addMergeLog = (msg: string) => {
    setMergeLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const clearMergeLogs = () => {
    setMergeLogs([]);
  };

  const addDeployLog = (msg: string) => {
    setDeployLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const clearDeployLogs = () => {
    setDeployLogs([]);
  };

  const tabItems = [
    {
      key: 'training',
      label: '模型训练',
      children: (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Training onLog={addLog} />
          </div>
          <div style={{ width: 400 }}>
            <Card title="训练图表" style={{ marginBottom: 16 }}>
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                这是一个图表，用于实时展示 loss 曲线的变化情况
              </div>
            </Card>
            <LogViewer
              logs={logs}
              title="日志输出"
              height={300}
              onClear={clearLogs}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'dataset-merge',
      label: '数据集合并',
      children: (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <DatasetMerge onLog={addMergeLog} />
          </div>
          <div style={{ width: 400 }}>
            <LogViewer
              logs={mergeLogs}
              title="合并日志"
              height={400}
              onClear={clearMergeLogs}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'model-deploy',
      label: '模型下发',
      children: (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <ModelDeploy onLog={addDeployLog} />
          </div>
          <div style={{ width: 400 }}>
            <LogViewer
              logs={deployLogs}
              title="下发日志"
              height={400}
              onClear={clearDeployLogs}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0, fontSize: 20 }}>
          模型服务 - 模型训练
        </Typography.Title>
        <Button
          type="primary"
          icon={<QuestionCircleOutlined />}
          onClick={() => setGuideVisible(true)}
        >
          新手引导
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      {/* 新手引导弹窗 */}
      <GuideModal
        visible={guideVisible}
        onClose={() => setGuideVisible(false)}
        onFinish={() => {
          console.log('新手引导完成');
        }}
      />
    </div>
  );
}

export default ModelTrainingPage;
