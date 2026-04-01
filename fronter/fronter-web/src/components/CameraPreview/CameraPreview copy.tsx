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
  const isStoppingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentCameraIdRef = useRef<string>('');

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
      // 中断当前请求（核心：防止连接残留）
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        addLog(`已中断旧的流请求`);
      }
      addLog(`发送异步停止请求中`)
      await cameraApi.stopStream(cameraId);
      addLog(`已停止相机流: ${cameraId}`);
    } catch (error) {
      console.error(`Failed to stop camera stream for ${cameraId}:`, error);
      addLog(`停止失败: ${error}`);
    } finally {
      isStoppingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  // 处理关闭
  const handleClose = async () => {
    console.log('[CameraPreview] handleClose called');

    addLog(`开始关闭预览窗口`);
    
    // 核心修改：先同步停止流，再关闭弹窗
    await stopStream();
    
    // 清空URL，强制img标签卸载
    setStreamUrl('');
    currentCameraIdRef.current = '';
    
    // 关闭弹窗
    onClose();
  };

  // 初始化流
  useEffect(() => {

    // 定义异步初始化函数
  const initStream = async () => {
    if (visible && cameraId) {
      console.log('[CameraPreview] useEffect 触发 - visible:', visible, 'cameraId:', cameraId);
      console.log('[CameraPreview] Opening preview for camera:', cameraId);
      
      // 只停一次旧流，且等待完成
      if (currentCameraIdRef.current) {
        await stopStream(); 
      }
      currentCameraIdRef.current = cameraId;
      
      setLoading(true);
      setError(null);
      isStoppingRef.current = false;

      setStreamUrl('')

      // 构建带时间戳的唯一URL
      const uniqueStreamUrl = cameraApi.getStreamUrl(cameraId);
      setStreamUrl(uniqueStreamUrl); 
      console.log('[CameraPreview] Stream URL:', uniqueStreamUrl);

      addLog(`开始预览相机: ${cameraName} (${cameraId})`);
      abortControllerRef.current = new AbortController();
    }
  };

    initStream();

    return () => {
      // 只在组件卸载或 cameraId 变化时清理
      if (!visible) {
        console.log('[CameraPreview] Cleanup: stopping stream');
        // 组件卸载时停止流
        if (!isStoppingRef.current) {
          stopStream().catch((err) => { // 用封装的stopStream（含中断请求）
            console.error('[CameraPreview] Cleanup stopStream failed:', err);
          });
        }
        // 中断未完成的请求
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }
    };
  }, [visible, cameraId]);

  // 图像加载完成
  const handleImageLoad = () => {
    setLoading(false);
    setError(null);
    addLog(`相机流已连接: ${cameraName}`);
  };

  // 图像加载错误
  const handleImageError = () => {
    setLoading(false);
    setError('无法连接到相机流');
    addLog(`相机流连接失败: ${cameraName}`);
    message.error('无法连接到相机流');
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

        {visible && (
          <img
            className="camera-preview-image"
            src={streamUrl} 
            alt={`Camera ${cameraName}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: loading || error ? 'none' : 'block' }}
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
