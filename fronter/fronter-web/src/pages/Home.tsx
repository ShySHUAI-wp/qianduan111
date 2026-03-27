import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Drawer,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { LinkOutlined, DisconnectOutlined, ToolOutlined, ThunderboltOutlined, SearchOutlined } from '@ant-design/icons';
import { wsService } from '@/services/socket';
import PortFinder from '@/components/PortFinder';
import DigitalTwin from '@/components/DigitalTwin';
import type { PortInfo } from '@/types';

const { Title, Text, Paragraph } = Typography;

type ConnState = 'disconnected' | 'connecting' | 'connected';

function Home() {
  const [conn, setConn] = useState<ConnState>('disconnected');
  const [info, setInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<null | 'storage' | 'pointcloud'>(null);
  const [actionDrawer, setActionDrawer] = useState<null | 'connect' | 'search' | 'misc'>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinPorts, setPinPorts] = useState<PortInfo[]>([]);
  const [pinPort, setPinPort] = useState<string>('');
  const [pinAlias, setPinAlias] = useState<string>('');
  const [pinHelpOpen, setPinHelpOpen] = useState(false);
  const [pinHelpSelected, setPinHelpSelected] = useState<string[]>([]);

  const statusTag = useMemo(() => {
    if (conn === 'connected') return <Tag color="green">连接状态：成功</Tag>;
    if (conn === 'connecting') return <Tag color="gold">连接状态：连接中</Tag>;
    return <Tag color="red">连接状态：未连接</Tag>;
  }, [conn]);

  const refreshInfo = async () => {
    setLoadingInfo(true);
    try {
      const resp = await wsService.systemInfo();
      if (resp.code === 0) setInfo(resp.data);
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    void refreshInfo();
  }, []);

  const handleConnect = async () => {
    setConn('connecting');
    // 这里优先用 health/info 做”前端接入”的轻量握手；后续可对接 rosbridge websocket
    try {
      await wsService.systemHealth();
      await refreshInfo();
      setConn('connected');
      message.success('设备连接成功');
    } catch {
      setConn('disconnected');
      message.error('连接失败：请检查后端服务是否启动');
    }
  };

  const handleDisconnect = () => {
    Modal.confirm({
      title: '确认断开连接？',
      content: '断开后将停止前端数据流入（订阅/渲染会暂停），以降低 CPU 占用。',
      okText: '断开',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => setConn('disconnected'),
    });
  };

  const openPinTool = async () => {
    setPinModalOpen(true);
    setPinPort('');
    setPinAlias('');
    try {
      const resp = await wsService.portsList();
      if (resp.code === 0 && resp.data) {
        setPinPorts(resp.data.ports || []);
      }
    } catch {
      // ignore
    }
  };

  const savePinnedPort = () => {
    if (!pinPort) {
      message.error('请选择端口');
      return;
    }
    const payload = { port: pinPort, alias: pinAlias?.trim() || '' };
    localStorage.setItem('dj_pinned_port', JSON.stringify(payload));
    message.success('串口固定已保存（本机浏览器）');
    setPinModalOpen(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <Title level={2} style={{ margin: 0 }}>
          首页
        </Title>
        <Space size="middle">
          {statusTag}
        </Space>
      </div>

      <Row gutter={16} align="stretch">
        <Col xs={24} xl={15}>
          <Card title="机器人状态显示（数字孪生）" styles={{ body: { paddingTop: 12 } }}>
            <DigitalTwin enabled={conn === 'connected'} />
            <div style={{ marginTop: 10, textAlign: 'center', color: 'rgba(0,0,0,0.65)' }}>
              机器人状态显示（数字孪生）
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Card
              title="存储空间状态展示"
              extra={<Text type="secondary">通过 ros 包获取硬盘信息</Text>}
              styles={{ body: { paddingTop: 12 } }}
              loading={loadingInfo}
              onClick={() => setActiveDrawer('storage')}
              hoverable
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">点击查看详情</Text>
                <Button size="small" onClick={(e) => { e.stopPropagation(); void refreshInfo(); }}>
                  刷新
                </Button>
              </div>
            </Card>

            <Card
              title="雷达点云图信息展示"
              styles={{ body: { paddingTop: 12 } }}
              onClick={() => setActiveDrawer('pointcloud')}
              hoverable
            >
              <Text type="secondary">点击查看详情（点云/scan 可视化占位）</Text>
            </Card>

            <Card styles={{ body: { paddingTop: 12 } }}>
              <Space wrap>
                <Button icon={<ToolOutlined />} onClick={openPinTool}>
                  串口固定工具
                </Button>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => setActionDrawer('misc')}
                >
                  不重要的功能
                </Button>
              </Space>

              <div style={{ height: 10 }} />

              <Space wrap>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={() => {
                    setActionDrawer('connect');
                    void handleConnect();
                  }}
                  disabled={conn !== 'disconnected'}
                >
                  连接设备
                </Button>
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={handleDisconnect}
                  disabled={conn === 'disconnected'}
                >
                  断开设备
                </Button>
              </Space>

              <div style={{ height: 10 }} />

              <Space wrap>
                <Button
                  icon={<SearchOutlined />}
                  onClick={() => setActionDrawer('search')}
                >
                  查找设备
                </Button>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* 详情抽屉：所有按钮都可点开详情 */}
      <Drawer
        title={activeDrawer === 'storage' ? '存储空间状态详情' : '雷达点云详情'}
        open={activeDrawer !== null}
        onClose={() => setActiveDrawer(null)}
        width={520}
      >
        {activeDrawer === 'storage' ? (
          <div>
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              此处展示后端采集到的系统/存储信息（当前使用 `system/info` 作为占位数据源）。
            </Paragraph>
            <pre style={{ marginTop: 8, marginBottom: 0, maxHeight: 520, overflow: 'auto', background: '#fafafa', padding: 12 }}>
              {info ? JSON.stringify(info, null, 2) : '暂无数据'}
            </pre>
          </div>
        ) : (
          <div>
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              点云可视化需要后端提供 `/scan` 转换后的点云/栅格数据流。这里先提供 UI 框架与详情容器。
            </Paragraph>
            <Card title="点云画布（占位）" styles={{ body: { height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}>
              <Text type="secondary">等待点云数据源接入</Text>
            </Card>
          </div>
        )}
      </Drawer>

      {/* 操作详情抽屉 */}
      <Drawer
        title={
          actionDrawer === 'connect'
            ? '连接设备详情'
            : actionDrawer === 'search'
            ? '查找设备详情'
            : '功能详情'
        }
        open={actionDrawer !== null}
        onClose={() => setActionDrawer(null)}
        width={520}
      >
        {actionDrawer === 'connect' && (
          <div>
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              激活阶段：前端连接到后端服务后，可继续接入 rosbridge WebSocket 订阅话题并驱动数字孪生。
            </Paragraph>
            <Card size="small" title="当前状态">
              <Space direction="vertical">
                <Text>连接状态：{conn}</Text>
                <Text type="secondary">当前使用 `health/info` 进行基础握手；后续可扩展订阅 `/joint_states`、`/tf` 等。</Text>
              </Space>
            </Card>
          </div>
        )}
        {actionDrawer === 'search' && (
          <div>
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              推荐路径：进入“机械臂控制”页的“查找端口/查找相机”完成配置。
            </Paragraph>
            <Card size="small" title="快捷说明">
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                <li>端口：支持自动识别 `lingzhi_`，或插拔式三步查找。</li>
                <li>相机：支持列表查找与预览。</li>
              </ul>
            </Card>
          </div>
        )}
        {actionDrawer === 'misc' && (
          <div>
            <Paragraph type="secondary" style={{ marginTop: 0 }}>
              该按钮用于放置非关键功能入口（示例）。你可以在这里添加开关、设备参数、调试面板等。
            </Paragraph>
            <Card size="small" title="示例：提示">
              <Text type="secondary">此处已预留“详情抽屉”，后续接入真实功能即可。</Text>
            </Card>
          </div>
        )}
      </Drawer>

      {/* 串口固定工具 */}
      <Modal
        title="串口固定工具：防止舵机板端口号变动"
        open={pinModalOpen}
        onOk={savePinnedPort}
        onCancel={() => setPinModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          说明：复用“校准 - 查找端口”页面的弹窗逻辑，便于在不同场景下统一端口编号。
        </Paragraph>
        <div
          style={{
            marginTop: 12,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 24,
            background: '#fff',
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={20}>
            {/* 端口行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 60, textAlign: 'right' }}>
                <Text>端口：</Text>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <Select
                  style={{ minWidth: 220, flex: 1 }}
                  placeholder="请选择端口"
                  value={pinPort || undefined}
                  onChange={(v) => setPinPort(v)}
                  options={pinPorts.map((p) => ({ value: p.path, label: p.path }))}
                />
                <Button onClick={() => setPinHelpOpen(true)}>查找端口</Button>
              </div>
            </div>

            {/* 别名行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 60, textAlign: 'right' }}>
                <Text>别名：</Text>
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  value={pinAlias}
                  onChange={(e) => setPinAlias(e.target.value)}
                  placeholder="请输入端口别名"
                />
              </div>
            </div>
          </Space>
        </div>
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          具体流程可参考文档中的“串口固定工具”章节；保存后配置将写入本机浏览器，用于后续页面的默认端口选择。
        </Paragraph>
      </Modal>

      {/* 串口固定工具 - 查找端口弹窗（复用 PortFinder 的 lingzhi_ + 交互式流程） */}
      <Modal
        title="查找端口"
        open={pinHelpOpen}
        onCancel={() => setPinHelpOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPinHelpOpen(false)}>
            关闭
          </Button>,
          <Button
            key="use"
            type="primary"
            disabled={pinHelpSelected.length === 0}
            onClick={() => {
              if (pinHelpSelected[0]) setPinPort(pinHelpSelected[0]);
              setPinHelpOpen(false);
              message.success(`已选择端口：${pinHelpSelected[0]}`);
            }}
          >
            使用所选端口
          </Button>,
        ]}
        width={900}
      >
        <PortFinder
          selectionType="radio"
          maxSelection={1}
          onPortsChange={(ports) => setPinHelpSelected(ports)}
          onLog={(m) => console.log('[PinTool]', m)}
        />
      </Modal>
    </div>
  );
}

export default Home;

