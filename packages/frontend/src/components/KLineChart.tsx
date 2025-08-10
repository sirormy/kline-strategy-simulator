import React, { useEffect, useRef } from 'react'
import { init, dispose } from 'klinecharts'
import type { Chart, KLineData } from 'klinecharts'

interface KLineChartProps {
  data: KLineData[]
  width?: number
  height?: number
  symbol?: string
  onReady?: (chart: Chart) => void
}

const KLineChart: React.FC<KLineChartProps> = ({
  data,
  width = 800,
  height = 400,
  symbol = 'BTCUSDT',
  onReady
}) => {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<Chart | null>(null)

  useEffect(() => {
    if (chartRef.current) {
      // 初始化图表
      chartInstance.current = init(chartRef.current)
      
      // 设置图表样式
      chartInstance.current.setStyles({
        grid: {
          show: true,
          horizontal: {
            show: true,
            size: 1,
            color: '#E9EEF3',
            style: 'solid'
          },
          vertical: {
            show: true,
            size: 1,
            color: '#E9EEF3',
            style: 'solid'
          }
        },
        candle: {
          margin: {
            top: 0.2,
            bottom: 0.1
          },
          type: 'candle_solid',
          bar: {
            upColor: '#26A69A',
            downColor: '#EF5350',
            noChangeColor: '#888888'
          },
          tooltip: {
            showRule: 'always',
            showType: 'standard',
            labels: ['时间', '开', '收', '高', '低', '成交量']
          }
        }
      })

      // 回调通知图表已准备就绪
      if (onReady) {
        onReady(chartInstance.current)
      }
    }

    // 清理函数
    return () => {
      if (chartInstance.current) {
        dispose(chartRef.current!)
        chartInstance.current = null
      }
    }
  }, [onReady])

  useEffect(() => {
    // 更新图表数据
    if (chartInstance.current && data.length > 0) {
      chartInstance.current.applyNewData(data)
    }
  }, [data])

  return (
    <div
      ref={chartRef}
      style={{
        width: width,
        height: height,
        border: '1px solid #E9EEF3',
        borderRadius: '4px'
      }}
    />
  )
}

export default KLineChart