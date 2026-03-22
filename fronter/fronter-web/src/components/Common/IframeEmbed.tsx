import { Card, Button, Spin } from 'antd';
import { FullscreenOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface IframeEmbedProps {
  url: string;
  title?: string;
  height?: number;
}

function IframeEmbed({ url, title = '嵌入页面', height = 600 }: IframeEmbedProps) {
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  const handleCloseFullscreen = () => {
    setIsFullscreen(false);
  };

  return (
    <>
      <Card
        title={title}
        extra={
          <Button size="small" icon={<FullscreenOutlined />} onClick={handleFullscreen}>
            全屏
          </Button>
        }
        styles={{ body: { padding: 0, position: 'relative' } }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f0f0f0',
            }}
          >
            <Spin tip="加载中..." />
          </div>
        )}
        <iframe
          src={url}
          title={title}
          style={{
            width: '100%',
            height,
            border: 'none',
          }}
          onLoad={handleLoad}
        />
      </Card>

      {/* 全屏模态框 */}
      {isFullscreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              height: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <span style={{ fontWeight: 'bold' }}>{title}</span>
            <Button onClick={handleCloseFullscreen}>关闭全屏</Button>
          </div>
          <iframe
            src={url}
            title={title}
            style={{
              width: '100%',
              height: 'calc(100vh - 50px)',
              border: 'none',
            }}
          />
        </div>
      )}
    </>
  );
}

export default IframeEmbed;
