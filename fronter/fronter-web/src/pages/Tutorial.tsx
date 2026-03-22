import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

function Tutorial() {
  return (
    <div>
      <Title level={2}>教程</Title>
      <Paragraph>
        教程页面功能正在开发中...
      </Paragraph>
      <Paragraph>
        此页面将显示 fronter/turtorial 目录下的 Markdown 文档。
      </Paragraph>
    </div>
  );
}

export default Tutorial;
