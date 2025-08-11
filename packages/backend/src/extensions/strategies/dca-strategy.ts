import { BaseStrategy, TradingSignal, IndicatorResult } from '../base-strategy';
import { KlineData } from '../../schemas/kline-data.schema';
import { StrategyMetadata } from '../../schemas/strategy.schema';

/**
 * 定投策略 (Dollar Cost Averaging)
 * 按照固定时间间隔和固定金额进行投资
 */
export class DCAStrategy extends BaseStrategy {
  private lastInvestmentTime: number = 0;
  private totalInvested: number = 0;
  private investmentCount: number = 0;

  getMetadata(): StrategyMetadata {
    return {
      displayName: '定投策略',
      description: '定期定额投资策略，按照设定的时间间隔和金额进行投资，适合长期投资',
      author: 'System',
      version: '1.0.0',
      category: 'investment',
      tags: ['dca', 'long-term', 'systematic'],
      parameterSchema: [
        {
          name: 'investmentAmount',
          type: 'number',
          required: true,
          min: 1,
          description: '每次投资金额（USDT）',
          defaultValue: 100,
        },
        {
          name: 'frequency',
          type: 'string',
          required: true,
          options: ['1h', '4h', '12h', '1d', '3d', '1w'],
          defaultValue: '1d',
          description: '投资频率',
        },
        {
          name: 'maxInvestments',
          type: 'number',
          required: false,
          min: 1,
          description: '最大投资次数（可选，不设置则无限制）',
        },
        {
          name: 'priceThreshold',
          type: 'number',
          required: false,
          min: 0,
          description: '价格阈值，只有当价格低于此值时才投资（可选）',
        },
        {
          name: 'volatilityFilter',
          type: 'boolean',
          required: false,
          defaultValue: false,
          description: '是否启用波动率过滤，在高波动期间暂停投资',
        },
        {
          name: 'volatilityThreshold',
          type: 'number',
          required: false,
          min: 0,
          max: 1,
          defaultValue: 0.05,
          description: '波动率阈值（当volatilityFilter为true时生效）',
        },
      ],
    };
  }

  async generateSignals(
    marketData: KlineData[],
    indicators: IndicatorResult[]
  ): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    if (marketData.length === 0) {
      return signals;
    }

    const currentKline = marketData[marketData.length - 1];
    const currentTime = currentKline.closeTime;
    const currentPrice = currentKline.close;

    // 检查是否应该进行投资
    if (this.shouldInvest(currentTime, currentPrice, marketData)) {
      const signal = this.createBuySignal(currentKline);
      if (signal) {
        signals.push(signal);
        this.updateInvestmentStats(currentTime, this.config.parameters.investmentAmount);
      }
    }

    return signals;
  }

  validateParameters(parameters: any): boolean {
    try {
      const { investmentAmount, frequency, maxInvestments, priceThreshold, volatilityThreshold } = parameters;

      // 验证投资金额
      if (!investmentAmount || investmentAmount <= 0) {
        return false;
      }

      // 验证频率
      const validFrequencies = ['1h', '4h', '12h', '1d', '3d', '1w'];
      if (!frequency || !validFrequencies.includes(frequency)) {
        return false;
      }

      // 验证最大投资次数
      if (maxInvestments !== undefined && maxInvestments <= 0) {
        return false;
      }

      // 验证价格阈值
      if (priceThreshold !== undefined && priceThreshold < 0) {
        return false;
      }

      // 验证波动率阈值
      if (volatilityThreshold !== undefined && (volatilityThreshold < 0 || volatilityThreshold > 1)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async onInit(): Promise<void> {
    this.lastInvestmentTime = 0;
    this.totalInvested = 0;
    this.investmentCount = 0;
    
    // 从策略状态中恢复数据
    if (this.config.state) {
      this.lastInvestmentTime = this.config.state.lastInvestmentTime || 0;
      this.totalInvested = this.config.state.totalInvested || 0;
      this.investmentCount = this.config.state.investmentCount || 0;
    }
  }

  async onTradeExecuted(signal: TradingSignal, result: any): Promise<void> {
    // 更新策略状态
    if (!this.config.state) {
      this.config.state = {};
    }

    this.config.state.lastInvestmentTime = this.lastInvestmentTime;
    this.config.state.totalInvested = this.totalInvested;
    this.config.state.investmentCount = this.investmentCount;
    this.config.state.lastExecutionTime = Date.now();
  }

  getMinDataLength(): number {
    // DCA策略只需要当前数据点，但为了计算波动率可能需要更多数据
    return this.config.parameters.volatilityFilter ? 20 : 1;
  }

  /**
   * 判断是否应该进行投资
   */
  private shouldInvest(currentTime: number, currentPrice: number, marketData: KlineData[]): boolean {
    const { frequency, maxInvestments, priceThreshold, volatilityFilter } = this.config.parameters;

    // 检查是否达到最大投资次数
    if (maxInvestments && this.investmentCount >= maxInvestments) {
      return false;
    }

    // 检查时间间隔
    if (!this.isTimeToInvest(currentTime, frequency)) {
      return false;
    }

    // 检查价格阈值
    if (priceThreshold && currentPrice > priceThreshold) {
      return false;
    }

    // 检查波动率过滤
    if (volatilityFilter && this.isHighVolatility(marketData)) {
      return false;
    }

    return true;
  }

  /**
   * 检查是否到了投资时间
   */
  private isTimeToInvest(currentTime: number, frequency: string): boolean {
    if (this.lastInvestmentTime === 0) {
      return true; // 第一次投资
    }

    const intervalMs = this.getIntervalInMs(frequency);
    return currentTime - this.lastInvestmentTime >= intervalMs;
  }

  /**
   * 将频率字符串转换为毫秒
   */
  private getIntervalInMs(frequency: string): number {
    const intervals: { [key: string]: number } = {
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };

    return intervals[frequency] || intervals['1d'];
  }

  /**
   * 检查是否处于高波动期
   */
  private isHighVolatility(marketData: KlineData[]): boolean {
    const { volatilityThreshold } = this.config.parameters;
    
    if (marketData.length < 20) {
      return false; // 数据不足，不进行波动率过滤
    }

    const prices = marketData.slice(-20).map(k => k.close);
    const volatility = this.calculateVolatility(prices, 20);

    return volatility > volatilityThreshold;
  }

  /**
   * 创建买入信号
   */
  private createBuySignal(kline: KlineData): TradingSignal {
    const { investmentAmount } = this.config.parameters;
    const quantity = investmentAmount / kline.close; // 计算购买数量

    return this.createSignal(
      'BUY',
      kline.symbol,
      quantity,
      1.0, // DCA策略的置信度总是100%
      `DCA定投 - 第${this.investmentCount + 1}次投资，金额: ${investmentAmount} USDT`,
      {
        price: kline.close,
        metadata: {
          investmentNumber: this.investmentCount + 1,
          totalInvested: this.totalInvested + investmentAmount,
          averageCost: (this.totalInvested + investmentAmount) / (this.investmentCount + 1),
          strategy: 'DCA',
        },
      }
    );
  }

  /**
   * 更新投资统计
   */
  private updateInvestmentStats(currentTime: number, amount: number): void {
    this.lastInvestmentTime = currentTime;
    this.totalInvested += amount;
    this.investmentCount += 1;
  }

  /**
   * 获取策略统计信息
   */
  getStrategyStats(): {
    totalInvested: number;
    investmentCount: number;
    averageInvestmentAmount: number;
    lastInvestmentTime: number;
    nextInvestmentTime: number;
  } {
    const { frequency, investmentAmount } = this.config.parameters;
    const intervalMs = this.getIntervalInMs(frequency);

    return {
      totalInvested: this.totalInvested,
      investmentCount: this.investmentCount,
      averageInvestmentAmount: this.investmentCount > 0 ? this.totalInvested / this.investmentCount : investmentAmount,
      lastInvestmentTime: this.lastInvestmentTime,
      nextInvestmentTime: this.lastInvestmentTime + intervalMs,
    };
  }
}