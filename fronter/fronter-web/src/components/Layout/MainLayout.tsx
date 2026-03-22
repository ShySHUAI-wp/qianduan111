import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { HomeOutlined, ToolOutlined, PlayCircleOutlined, VideoCameraOutlined, RobotOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import styles from './MainLayout.module.css';

const { Sider, Content } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

const menuItems: MenuItem[] = [
  {
    key: '/home',
    icon: <HomeOutlined />,
    label: '首页',
  },
  {
    key: '/calibration',
    icon: <ToolOutlined />,
    label: '设备标定',
  },
  {
    key: '/robot-control?tab=teleoperation',
    icon: <PlayCircleOutlined />,
    label: '动作示教',
  },
  {
    key: '/robot-control?tab=recording',
    icon: <VideoCameraOutlined />,
    label: '数据采集',
  },
  {
    key: '/robot-control?tab=training',
    icon: <RobotOutlined />,
    label: '模型训练',
  },
  {
    key: '/robot-control?tab=inference',
    icon: <RobotOutlined />,
    label: '实机部署',
  },
];

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [siderWidth, setSiderWidth] = useState(260); // 默认宽度 260px
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(260);

  // 获取当前选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/home')) return '/home';
    if (path.startsWith('/calibration')) return '/calibration';
    if (path.startsWith('/robot-control')) {
      const p = new URLSearchParams(location.search);
      const tab = p.get('tab') || 'teleoperation';
      return `/robot-control?tab=${tab}`;
    }
    return '/home';
  };

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  // 开始拖动
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = siderWidth;
  };

  // 拖动中
  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const delta = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + delta;

    // 限制宽度范围：200px - 500px
    if (newWidth >= 200 && newWidth <= 500) {
      setSiderWidth(newWidth);
    }
  };

  // 结束拖动
  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // 添加和移除事件监听
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <Layout className={styles.layout}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={siderWidth}
        className={styles.sider}
        style={{ position: 'relative' }}
      >
        <div className={styles.siderHeader}>
          {collapsed ? (
            <div className={styles.collapsedText}>夺锦</div>
          ) : (
            <div className={styles.titleText} style={{ fontSize: `${Math.max(12, Math.min(18, siderWidth / 18))}px` }}>
              夺锦智能{'\n'}DJ02型机器人控制面板
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0 }}
        />

        {/* 拖动手柄 */}
        {!collapsed && (
          <div
            className={styles.resizeHandle}
            onMouseDown={handleMouseDown}
          />
        )}
      </Sider>
      <Layout>
        <Content className={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
