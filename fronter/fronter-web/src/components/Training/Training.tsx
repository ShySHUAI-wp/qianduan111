import { Card, Form, Input, Select, InputNumber, Space, Button, Switch, Typography, Alert } from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';

interface TrainingProps {
  onLog?: (message: string) => void;
}

function Training({ onLog }: TrainingProps) {
  const [form] = Form.useForm();

  const addLog = (msg: string) => onLog?.(msg);

  return (
    <div>
      <Card title="模型训练" styles={{ body: { paddingTop: 16 } }}>
        <Alert
          type="info"
          showIcon
          message="训练任务会把日志输出到右侧控制台"
          description="此页面仅做前端流程与配置收敛；若后端尚未提供训练接口，点击开始训练将不会生效。"
          style={{ marginBottom: 12 }}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            datasetName: 'my_dataset',
            modelType: 'ACT',
            expName: 'act_so100_test',
            steps: 100000,
            batchSize: 4,
            device: 'cuda',
            saveLog: true,
          }}
        >
          <Form.Item
            label="数据集"
            name="datasetName"
            rules={[{ required: true, message: '请选择或输入数据集名称' }]}
            extra="与采集时的数据集名称保持一致（将从本地缓存路径中查找）"
          >
            <Input placeholder="my_dataset" />
          </Form.Item>

          <Form.Item label="模型类型" name="modelType" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ACT', label: 'ACT（推荐）' },
                { value: 'pi0', label: 'pi0' },
                { value: 'pi0.5', label: 'pi0.5' },
              ]}
            />
          </Form.Item>

          <Form.Item label="任务名称" name="expName" rules={[{ required: true }]}>
            <Input placeholder="例如：act_so100_test" />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }} wrap>
            <Form.Item label="训练步数" name="steps" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <InputNumber min={1000} max={5000000} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item label="Batch Size" name="batchSize" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <InputNumber min={1} max={256} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item label="Device" name="device" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Select style={{ width: 180 }} options={[{ value: 'cuda', label: 'cuda' }, { value: 'cpu', label: 'cpu' }]} />
            </Form.Item>
          </Space>

          <Form.Item label="是否保存训练日志" name="saveLog" valuePropName="checked" style={{ marginTop: 12 }}>
            <Switch />
          </Form.Item>

          <Space style={{ marginTop: 8 }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => addLog('训练任务已提交（等待后端接口返回）')}
            >
              开始训练
            </Button>
            <Button danger icon={<StopOutlined />} onClick={() => addLog('请求停止训练（等待后端接口返回）')}>
              停止
            </Button>
          </Space>

          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            提示：后续可在“模型推理”页选择训练好的权重进行实机验证。
          </Typography.Paragraph>
        </Form>
      </Card>
    </div>
  );
}

export default Training;

