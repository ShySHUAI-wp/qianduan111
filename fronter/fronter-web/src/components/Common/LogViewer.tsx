import { useRef, useEffect } from 'react';
import { Card, Button, Space } from 'antd';
import { ClearOutlined, CopyOutlined } from '@ant-design/icons';
import { message } from 'antd';

interface LogViewerProps {
  logs: string[];
  title?: string;
  height?: number;
  onClear?: () => void;
}

function LogViewer({ logs, title = '日志输出', height = 400, onClear }: LogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 复制日志
  const handleCopy = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      message.success('日志已复制到剪贴板');
    });
  };

  return (
    <Card
      title={title}
      extra={
        <Space>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          <Button size="small" icon={<ClearOutlined />} onClick={onClear}>
            清空
          </Button>
        </Space>
      }
      styles={{ body: { padding: 0 } }}
    >
      <div
        ref={logContainerRef}
        style={{
          height,
          overflowY: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: 12,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#888', fontStyle: 'italic' }}>暂无日志...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: 2 }}>
              {log}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export default LogViewer;
