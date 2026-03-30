import { useState, useRef } from 'react';
import { Button, Modal, Table, Space, message } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import type { CameraInfo } from '@/types';
import { cameraApi } from '@/services/api';
import CameraPreview from '@/components/CameraPreview';
import './CameraFinder.css';

interface CameraFinderProps {
  onCamerasChange?: (cameras: CameraInfo[]) => void;
  onLog?: (message: string) => void;
}

function CameraFinder({ onCamerasChange, onLog }: CameraFinderProps) {
  const [loading, setLoading] = useState(false);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [previewCamera, setPreviewCamera] = useState<CameraInfo | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // 选中的相机列表
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[CameraFinder]', msg);
    onLog?.(msg);
  };

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
        setCameras(foundCameras);

        if (foundCameras.length === 0) {
          message.info('未找到相机设备');
          addLog(' 未找到相机设备');
        } else {
          message.success(`找到 ${foundCameras.length} 个相机设备`);
          addLog(` 找到 ${foundCameras.length} 个相机设备`);

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

  // 处理预览
  const handlePreview = (camera: CameraInfo) => {
    // 防止重复调用
    if (isOpeningPreviewRef.current) {
      console.log('[CameraFinder] Already opening preview, skip duplicate call');
      return;
    }

    isOpeningPreviewRef.current = true;
    setPreviewCamera(camera);
    setPreviewVisible(true);
    addLog(`📹 打开相机预览: ${camera.name}`);

    // 延迟重置标志，防止快速重复点击
    setTimeout(() => {
      isOpeningPreviewRef.current = false;
    }, 500);
  };

  // 关闭预览
  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewCamera(null);
    addLog(` 关闭相机预览`);
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
        addLog(`✅ 已选择 ${newSelectedRowKeys.length} 个相机`);
      } else {
        addLog(`🔄 已清除相机选择`);
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
            💡 提示：勾选要使用的相机（已选择 {selectedRowKeys.length} 个）
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

      {/* 相机预览弹窗 */}
      {previewCamera && (
        <CameraPreview
          cameraId={String(previewCamera.id)}
          cameraName={previewCamera.name}
          visible={previewVisible}
          onClose={handleClosePreview}
          onLog={addLog}
        />
      )}
    </div>
  );
}

export default CameraFinder;
