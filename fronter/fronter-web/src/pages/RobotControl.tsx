import { useEffect, useMemo, useState } from 'react';
import { Typography, Tabs, Card, Col, Row, Affix, Space, Tag } from 'antd';
import type { TabsProps } from 'antd';
import { useSearchParams } from 'react-router-dom';
import PortFinder from '@/components/PortFinder';
import CameraFinder from '@/components/CameraFinder';
import Calibrate from '@/components/Calibrate';
import Teleoperate from '@/components/Teleoperate';
import Record from '@/components/Record';
import Training from '@/components/Training';
import DatasetMerge from '@/components/DatasetMerge';
import Inference from '@/components/Inference';
import LogViewer from '@/components/LogViewer';

const { Title } = Typography;

function RobotControl() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<string[]>([]);
  // 这里仅做 UI 指示；真实连接状态可后续接入 health/ws
  const [connectionStatus] = useState<'success' | 'disconnected'>('success');
  const [activeTab, setActiveTab] = useState<string>('teleoperation');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const handlePortsChange = (ports: string[]) => {
    addLog(`发现 ${ports.length} 个端口`);
  };

  const handleCamerasChange = (cameras: any[]) => {
    addLog(`发现 ${cameras.length} 个相机`);
  };

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const logPanel = useMemo(
    () => (
      <Affix offsetTop={16}>
        <Card
          title={
            <Space size="middle">
              <span>日志输出</span>
              <Tag color={connectionStatus === 'success' ? 'green' : 'red'}>
                {connectionStatus === 'success' ? '连接状态：成功' : '连接状态：未连接'}
              </Tag>
            </Space>
          }
          styles={{ body: { paddingTop: 12 } }}
        >
          <LogViewer logs={logs} height={520} onClear={handleClearLogs} />
        </Card>
      </Affix>
    ),
    [connectionStatus, logs]
  );

  const tabItems: TabsProps['items'] = [
    {
      key: 'port-finder',
      label: '查找端口',
      children: (
        <div>
          <PortFinder
            onPortsChange={handlePortsChange}
            onLog={addLog}
          />
        </div>
      ),
    },
    {
      key: 'camera-finder',
      label: '查找相机',
      children: (
        <div>
          <CameraFinder
            onCamerasChange={handleCamerasChange}
            onLog={addLog}
          />
        </div>
      ),
    },
    {
      key: 'calibration',
      label: '设备标定',
      children: (
        <div>
          <Calibrate onLog={addLog} />
        </div>
      ),
    },
    {
      key: 'teleoperation',
      label: '动作示教',
      children: (
        <div>
          <Teleoperate onLog={addLog} />
        </div>
      ),
    },
    {
      key: 'recording',
      label: '数据采集',
      children: (
        <div>
          <Record onLog={addLog} />
        </div>
      ),
    },
    {
      key: 'training',
      label: '模型训练',
      children: (
        <div>
          <Training onLog={addLog} />
        </div>
      ),
    },
    {
      key: 'dataset-merge',
      label: '数据集合并',
      children: (
        <div>
          <DatasetMerge onLog={addLog} />
        </div>
      ),
    },
    {
      key: 'inference',
      label: '模型推理',
      children: (
        <div>
          <Inference onLog={addLog} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          机械臂控制
        </Title>
        <Typography.Text type="secondary">
          说明：右侧控制台统一输出命令与状态日志
        </Typography.Text>
      </div>

      <Row gutter={16} align="top">
        <Col xs={24} xl={15}>
          <Tabs
            activeKey={activeTab}
            items={tabItems}
            onChange={(key) => {
              setActiveTab(key);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', key);
                return next;
              });
            }}
          />
        </Col>
        <Col xs={24} xl={9}>
          {logPanel}
        </Col>
      </Row>
    </div>
  );
}

export default RobotControl;
