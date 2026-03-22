import { Typography, Alert } from 'antd';

const { Title, Paragraph } = Typography;

function ChassisControl() {
  return (
    <div>
      <Title level={2}>底盘控制</Title>
      <Alert
        message="功能预留"
        description="底盘控制功能暂未实现，该模块将用于 ROS2 导航和 FoxGlove 可视化。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Paragraph>
        计划实现的功能：
      </Paragraph>
      <ul>
        <li>嵌入 FoxGlove 页面（通过 iframe）</li>
        <li>启动 ROS2 launch 文件</li>
        <li>向指定话题发布消息</li>
      </ul>
    </div>
  );
}

export default ChassisControl;
