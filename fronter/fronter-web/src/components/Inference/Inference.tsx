import { Card, Form, Input, InputNumber, Space, Button, Switch, Select, Alert } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

interface InferenceProps {
  onLog?: (message: string) => void;
}

function Inference({ onLog }: InferenceProps) {
  const [form] = Form.useForm();
  const addLog = (msg: string) => onLog?.(msg);

  return (
    <Card title="模型推理" styles={{ body: { paddingTop: 16 } }}>
      <Alert
        type="info"
        showIcon
        message="使用训练好的模型进行验证"
        description="推理流程与遥操/采集类似：检查配置文件与相机后启动推理，日志输出在右侧控制台。"
        style={{ marginBottom: 12 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          modelPath: '',
          datasetName: 'my_dataset',
          showRerun: true,
          fps: 30,
          numEpisodes: 30,
          episodeTimeS: 30,
          resetTimeS: 20,
          policy: 'ACT',
        }}
      >
        <Form.Item label="模型路径" name="modelPath" rules={[{ required: true, message: '请选择或输入模型路径' }]}>
          <Input placeholder="例如：/path/to/checkpoints/latest.ckpt" />
        </Form.Item>

        <Form.Item label="数据集名称" name="datasetName" rules={[{ required: true }]}>
          <Input placeholder="my_dataset" />
        </Form.Item>

        <Form.Item label="策略类型" name="policy" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ACT', label: 'ACT' },
              { value: 'pi0', label: 'pi0' },
              { value: 'pi0.5', label: 'pi0.5' },
            ]}
          />
        </Form.Item>

        <Space size="large" wrap style={{ width: '100%' }}>
          <Form.Item label="帧率(FPS)" name="fps" style={{ marginBottom: 0 }}>
            <InputNumber min={1} max={120} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="采集轮数" name="numEpisodes" style={{ marginBottom: 0 }}>
            <InputNumber min={1} max={200} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="每轮录制时长(秒)" name="episodeTimeS" style={{ marginBottom: 0 }}>
            <InputNumber min={5} max={300} style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="重置时长(秒)" name="resetTimeS" style={{ marginBottom: 0 }}>
            <InputNumber min={5} max={300} style={{ width: 180 }} />
          </Form.Item>
        </Space>

        <Form.Item label="数据可视化（Rerun）" name="showRerun" valuePropName="checked" style={{ marginTop: 12 }}>
          <Switch />
        </Form.Item>

        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => addLog('🚀 推理任务已提交（等待后端接口返回）')}
        >
          开始推理
        </Button>
      </Form>
    </Card>
  );
}

export default Inference;

