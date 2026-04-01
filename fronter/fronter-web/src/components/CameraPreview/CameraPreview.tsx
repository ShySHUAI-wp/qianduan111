import React, { useEffect, useRef, useState } from 'react';
import { Modal, Spin, message } from 'antd';
import { cameraApi } from '@/services/api';
import './CameraPreview.css';

interface CameraPreviewProps {
  cameraId: string;
  cameraName: string;
  cameraType?: string;  // 新增：相机类型，用于区分本地摄像头
  visible: boolean;
  onClose: () => void;
  onLog?: (message: string) => void;
  localStream?: MediaStream | null;  // 新增：本地流（从CameraFinder传入）
}

function CameraPreview({
  cameraId,
  cameraName,
  cameraType,
  visible,
  onClose,
  onLog,
  localStream
}: CameraPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');

  // 使用ref防止重复操作
  const isStoppingRef = useRef<boolean>(false);
  const isInitializingRef = useRef<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);  // 用于本地摄像头预览
  const localStreamRef = useRef<MediaStream | null>(null);  // 保存本地流引用

  // 判断是否是本地摄像头
  const isLocalCamera = cameraType === 'LocalCamera' || cameraId.startsWith('local-');

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

      // 如果是本地摄像头，停止本地流
      if (isLocalCamera && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        addLog('已停止本地摄像头流');
      } else {
        addLog(`发送停止请求: ${cameraId}`);
        await cameraApi.stopStream(cameraId);
        addLog(`已停止相机流: ${cameraId}`);
      }
    } catch (error) {
      console.error(`Failed to stop camera stream for ${cameraId}:`, error);
      addLog(`停止失败: ${error}`);
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

        // 如果是本地摄像头且传入了本地流
        if (isLocalCamera && localStream) {
          // 直接使用传入的本地流进行预览
          localStreamRef.current = localStream;
          addLog(`开始预览本地摄像头: ${cameraName}`);
          // 使用setTimeout确保video元素已渲染
          setTimeout(() => {
            if (videoRef.current && localStream) {
              videoRef.current.srcObject = localStream;
            }
          }, 0);
          setLoading(false);
          return;
        }

        // 构建流URL（添加时间戳防止缓存）
        const baseUrl = cameraApi.getStreamUrl(cameraId);
        const timestamp = Date.now();
        const uniqueStreamUrl = `${baseUrl}?t=${timestamp}`;

        console.log('[CameraPreview] Stream URL:', uniqueStreamUrl);
        setStreamUrl(uniqueStreamUrl);

        addLog(`开始预览相机: ${cameraName} (${cameraId})`);
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
        if (isLocalCamera) {
          // 本地摄像头不需要调用后端API停止
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
          }
        } else {
          cameraApi.stopStream(cameraId).catch((err) => {
            console.error('[CameraPreview] Cleanup stopStream failed:', err);
          });
        }
      }

      // 清空img
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      // 清空video的srcObject
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [visible, cameraId, cameraName, isLocalCamera, localStream]);

  // 图像加载完成
  const handleImageLoad = () => {
    console.log('[CameraPreview] Image loaded successfully');
    setLoading(false);
    setError(null);
    addLog(`相机流已连接: ${cameraName}`);
  };

  // 图像加载错误
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('[CameraPreview] Image load error:', e);
    setLoading(false);
    setError('无法连接到相机流');
    addLog(`相机流连接失败: ${cameraName}`);
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
        {visible && streamUrl && !isLocalCamera && (
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

        {/* 本地摄像头使用video标签直接播放 */}
        {visible && isLocalCamera && localStream && (
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            className="camera-preview-image"
            autoPlay
            playsInline
            muted
            onLoadedData={() => {
              setLoading(false);
              setError(null);
              addLog(`本地摄像头预览已连接: ${cameraName}`);
            }}
            style={{
              display: loading || error ? 'none' : 'block',
              width: '100%',
              height: 'auto',
              maxHeight: '600px',
              objectFit: 'contain',
              transform: 'scaleX(-1)' // 镜像翻转（前置摄像头）
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
