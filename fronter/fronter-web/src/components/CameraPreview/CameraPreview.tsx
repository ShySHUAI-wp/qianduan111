import { useEffect, useRef, useState } from 'react';
import { Modal, Spin, message } from 'antd';
import { cameraApi } from '@/services/api';
import './CameraPreview.css';

interface CameraPreviewProps {
  cameraId: string;
  cameraName: string;
  visible: boolean;
  onClose: () => void;
  onLog?: (message: string) => void;
}

function CameraPreview({ cameraId, cameraName, visible, onClose, onLog }: CameraPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');

  // 使用ref防止重复操作
  const isStoppingRef = useRef<boolean>(false);
  const isInitializingRef = useRef<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[CameraPreview]', msg);
    onLog?.(msg);
  };

  // 停止相机流
  const stopStream = async () => {
    if (isStoppingRef.current) {
      console.log('[CameraPreview] Already stopping, skip duplicate call');
      return;
    }

    isStoppingRef.current = true;
    try {
      // 清空img的src，停止加载
      if (imgRef.current) {
        imgRef.current.src = '';
      }

      addLog(`⏸️ 发送停止请求: ${cameraId}`);
      await cameraApi.stopStream(cameraId);
      addLog(`⏹️ 已停止相机流: ${cameraId}`);
    } catch (error) {
      console.error(`Failed to stop camera stream for ${cameraId}:`, error);
      addLog(`❌ 停止失败: ${error}`);
    } finally {
      isStoppingRef.current = false;
    }
  };

  // 处理关闭
  const handleClose = () => {
    console.log('[CameraPreview] handleClose called');

    // 立即关闭弹窗
    onClose();

    // 在后台停止流
    stopStream();

    // 清空状态
    setStreamUrl('');
    setLoading(true);
    setError(null);
  };

  // 初始化流
  useEffect(() => {
    const initStream = async () => {
      // 防止重复初始化
      if (!visible || !cameraId || isInitializingRef.current) {
        return;
      }

      isInitializingRef.current = true;

      try {
        console.log('[CameraPreview] Initializing stream for camera:', cameraId);

        setLoading(true);
        setError(null);
        isStoppingRef.current = false;

        // 构建流URL（添加时间戳防止缓存）
        const baseUrl = cameraApi.getStreamUrl(cameraId);
        const timestamp = Date.now();
        const uniqueStreamUrl = `${baseUrl}?t=${timestamp}`;

        console.log('[CameraPreview] Stream URL:', uniqueStreamUrl);
        setStreamUrl(uniqueStreamUrl);

        addLog(`📹 开始预览相机: ${cameraName} (${cameraId})`);
      } finally {
        // 延迟释放锁，防止快速重复调用
        setTimeout(() => {
          isInitializingRef.current = false;
        }, 500);
      }
    };

    if (visible) {
      initStream();
    }

    // 清理函数
    return () => {
      if (!visible && !isStoppingRef.current) {
        console.log('[CameraPreview] Cleanup: stopping stream');
        cameraApi.stopStream(cameraId).catch((err) => {
          console.error('[CameraPreview] Cleanup stopStream failed:', err);
        });
      }

      // 清空img
      if (imgRef.current) {
        imgRef.current.src = '';
      }
    };
  }, [visible, cameraId, cameraName]);

  // 图像加载完成
  const handleImageLoad = () => {
    console.log('[CameraPreview] Image loaded successfully');
    setLoading(false);
    setError(null);
    addLog(`✅ 相机流已连接: ${cameraName}`);
  };

  // 图像加载错误
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('[CameraPreview] Image load error:', e);
    setLoading(false);
    setError('无法连接到相机流');
    addLog(`❌ 相机流连接失败: ${cameraName}`);
    message.error('无法连接到相机流，请检查相机是否正常工作');
  };

  return (
    <Modal
      title={`相机预览 - ${cameraName}`}
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={null}
      destroyOnHidden
    >
      <div className="camera-preview-container">
        {loading && (
          <div className="camera-preview-loading">
            <Spin size="large" />
            <p>正在连接相机...</p>
          </div>
        )}

        {error && (
          <div className="camera-preview-error">
            <p>{error}</p>
          </div>
        )}

        {/* 直接使用img标签显示MJPEG流 */}
        {visible && streamUrl && (
          <img
            ref={imgRef}
            className="camera-preview-image"
            src={streamUrl}
            alt={`Camera ${cameraName}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              display: loading || error ? 'none' : 'block',
              width: '100%',
              height: 'auto',
              maxHeight: '600px',
              objectFit: 'contain'
            }}
          />
        )}

        <div className="camera-preview-info">
          <p>相机ID: {cameraId}</p>
          <p>提示: 关闭窗口将自动停止预览</p>
        </div>
      </div>
    </Modal>
  );
}

export default CameraPreview;
