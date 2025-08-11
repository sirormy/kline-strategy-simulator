/**
 * 示例策略插件
 * 这是一个插件开发模板，展示如何创建自定义策略
 */

// 注意：在实际项目中，你需要从正确的路径导入这些类
// 这里使用相对路径仅作为示例
const { BaseStrategy } = require('../src/extensions/base-strategy');

/**
 * 简单移动平均策略示例
 * 当价格突破移动平均线时产生交易信号
 */
class SimpleMAStrategy extends BaseStrategy {
  getMetadata() {
    return {
      displayName: '简单移动平均策略',
      description: '基于移动平均线的简单交易策略，当价格突破MA时产生信号',
      author: 'Plugin Developer',
      version: '1.0.0',
      category: 'trend',
      tags: ['ma', 'trend', 'simple'],
      parameterSchema: [
        {
          name: 'maPeriod',
          type: 'number',
          required: true,
          min: 5,
          max: 200,
          defaultValue: 20,
          description: '移动平均线周期',
        },
        {
          name: 'signalType',
          type: 'string',
          required: true,
          options: ['crossover', 'price_above', 'price_below'],
          defaultValue: 'crossover',
          description: '信号类型：crossover=穿越, price_above=价格在MA之上, price_below=价格在MA之下',
        },
        {
          name: 'minConfidence',
          type: 'number',
          required: false,
          min: 0,
          max: 1,
          defaultValue: 0.7,
          description: '最小置信度阈值',
        },
      ],
      requiredIndicators: [], // 不需要外部指标
    };
  }

  async generateSignals(marketData, indicators) {
    const signals = [];
    const { maPeriod, signalType, minConfidence } = this.config.parameters;

    if (marketData.length < maPeriod + 1) {
      return signals; // 数据不足
    }

    // 计算移动平均线
    const prices = marketData.map(k => k.close);
    const ma = this.calculateSMA(prices, maPeriod);
    
    if (ma.length < 2) {
      return signals;
    }

    const currentPrice = prices[prices.length - 1];
    const currentMA = ma[ma.length - 1];
    const previousPrice = prices[prices.length - 2];
    const previousMA = ma[ma.length - 2];
    const currentKline = marketData[marketData.length - 1];

    let signal = null;
    let confidence = 0;

    switch (signalType) {
      case 'crossover':
        // 价格穿越MA
        if (previousPrice <= previousMA && currentPrice > currentMA) {
          // 向上穿越 - 买入信号
          confidence = Math.min(1, (currentPrice - currentMA) / currentMA + 0.5);
          if (confidence >= minConfidence) {
            signal = this.createSignal(
              'BUY',
              currentKline.symbol,
              100 / currentPrice, // 固定100 USDT的购买量
              confidence,
              `价格向上穿越MA${maPeriod}，买入信号`,
              { price: currentPrice }
            );
          }
        } else if (previousPrice >= previousMA && currentPrice < currentMA) {
          // 向下穿越 - 卖出信号
          confidence = Math.min(1, (currentMA - currentPrice) / currentMA + 0.5);
          if (confidence >= minConfidence) {
            signal = this.createSignal(
              'SELL',
              currentKline.symbol,
              100 / currentPrice, // 固定100 USDT的卖出量
              confidence,
              `价格向下穿越MA${maPeriod}，卖出信号`,
              { price: currentPrice }
            );
          }
        }
        break;

      case 'price_above':
        // 价格在MA之上
        if (currentPrice > currentMA) {
          confidence = Math.min(1, (currentPrice - currentMA) / currentMA + 0.3);
          if (confidence >= minConfidence) {
            signal = this.createSignal(
              'BUY',
              currentKline.symbol,
              50 / currentPrice, // 较小的购买量
              confidence,
              `价格在MA${maPeriod}之上，持续买入`,
              { price: currentPrice }
            );
          }
        }
        break;

      case 'price_below':
        // 价格在MA之下
        if (currentPrice < currentMA) {
          confidence = Math.min(1, (currentMA - currentPrice) / currentMA + 0.3);
          if (confidence >= minConfidence) {
            signal = this.createSignal(
              'SELL',
              currentKline.symbol,
              50 / currentPrice, // 较小的卖出量
              confidence,
              `价格在MA${maPeriod}之下，持续卖出`,
              { price: currentPrice }
            );
          }
        }
        break;
    }

    if (signal) {
      signals.push(signal);
    }

    return signals;
  }

  validateParameters(parameters) {
    const { maPeriod, signalType, minConfidence } = parameters;

    // 验证MA周期
    if (!maPeriod || maPeriod < 5 || maPeriod > 200) {
      return false;
    }

    // 验证信号类型
    const validSignalTypes = ['crossover', 'price_above', 'price_below'];
    if (!signalType || !validSignalTypes.includes(signalType)) {
      return false;
    }

    // 验证置信度
    if (minConfidence !== undefined && (minConfidence < 0 || minConfidence > 1)) {
      return false;
    }

    return true;
  }

  getMinDataLength() {
    return this.config.parameters.maPeriod + 5; // MA周期 + 额外缓冲
  }

  async onInit() {
    console.log(`SimpleMAStrategy initialized with MA period: ${this.config.parameters.maPeriod}`);
  }

  async onDestroy() {
    console.log('SimpleMAStrategy destroyed');
  }
}

/**
 * 网格交易策略示例
 * 在价格区间内设置买卖网格
 */
class GridTradingStrategy extends BaseStrategy {
  constructor(config) {
    super(config);
    this.gridLevels = [];
    this.activeOrders = new Map();
  }

  getMetadata() {
    return {
      displayName: '网格交易策略',
      description: '在指定价格区间内设置买卖网格，适合震荡市场',
      author: 'Plugin Developer',
      version: '1.0.0',
      category: 'arbitrage',
      tags: ['grid', 'range', 'arbitrage'],
      parameterSchema: [
        {
          name: 'lowerBound',
          type: 'number',
          required: true,
          min: 0,
          description: '网格下边界价格',
        },
        {
          name: 'upperBound',
          type: 'number',
          required: true,
          min: 0,
          description: '网格上边界价格',
        },
        {
          name: 'gridCount',
          type: 'number',
          required: true,
          min: 3,
          max: 50,
          defaultValue: 10,
          description: '网格数量',
        },
        {
          name: 'orderSize',
          type: 'number',
          required: true,
          min: 1,
          defaultValue: 100,
          description: '每个网格的订单金额（USDT）',
        },
      ],
    };
  }

  async generateSignals(marketData, indicators) {
    const signals = [];
    const { lowerBound, upperBound, gridCount, orderSize } = this.config.parameters;

    if (marketData.length === 0) {
      return signals;
    }

    const currentKline = marketData[marketData.length - 1];
    const currentPrice = currentKline.close;

    // 初始化网格
    if (this.gridLevels.length === 0) {
      this.initializeGrid(lowerBound, upperBound, gridCount);
    }

    // 检查是否触发网格交易
    for (const level of this.gridLevels) {
      if (Math.abs(currentPrice - level.price) / level.price < 0.001) { // 0.1%的价格容差
        if (level.type === 'buy' && !this.activeOrders.has(level.id)) {
          // 买入信号
          const signal = this.createSignal(
            'BUY',
            currentKline.symbol,
            orderSize / currentPrice,
            0.8,
            `网格买入 @ ${level.price}`,
            { price: level.price }
          );
          signals.push(signal);
          this.activeOrders.set(level.id, { type: 'buy', price: level.price });
        } else if (level.type === 'sell' && !this.activeOrders.has(level.id)) {
          // 卖出信号
          const signal = this.createSignal(
            'SELL',
            currentKline.symbol,
            orderSize / currentPrice,
            0.8,
            `网格卖出 @ ${level.price}`,
            { price: level.price }
          );
          signals.push(signal);
          this.activeOrders.set(level.id, { type: 'sell', price: level.price });
        }
      }
    }

    return signals;
  }

  validateParameters(parameters) {
    const { lowerBound, upperBound, gridCount, orderSize } = parameters;

    if (!lowerBound || !upperBound || lowerBound >= upperBound) {
      return false;
    }

    if (!gridCount || gridCount < 3 || gridCount > 50) {
      return false;
    }

    if (!orderSize || orderSize < 1) {
      return false;
    }

    return true;
  }

  initializeGrid(lowerBound, upperBound, gridCount) {
    const priceStep = (upperBound - lowerBound) / (gridCount - 1);
    
    for (let i = 0; i < gridCount; i++) {
      const price = lowerBound + (i * priceStep);
      const type = i < gridCount / 2 ? 'buy' : 'sell';
      
      this.gridLevels.push({
        id: `grid_${i}`,
        price,
        type,
      });
    }
  }

  async onInit() {
    this.gridLevels = [];
    this.activeOrders.clear();
    console.log('GridTradingStrategy initialized');
  }
}

// 插件导出
module.exports = {
  // 插件元数据
  metadata: {
    name: 'Example Strategies Plugin',
    version: '1.0.0',
    author: 'Plugin Developer',
    description: '示例策略插件，包含简单MA策略和网格交易策略',
  },

  // 导出策略
  strategies: {
    'SIMPLE_MA': SimpleMAStrategy,
    'GRID_TRADING': GridTradingStrategy,
  },

  // 可以导出指标（将在后续任务中实现）
  indicators: {
    // 'CUSTOM_INDICATOR': CustomIndicator,
  },
};