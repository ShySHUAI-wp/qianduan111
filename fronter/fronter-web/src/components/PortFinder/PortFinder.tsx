import { useEffect, useState } from 'react';
import { Button, Modal, Table, Tag, Space, message, Divider, Typography } from 'antd';
import { UsbOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import type { PortInfo, PortPermission } from '@/types';
import { portApi } from '@/services/api';
import './PortFinder.css';

interface PortFinderProps {
  onPortsChange?: (ports: string[]) => void;
  onLog?: (message: string) => void;
  maxSelection?: number; // 最大选择数量，undefined表示不限制
  selectionType?: 'checkbox' | 'radio'; // 选择类型：复选框或单选框
}

// 查找步骤枚举
enum FindStep {
  IDLE = 'idle',
  SCAN = 'scan',
  INSERT_PROMPT = 'insert_prompt',
  REMOVE_PROMPT = 'remove_prompt',
  REINSERT_PROMPT = 'reinsert_prompt',
}

function PortFinder({ onPortsChange, onLog, maxSelection, selectionType = 'checkbox' }: PortFinderProps) {
  const [loading, setLoading] = useState(false);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portPermissions, setPortPermissions] = useState<Map<string, PortPermission>>(new Map());

  // 选中的端口列表
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 查找端口流程状态
  const [findStep, setFindStep] = useState<FindStep>(FindStep.IDLE);
  const [modalVisible, setModalVisible] = useState(false);
  const [portsBefore, setPortsBefore] = useState<string[]>([]);
  // const [targetPort, setTargetPort] = useState<string | null>(null);
  const [targetPorts, setTargetPorts] = useState<string[]>([]);
  const [lingzhiPorts, setLingzhiPorts] = useState<PortInfo[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // 添加日志
  const addLog = (msg: string) => {
    console.log('[PortFinder]', msg);
    onLog?.(msg);
  };

  // 获取当前端口列表(仅路径)
  const getCurrentPorts = async (): Promise<string[]> => {
    try {
      const response = await portApi.list();
      if (response.data.code === 0 && response.data.data) {
        return response.data.data.ports.map((p: PortInfo) => p.path);
      }
      return [];
    } catch (error) {
      console.error('Error getting current ports:', error);
      return [];
    }
  };

  const loadPortsList = async () => {
    const response = await portApi.list();
    if (response.data.code === 0 && response.data.data) {
      const allPorts: PortInfo[] = response.data.data.ports;
      setPorts(allPorts);
      // 后端是跨平台的，这里用”包含 lingzhi_”的通用规则做快速识别（匹配 path / description / hwid）
      const fast = allPorts.filter((p) => {
        const s = `${p.path} ${p.description ?? ''} ${p.hwid ?? ''}`.toLowerCase();
        return s.includes('lingzhi_');
      });
      setLingzhiPorts(fast);
      setScanError(null);

      // 预热权限检查（只检查当前列表里出现的）
      for (const p of allPorts) {
        // 不 await，避免阻塞渲染
        void checkPortPermission(p.path);
      }
    } else {
      setScanError(response.data.message || '端口列表获取失败');
    }
  };

  // 检查端口权限
  const checkPortPermission = async (port: string) => {
    try {
      const response = await portApi.checkPermission(port);
      if (response.data.code === 0 && response.data.data) {
        setPortPermissions((prev) => {
          const newMap = new Map(prev);
          newMap.set(port, response.data.data);
          return newMap;
        });
      }
    } catch (error) {
      console.error(`Error checking permission for ${port}:`, error);
    }
  };

  // 授予端口权限
  const grantPermission = async (port: string) => {
    try {
      const response = await portApi.grantPermission(port);
      if (response.data.code === 0) {
        message.success('权限已授予');
        await checkPortPermission(port);
        addLog(` 已授予 ${port} 读写权限`);
      } else {
        message.error(response.data.message || '授予权限失败');
      }
    } catch (error) {
      console.error(`Error granting permission for ${port}:`, error);
      message.error('授予权限失败');
    }
  };

  // 添加端口到列表（修改：仅添加到显示列表，不自动选中）
  const addPortToList = async (portPath: string) => {
    try {
      const response = await portApi.list();
      if (response.data.code === 0 && response.data.data) {
        const allPorts: PortInfo[] = response.data.data.ports;
        const foundPort = allPorts.find((p) => p.path === portPath);

        if (foundPort) {
          setPorts((prevPorts) => {
            // 检查是否已存在
            const isDuplicate = prevPorts.some((p) => p.path === portPath);
            if (isDuplicate) return prevPorts;

            const newPorts = [...prevPorts, foundPort];
            addLog(` 已将 ${portPath} 添加到列表`);
            return newPorts;
          });

          // 检查权限
          await checkPortPermission(portPath);
          message.success(`成功找到端口: ${portPath}`);
        }
      }
    } catch (error) {
      console.error('Error adding port to list:', error);
    }
  };

  // ========== 查找端口流程 ==========

  // 开始查找端口
  const handleFindPort = () => {
    setFindStep(FindStep.SCAN);
    setModalVisible(true);
    addLog(' 开始端口查找：自动扫描中...');
  };

  useEffect(() => {
    if (!modalVisible) return;
    if (findStep !== FindStep.SCAN) return;

    setLoading(true);
    void (async () => {
      try {
        await loadPortsList();
        addLog(' 自动扫描完成');
      } catch (e: any) {
        setScanError(e?.message || '自动扫描失败');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible, findStep]);

  // 步骤1: 插入USB后确认
  const handleInsertConfirm = async () => {
    setLoading(true);
    addLog(' 正在检查当前端口列表...');

    const currentPorts = await getCurrentPorts();
    setPortsBefore(currentPorts);

    addLog(` 当前端口: ${currentPorts.join(', ') || '(无)'}`);

    setFindStep(FindStep.REMOVE_PROMPT);
    setLoading(false);
  };

  // 步骤2: 拔掉USB后确认
  const handleRemoveConfirm = async () => {
    setLoading(true);
    addLog(' 正在检查端口变化...');

    const currentPorts = await getCurrentPorts();

    // 比对找出减少的端口
    const removedPorts = portsBefore.filter((p) => !currentPorts.includes(p));

    if (removedPorts.length === 0) {
      message.error('未检测到端口变化,请确认已拔掉USB串口');
      addLog(' 未检测到端口变化');
      setLoading(false);
      return;
    }

    // 仅仅允许单个端口被检测
    // if (removedPorts.length > 1) {
    //   message.warning(`检测到多个端口变化: ${removedPorts.join(', ')},将使用第一个`);
    //   addLog(` 检测到多个端口变化: ${removedPorts.join(', ')}`);
    // }

    const target = removedPorts;
    // 如果设计成单个端口使用
    // setTargetPort(removedPorts[0])
    setTargetPorts(target);
    addLog(` 目标端口列表: ${target}`);

    setFindStep(FindStep.REINSERT_PROMPT);
    setLoading(false);
  };

  // 步骤3: 重新插入USB后确认
  const handleReinsertConfirm = async () => {
    setLoading(true);
    addLog(' 正在检查端口是否重新出现...');

    // 当前所有ports string[]    targetPorts
    const currentPorts = await getCurrentPorts();

    const foundPorts: string[] = [];
    
    for (const port of targetPorts) {
      if (currentPorts.includes(port)) {
        foundPorts.push(port);
        addLog(` 成功找到端口: ${port}`);
        await addPortToList(port);
      }
      else {
        message.error(`端口: ${port}未找到,请确认重新插入该USB串口`);
        addLog(` 端口: ${port}未找到,请确认重新插入该USB串口`);
      }
    }

    // 取消任务
    setModalVisible(false);
    setFindStep(FindStep.IDLE);
    setPortsBefore([]);
    setTargetPorts([]);
    setLoading(false);
  };

  // 取消查找
  const handleFindCancel = () => {
    setModalVisible(false);
    setFindStep(FindStep.IDLE);
    setPortsBefore([]);
    setTargetPorts([]);
    addLog(' 已取消端口查找');
  };

  // 根据当前步骤返回弹窗内容
  const getModalContent = () => {
    switch (findStep) {
      case FindStep.SCAN:
        return {
          title: '查找端口',
          content: (
            <div>
              <Typography.Paragraph style={{ marginBottom: 8 }}>
                说明：将自动扫描已挂载设备（优先识别 <Typography.Text code>lingzhi_</Typography.Text>），如果未命中再进入交互式查找流程。
              </Typography.Paragraph>

              <Divider style={{ margin: '12px 0' }} />

              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography.Text strong>快速识别（lingzhi_）</Typography.Text>
                <Button size="small" onClick={() => void loadPortsList()} loading={loading}>
                  刷新
                </Button>
              </div>

              {scanError ? (
                <Typography.Text type="danger">{scanError}</Typography.Text>
              ) : lingzhiPorts.length === 0 ? (
                <Typography.Text type="secondary">
                  未识别到 <Typography.Text code>lingzhi_</Typography.Text> 设备。可点击下方“进入交互式查找”继续。
                </Typography.Text>
              ) : (
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                  <Table
                    columns={[
                      { title: '端口路径', dataIndex: 'path', key: 'path', width: 220 },
                      { title: '描述', dataIndex: 'description', key: 'description' },
                      { title: '硬件ID', dataIndex: 'hwid', key: 'hwid' },
                    ]}
                    dataSource={lingzhiPorts}
                    rowKey="path"
                    size="small"
                    pagination={false}
                    rowSelection={{
                      type: 'radio' as const,
                      selectedRowKeys,
                      onChange: (keys: React.Key[]) => {
                        setSelectedRowKeys(keys);
                        onPortsChange?.(keys as string[]);
                        if (keys.length) addLog(`已选择端口: ${keys.join(', ')}`);
                      },
                    }}
                  />
                </div>
              )}

              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text strong>交互式查找</Typography.Text>
              <Typography.Paragraph style={{ margin: '6px 0 0', color: '#666' }}>
                如果你的设备不会以 <Typography.Text code>lingzhi_</Typography.Text> 命名，请使用插拔 USB 的三步查找法。
              </Typography.Paragraph>
            </div>
          ),
          onOk: () => setFindStep(FindStep.INSERT_PROMPT),
          okText: '进入交互式查找',
          cancelText: '关闭',
        };
      case FindStep.INSERT_PROMPT:
        return {
          title: '查找端口 - 步骤 1/3',
          content: <p>请插入要查找的 USB 串口,然后点击确定。</p>,
          onOk: handleInsertConfirm,
        };
      case FindStep.REMOVE_PROMPT:
        return {
          title: '查找端口 - 步骤 2/3',
          content: <p>请拔掉刚才插入的 USB 串口,然后点击确定。</p>,
          onOk: handleRemoveConfirm,
        };
      case FindStep.REINSERT_PROMPT:
        return {
          title: '查找端口 - 步骤 3/3',
          content: (
            <div className="port-finder-modal-content">
              <p>检测到端口: <strong>{targetPorts.join(',  ')}</strong></p>
              <p>请重新插入 USB 串口,然后点击确定完成查找。</p>
            </div>
          ),
          onOk: handleReinsertConfirm,
        };
      default:
        return null;
    }
  };

  // 清除列表
  const handleClearList = () => {
    Modal.confirm({
      title: '确认清除',
      content: '确定要清除端口列表吗?',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        setPorts([]);
        setPortPermissions(new Map());
        setSelectedRowKeys([]);
        onPortsChange?.([]);
        addLog(' 已清除端口列表');
        message.success('已清除列表');
      },
    });
  };

  // 行选择配置
  const rowSelection = {
    type: selectionType,
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      // 检查最大选择数量限制
      if (maxSelection && newSelectedRowKeys.length > maxSelection) {
        message.warning(`最多只能选择 ${maxSelection} 个端口`);
        return;
      }

      setSelectedRowKeys(newSelectedRowKeys);
      // 通知父组件选中的端口
      onPortsChange?.(newSelectedRowKeys as string[]);

      if (newSelectedRowKeys.length > 0) {
        addLog(`已选择端口: ${newSelectedRowKeys.join(', ')}`);
      } else {
        addLog(`已清除端口选择`);
      }
    },
    // 当达到最大选择数量时，禁用其他未选中的行
    getCheckboxProps: (record: PortInfo) => ({
      disabled: maxSelection !== undefined &&
                selectedRowKeys.length >= maxSelection &&
                !selectedRowKeys.includes(record.path),
    }),
  };

  // 表格列定义
  const columns = [
    {
      title: '端口路径',
      dataIndex: 'path',
      key: 'path',
      width: 200,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '硬件ID',
      dataIndex: 'hwid',
      key: 'hwid',
    },
    {
      title: '权限',
      key: 'permission',
      width: 150,
      render: (_: any, record: PortInfo) => {
        const permission = portPermissions.get(record.path);
        if (!permission) {
          return <Tag>检查中...</Tag>;
        }

        const hasPermission = permission.readable && permission.writable;
        return (
          <Space>
            {hasPermission ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                可读写
              </Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="error">
                无权限
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: PortInfo) => {
        const permission = portPermissions.get(record.path);
        const hasPermission = permission?.readable && permission?.writable;

        return (
          <Space>
            {!hasPermission && (
              <Button
                type="link"
                size="small"
                onClick={() => grantPermission(record.path)}
              >
                授权
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const modalContent = getModalContent();

  return (
    <div>
      <Space direction="vertical" className="port-finder-space" size="large">
        {/* 操作按钮区 */}
        <Space>
          <Button
            type="primary"
            icon={<UsbOutlined />}
            loading={loading}
            onClick={handleFindPort}
            disabled={findStep !== FindStep.IDLE}
          >
            查找端口
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={handleClearList}
            disabled={ports.length === 0}
          >
            清除列表
          </Button>
        </Space>

        {/* 提示信息 */}
        {ports.length > 0 && (
          <div style={{ color: '#666', fontSize: '13px', marginTop: -8 }}>
            提示：{selectionType === 'radio' ? '选择' : '勾选'}要使用的端口
            （已选择 {selectedRowKeys.length}
            {maxSelection ? ` / ${maxSelection}` : ''} 个）
          </div>
        )}

        {/* 端口列表表格 */}
        <Table
          columns={columns}
          dataSource={ports}
          rowKey="path"
          size="small"
          pagination={false}
          rowSelection={rowSelection}
          locale={{ emptyText: '未找到端口,请点击"查找端口"开始查找' }}
        />
      </Space>

      {/* 多步骤弹窗 */}
      {modalContent && (
        <Modal
          title={modalContent.title}
          open={modalVisible}
          onOk={modalContent.onOk}
          onCancel={handleFindCancel}
          okText={(modalContent as any).okText || '确定'}
          cancelText={(modalContent as any).cancelText || '取消'}
          confirmLoading={loading}
          width={900}
        >
          {modalContent.content}
        </Modal>
      )}
    </div>
  );
}

export default PortFinder;
