import { Card, Form, Select, Input, Space, Button, Progress, Alert, Typography } from 'antd';
import { PlayCircleOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface ModelDeployProps {
  onLog?: (message: string) => void;
}

type DeployStatus = 'idle' | 'deploying' | 'success' | 'error';

function ModelDeploy({ onLog }: ModelDeployProps) {
  const [form] = Form.useForm();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle');
  const [progress, setProgress] = useState(0);

  const addLog = (msg: string) => onLog?.(msg);

  const handleDeploy = async () => {
    try {
      const values = await form.validateFields();
      setDeployStatus('deploying');
      setProgress(0);
      addLog(`开始下发模型: ${values.modelName}`);
      addLog(`目标地址: ${values.boardIp}`);
      addLog('正在压缩模型...');
      setProgress(20);

      // 模拟进度
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          addLog(`发送进度: ${prev + 10}%`);
          return prev + 10;
        });
      }, 500);

      // 模拟部署完成
      setTimeout(() => {
        clearInterval(interval);
        setProgress(100);
        setDeployStatus('success');
        addLog('模型下发成功！');
      }, 5000);
    } catch (error) {
      addLog(`下发失败: ${error}`);
      setDeployStatus('error');
    }
  };

  return (
    <Card title="模型下发" styles={{ body: { paddingTop: 16 } }}>
      <Alert
        type="info"
        showIcon
        message="将训练好的模型下发到机器人主板"
        description="通过 SSH 将模型压缩包发送到指定的主板进行部署。"
        style={{ marginBottom: 12 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          modelName: '',
          boardIp: '',
        }}
      >
        <Form.Item
          label="模型选择"
          name="modelName"
          rules={[{ required: true, message: '请选择要下发的模型' }]}
        >
          <Select placeholder="选择已训练好的模型">
            <Select.Option value="act_so100_test">act_so100_test</Select.Option>
            <Select.Option value="pi0_so101_test">pi0_so101_test</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="主板 IP"
          name="boardIp"
          rules={[{ required: true, message: '请输入主板 IP' }]}
        >
          <Input placeholder="请输入" />
        </Form.Item>

        <Form.Item
          label="主板密码"
          name="boardPassword"
          rules={[{ required: true, message: '请输入主板密码' }]}
        >
          <Input.Password
            placeholder="请输入"
            visibilityToggle={{
              visible: passwordVisible,
              onVisibleChange: setPasswordVisible,
            }}
            iconRender={(visible) =>
              visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
            }
          />
        </Form.Item>

        <Alert
          type="warning"
          showIcon
          icon={<></>}
          message="模型压缩成数据包 ssh 发送 发送到指定的文件夹"
          style={{ marginBottom: 16 }}
        />

        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleDeploy}
            disabled={deployStatus === 'deploying'}
          >
            开始下发
          </Button>
        </Space>
      </Form>

      {/* 发送进度 */}
      {deployStatus !== 'idle' && (
        <div style={{ marginTop: 24 }}>
          <Typography.Text strong>发送进度</Typography.Text>
          <Progress
            percent={progress}
            status={
              deployStatus === 'success'
                ? 'success'
                : deployStatus === 'error'
                ? 'exception'
                : 'active'
            }
            strokeColor={
              deployStatus === 'success'
                ? '#52c41a'
                : deployStatus === 'error'
                ? '#ff4d4f'
                : '#faad14'
            }
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            {deployStatus === 'success' && <span style={{ color: '#52c41a' }}>成功</span>}
            {deployStatus === 'error' && <span style={{ color: '#ff4d4f' }}>失败</span>}
            {deployStatus === 'deploying' && <span style={{ color: '#faad14' }}>传输中...</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

export default ModelDeploy;
