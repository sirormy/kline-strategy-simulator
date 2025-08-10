import React from 'react'
import { Card, Row, Col } from 'antd'

const TradingPage: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="交易界面" bordered={false}>
            <p>K线策略模拟器交易界面正在开发中...</p>
            <p>后续将集成KLineCharts图表组件和交易功能</p>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default TradingPage