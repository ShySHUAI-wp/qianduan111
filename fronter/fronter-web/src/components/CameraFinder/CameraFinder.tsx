import { useState, useRef, useEffect } from 'react';
import { Button, Modal, Table, Space, message } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import type { CameraInfo } from '@/types';
import { cameraApi } from '@/services/api';
import './CameraFinder.css';

interface CameraFinderProps {
  onCamerasChange?: (cameras: CameraInfo[]) => void;
  onLog?: (message: string) => void;
  onPreviewCamera?: (camera: CameraInfo, localStream: MediaStream | null) => void;  // 新增：预览回调
  localCameraStream?: MediaStream | null;  // 新增：本地摄像头流（从父组件传入）
}

function CameraFinder({ onCamerasChange, onLog, onPreviewCamera, localCameraStream }: CameraFinderProps) {
  const [loading, setLoading] = useState(false);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [localCameraError, setLocalCameraError] = useState<string | null>(null);
  const [internalLocalStream, setInternalLocalStream] = useState<MediaStream | null>(null);

  // 选中的相机列表
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 追踪是否已初始化本地摄像头
  const localCameraInitializedRef = useRef(false);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[CameraFinder]', msg);
    onLog?.(msg);
  };

  // 自动获取本地前置摄像头
  useEffect(() => {
    const initLocalCamera = async () => {
      // 防止重复初始化
      if (localCameraInitializedRef.current) {
        return;
      }
      localCameraInitializedRef.current = true;

      try {
        addLog('正在检测本地摄像头...');

        // 检查浏览器是否支持 getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('您的浏览器不支持摄像头访问');
        }

        // 请求用户前置摄像头
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user', // 前置摄像头
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });

        // 获取设备信息
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const frontCamera = videoDevices.find(d =>
          d.label.toLowerCase().includes('front') ||
          d.label.toLowerCase().includes('前置') ||
          d.label.toLowerCase().includes('camera')
        );

        // 保存本地流供预览使用
        setInternalLocalStream(stream);

        // 创建本地摄像头信息对象
        const localCamera: CameraInfo = {
          name: '本地摄像头 (前置)',
          type: 'LocalCamera',
          id: `local-${frontCamera?.deviceId || 'default'}`,
          backend_api: 'getUserMedia',
          default_stream_profile: {
            format: 0,
            fourcc: 'MJPG',
            width: 640,
            height: 480,
            fps: 30
          }
        };

        // 添加到相机列表（放在最前面）
        setCameras(prev => {
          // 避免重复添加
          if (prev.some(cam => cam.type === 'LocalCamera')) {
            return prev;
          }
          return [localCamera, ...prev];
        });

        // 默认选中本地摄像头
        setSelectedRowKeys([`LocalCamera-${localCamera.id}`]);
        onCamerasChange?.([localCamera]);

        addLog('已自动加载本地前置摄像头');
        message.success('已自动加载本地前置摄像头');

      } catch (error: any) {
        console.error('[CameraFinder] 初始化本地摄像头失败:', error);
        setLocalCameraError(error.message);

        // 根据错误类型给出友好提示
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          addLog('用户拒绝了摄像头权限，可手动查找USB相机');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          addLog('未找到本地摄像头，可手动查找USB相机');
        } else {
          addLog(`摄像头初始化失败: ${error.message}`);
        }
        // 不影响原有功能，用户仍可使用USB相机查找
      }
    };

    // 页面加载后自动初始化本地摄像头
    initLocalCamera();

    // 组件卸载时清理
    return () => {
      if (internalLocalStream) {
        internalLocalStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onCamerasChange, addLog, onPreviewCamera]);

  // 开始查找相机（显示确认对话框）
  const handleFindCamera = () => {
    addLog(' 准备查找相机');
    Modal.confirm({
      title: '查找相机',
      content: '请确认已经插好相机 USB 接口，然后点击确定开始查找。',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        await doFindCamera();
      },
      onCancel: () => {
        addLog(' 已取消相机查找');
      },
    });
  };

  // 执行查找相机
  const doFindCamera = async () => {
    setLoading(true);
    addLog(' 正在查找相机...');

    try {
      const response = await cameraApi.list('opencv');

      if (response.data.code === 0 && response.data.data) {
        const foundCameras: CameraInfo[] = response.data.data.cameras;

        // 保留本地摄像头，只追加USB相机到列表
        setCameras(prev => {
          // 过滤掉已有的本地摄像头
          const filteredFound = foundCameras.filter(
            cam => !prev.some(p => p.type === 'LocalCamera' && p.id === cam.id)
          );
          // 本地摄像头已经在列表最前面，不需要重新添加
          if (filteredFound.length === 0) {
            return prev;
          }
          return [...prev, ...filteredFound];
        });

        if (foundCameras.length === 0) {
          message.info('未找到USB相机设备');
          addLog(' 未找到USB相机设备');
        } else {
          message.success(`找到 ${foundCameras.length} 个USB相机设备`);
          addLog(` 找到 ${foundCameras.length} 个USB相机设备`);

          foundCameras.forEach((cam) => {
            addLog(` ${cam.name} - ${cam.default_stream_profile.width}x${cam.default_stream_profile.height}@${cam.default_stream_profile.fps}fps`);
          });
        }
      } else {
        message.error(response.data.message || '查找相机失败');
        addLog(` 查找相机失败: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error finding cameras:', error);
      message.error('查找相机失败');
      addLog(` 查找相机失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 清除列表
  const handleClearList = () => {
    Modal.confirm({
      title: '确认清除',
      content: '确定要清除相机列表和日志吗?',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        setCameras([]);
        setSelectedRowKeys([]);
        onCamerasChange?.([]);
        addLog(' 已清除相机列表');
        message.success('已清除列表');
      },
    });
  };

  // 使用ref防止重复打开预览
  const isOpeningPreviewRef = useRef(false);

  // 处理预览 - 将预览逻辑交给父组件处理
  const handlePreview = (camera: CameraInfo) => {
    // 防止重复调用
    if (isOpeningPreviewRef.current) {
      console.log('[CameraFinder] Already opening preview, skip duplicate call');
      return;
    }

    isOpeningPreviewRef.current = true;
    addLog(`打开相机预览: ${camera.name}`);

    // 调用父组件的预览回调，传入本地流（如果是本地摄像头）
    const stream = camera.type === 'LocalCamera' ? internalLocalStream : null;
    onPreviewCamera?.(camera, stream);

    // 延迟重置标志，防止快速重复点击
    setTimeout(() => {
      isOpeningPreviewRef.current = false;
    }, 500);
  };

  // 行选择配置
  const rowSelection = {
    type: 'checkbox' as const,
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);

      // 从rowKey找到对应的CameraInfo对象
      const selectedCameraInfos = cameras.filter((cam) => {
        const rowKey = `${cam.type}-${cam.id}`;
        return newSelectedRowKeys.includes(rowKey);
      });

      // 通知父组件选中的完整CameraInfo对象
      onCamerasChange?.(selectedCameraInfos);

      if (newSelectedRowKeys.length > 0) {
        addLog(`已选择 ${newSelectedRowKeys.length} 个相机`);
      } else {
        addLog(`已清除相机选择`);
      }
    },
  };

  // 表格列定义
  const columns = [
    {
      title: '相机名称',
      dataIndex: 'name',
      key: 'name',
      width: 250,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: '设备标识',
      dataIndex: 'id',
      key: 'id',
      width: 150,
      render: (id: number | string) => String(id),
    },
    {
      title: '后端 API',
      dataIndex: 'backend_api',
      key: 'backend_api',
      width: 120,
    },
    {
      title: '分辨率',
      key: 'resolution',
      width: 120,
      render: (_: any, record: CameraInfo) => {
        const { width, height } = record.default_stream_profile;
        return `${width}x${height}`;
      },
    },
    {
      title: '帧率',
      key: 'fps',
      width: 80,
      render: (_: any, record: CameraInfo) => {
        return `${record.default_stream_profile.fps} fps`;
      },
    },
    {
      title: 'FOURCC',
      key: 'fourcc',
      width: 100,
      render: (_: any, record: CameraInfo) => {
        return record.default_stream_profile.fourcc;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: CameraInfo) => (
        <Button
          type="link"
          size="small"
          icon={<CameraOutlined />}
          onClick={() => handlePreview(record)}
        >
          预览
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space direction="vertical" className="camera-finder-space" size="large">
        {/* 操作按钮区 */}
        <Space>
          <Button
            type="primary"
            icon={<CameraOutlined />}
            loading={loading}
            onClick={handleFindCamera}
          >
            查找相机
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={handleClearList}
            disabled={cameras.length === 0}
          >
            清除列表
          </Button>
        </Space>

        {/* 提示信息 */}
        {cameras.length > 0 && (
          <div style={{ color: '#666', fontSize: '13px', marginTop: -8 }}>
            提示：勾选要使用的相机（已选择 {selectedRowKeys.length} 个）
          </div>
        )}

        {/* 相机列表表格 */}
        <Table
          columns={columns}
          dataSource={cameras}
          rowKey={(record) => `${record.type}-${record.id}`}
          size="small"
          pagination={false}
          rowSelection={rowSelection}
          locale={{ emptyText: '未找到相机,请点击"查找相机"开始查找' }}
        />
      </Space>
    </div>
  );
}

export default CameraFinder;
