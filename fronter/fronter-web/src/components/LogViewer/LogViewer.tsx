import { useEffect, useRef } from 'react';
import { Button, Space } from 'antd';
import { CopyOutlined, ClearOutlined } from '@ant-design/icons';

interface LogViewerProps {
  logs: string[];
  height?: number;
  onClear?: () => void;
}

function LogViewer({ logs, height = 400, onClear }: LogViewerProps) {
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
      // 可以添加成功提示
    });
  };

  // 清空日志
  const handleClear = () => {
    onClear?.();
  };

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
          复制
        </Button>
        {onClear && (
          <Button size="small" icon={<ClearOutlined />} onClick={handleClear}>
            清空
          </Button>
        )}
      </Space>
      <div
        ref={logContainerRef}
        style={{
          height: height,
          overflow: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: '12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '13px',
          lineHeight: '1.5',
          borderRadius: '4px',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#888' }}>暂无日志输出</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: 4 }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LogViewer;
