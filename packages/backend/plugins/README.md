# 策略插件开发指南

本目录用于存放自定义策略插件。插件系统允许开发者扩展系统功能，添加自定义的交易策略和技术指标。

## 插件文件结构

```
plugins/
├── README.md                    # 本文件
├── example-strategy.plugin.js   # 示例策略插件
└── your-strategy.plugin.js      # 你的自定义策略
```

## 插件开发规范

### 1. 文件命名

- 插件文件必须以 `.plugin.js` 结尾
- 文件名应该描述插件的功能，使用kebab-case格式
- 例如：`my-custom-strategy.plugin.js`

### 2. 插件结构

每个插件文件必须导出一个对象，包含以下属性：

```javascript
module.exports = {
  // 插件元数据（可选）
  metadata: {
    name: '插件名称',
    version: '1.0.0',
    author: '作者名称',
    description: '插件描述',
  },

  // 策略导出（可选）
  strategies: {
    'STRATEGY_TYPE': StrategyClass,
  },

  // 指标导出（可选，将在后续版本支持）
  indicators: {
    'INDICATOR_TYPE': IndicatorClass,
  },
};
```

### 3. 策略开发

#### 基础策略类

所有策略必须继承自 `BaseStrategy` 类：

```javascript
const { BaseStrategy } = require('../src/extensions/base-strategy');

class MyStrategy extends BaseStrategy {
  // 必须实现的方法
  getMetadata() {
    return {
      displayName: '策略显示名称',
      description: '策略描述',
      author: '作者',
      version: '1.0.0',
      category: 'trend', // 策略类别
      tags: ['tag1', 'tag2'], // 标签
      parameterSchema: [
        // 参数定义
      ],
    };
  }

  async generateSignals(marketData, indicators) {
    // 生成交易信号的逻辑
    return [];
  }

  validateParameters(parameters) {
    // 验证参数的逻辑
    return true;
  }

  // 可选实现的方法
  async onInit() {
    // 策略初始化逻辑
  }

  async onDestroy() {
    // 策略销毁逻辑
  }

  getMinDataLength() {
    // 返回策略所需的最小数据量
    return 30;
  }
}
```

#### 参数定义

在 `getMetadata()` 方法中定义策略参数：

```javascript
parameterSchema: [
  {
    name: 'period',           // 参数名称
    type: 'number',           // 参数类型：number, string, boolean, array, object
    required: true,           // 是否必需
    min: 1,                   // 最小值（数值类型）
    max: 100,                 // 最大值（数值类型）
    defaultValue: 20,         // 默认值
    options: ['1h', '4h'],    // 可选值（字符串类型）
    description: '参数描述',   // 参数说明
  },
]
```

#### 交易信号生成

使用 `createSignal()` 方法创建交易信号：

```javascript
const signal = this.createSignal(
  'BUY',                    // 信号类型：BUY, SELL, LONG, SHORT, CLOSE_LONG, CLOSE_SHORT
  'BTCUSDT',               // 交易对
  0.001,                   // 数量
  0.8,                     // 置信度 (0-1)
  '买入信号原因',           // 信号原因
  {
    price: 50000,          // 价格（可选）
    stopLoss: 48000,       // 止损价（可选）
    takeProfit: 55000,     // 止盈价（可选）
  }
);
```

### 4. 技术指标计算

BaseStrategy 提供了一些常用的技术指标计算方法：

```javascript
// 简单移动平均
const sma = this.calculateSMA(prices, period);

// 指数移动平均
const ema = this.calculateEMA(prices, period);

// 价格变化百分比
const change = this.calculatePriceChange(oldPrice, newPrice);

// 波动率
const volatility = this.calculateVolatility(prices, period);
```

### 5. 策略状态管理

策略可以通过 `this.config.state` 保存和恢复状态：

```javascript
async onInit() {
  // 从状态中恢复数据
  this.lastSignalTime = this.config.state?.lastSignalTime || 0;
}

async onTradeExecuted(signal, result) {
  // 更新状态
  if (!this.config.state) {
    this.config.state = {};
  }
  this.config.state.lastSignalTime = Date.now();
}
```

## 插件测试

### 1. 本地测试

在开发环境中，插件会自动热重载。修改插件文件后，系统会自动重新加载。

### 2. 参数验证测试

可以通过API测试参数验证：

```bash
curl -X POST http://localhost:3000/api/strategies/types/YOUR_STRATEGY_TYPE/validate \
  -H "Content-Type: application/json" \
  -d '{"period": 20, "threshold": 0.05}'
```

### 3. 回测测试

创建策略并运行回测来验证策略逻辑：

```bash
# 1. 创建策略
curl -X POST http://localhost:3000/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test",
    "name": "Test Strategy",
    "type": "YOUR_STRATEGY_TYPE",
    "parameters": {"period": 20},
    "symbols": ["BTCUSDT"],
    "timeframe": "1h"
  }'

# 2. 运行回测
curl -X POST http://localhost:3000/api/strategies/{strategyId}/backtest \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": 1640995200000,
    "endTime": 1672531200000,
    "initialBalance": 10000
  }'
```

## 最佳实践

### 1. 错误处理

```javascript
async generateSignals(marketData, indicators) {
  try {
    // 策略逻辑
    return signals;
  } catch (error) {
    console.error('Strategy error:', error);
    return []; // 返回空信号数组
  }
}
```

### 2. 性能优化

- 避免在每次调用时重复计算相同的指标
- 使用缓存存储计算结果
- 限制信号生成频率

### 3. 日志记录

```javascript
async onInit() {
  console.log(`Strategy ${this.config.name} initialized with parameters:`, this.config.parameters);
}
```

### 4. 数据验证

```javascript
async generateSignals(marketData, indicators) {
  if (!marketData || marketData.length < this.getMinDataLength()) {
    return [];
  }
  
  // 策略逻辑
}
```

## 常见问题

### Q: 插件没有被加载？
A: 检查文件名是否以 `.plugin.js` 结尾，并且文件位于正确的插件目录中。

### Q: 策略参数验证失败？
A: 检查 `parameterSchema` 定义是否正确，参数类型和约束是否匹配。

### Q: 如何调试策略？
A: 使用 `console.log` 输出调试信息，或者通过回测查看策略行为。

### Q: 策略性能差？
A: 检查是否有重复计算，考虑使用缓存，减少不必要的信号生成。

## 示例策略

查看 `example-strategy.plugin.js` 文件，了解完整的策略实现示例。

## 支持

如果在插件开发过程中遇到问题，请查看系统日志或联系开发团队。