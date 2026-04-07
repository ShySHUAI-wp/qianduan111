import { useMemo } from 'react';
import { Card, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';

interface LossChartProps {
  lossData: number[];
  stepData: number[];
  isTraining?: boolean;
}

const MAX_DATA_POINTS = 500;

function LossChart({ lossData, stepData, isTraining = false }: LossChartProps) {
  const chartOption = useMemo(() => {
    // 如果没有数据，显示空状态
    if (lossData.length === 0) {
      return {
        title: {
          text: 'Loss 曲线',
          left: 'center',
          textStyle: { fontSize: 14 },
        },
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value', name: 'Loss', scale: true },
        series: [{ name: 'Loss', type: 'line', data: [] }],
      };
    }

    return {
      title: {
        text: 'Loss 曲线',
        left: 'center',
        textStyle: { fontSize: 14 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const point = params[0];
          if (point) {
            return `Step: ${point.axisValue}<br/>Loss: ${point.value.toFixed(6)}`;
          }
          return '';
        },
      },
      grid: {
        left: 60,
        right: 20,
        top: 40,
        bottom: 30,
      },
      xAxis: {
        type: 'category',
        name: 'Step',
        nameLocation: 'center',
        nameGap: 25,
        nameTextStyle: { fontSize: 11 },
        data: stepData,
        axisLabel: {
          fontSize: 10,
          formatter: (value: string) => {
            // 格式化step显示，只显示重要的刻度
            const num = parseInt(value, 10);
            if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
            if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
            return num.toString();
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Loss',
        nameLocation: 'center',
        nameGap: 40,
        nameTextStyle: { fontSize: 11 },
        scale: true,
        axisLabel: {
          fontSize: 10,
          formatter: (value: number) => value.toFixed(3),
        },
      },
      series: [
        {
          name: 'Loss',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: '#5470c6',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
                { offset: 1, color: 'rgba(84, 112, 198, 0.05)' },
              ],
            },
          },
          data: lossData,
        },
      ],
      animation: true,
      animationDuration: 0,
    };
  }, [lossData, stepData]);

  return (
    <Card
      title="训练图表"
      extra={<Tag color={isTraining ? 'blue' : 'default'}>{isTraining ? '训练中' : '等待开始'}</Tag>}
      styles={{ body: { padding: '12px 12px 0 12px' } }}
      style={{ marginBottom: 16 }}
    >
      <ReactECharts
        option={chartOption}
        style={{ height: 280, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </Card>
  );
}

export default LossChart;
