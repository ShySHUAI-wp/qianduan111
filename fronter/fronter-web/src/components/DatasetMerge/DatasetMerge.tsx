import { Card, Button, Input, Space, Table, Typography, Alert } from 'antd';
import { ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';

interface DatasetMergeProps {
  onLog?: (message: string) => void;
}

type DatasetRow = { key: string; name: string; structure: string; episodes: number };

function DatasetMerge({ onLog }: DatasetMergeProps) {
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [mergedName, setMergedName] = useState('merged_dataset');

  const addLog = (msg: string) => onLog?.(msg);

  const columns = useMemo(
    () => [
      { title: '数据集', dataIndex: 'name', key: 'name', width: 260 },
      { title: '结构', dataIndex: 'structure', key: 'structure' },
      { title: 'episodes', dataIndex: 'episodes', key: 'episodes', width: 120 },
    ],
    []
  );

  return (
    <Card title="数据集合并" styles={{ body: { paddingTop: 16 } }}>
      <Alert
        type="info"
        showIcon
        message="将多次采集的数据合并成一个数据集"
        description="计划调用 lerobot 的脚本进行合并；当前前端提供列表加载与合并参数收敛，具体执行依赖后端接口/脚本封装。"
        style={{ marginBottom: 12 }}
      />

      <Space style={{ marginBottom: 12 }}>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            // 仅做 UI 占位：后续对接后端后用真实列表替换
            setRows([
              { key: '1', name: 'my_dataset_000001', structure: 'lerobot', episodes: 30 },
              { key: '2', name: 'my_dataset_000002', structure: 'lerobot', episodes: 30 },
            ]);
            addLog('🔄 已刷新数据集列表（示例数据）');
          }}
        >
          刷新
        </Button>
      </Space>

      <Table
        columns={columns as any}
        dataSource={rows}
        pagination={false}
        size="small"
        locale={{ emptyText: '此处为列表，用于加载本地保存的数据集' }}
        style={{ marginBottom: 12 }}
      />

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Typography.Text strong>合并后数据集命名</Typography.Text>
        <Input value={mergedName} onChange={(e) => setMergedName(e.target.value)} style={{ maxWidth: 320 }} />
        <div>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => addLog(`🚀 开始合并：输出数据集 = ${mergedName}（等待后端接口返回）`)}
          >
            开始合并
          </Button>
        </div>
      </Space>
    </Card>
  );
}

export default DatasetMerge;

