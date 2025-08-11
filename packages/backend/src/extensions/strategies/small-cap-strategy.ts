import { BaseStrategy, TradingSignal, IndicatorResult } from '../base-strategy';
import { KlineData } from '../../schemas/kline-data.schema';
import { StrategyMetadata } from '../../schemas/strategy.schema';

/**
 * 小盘股策略 (Small Cap Strategy)
 * 定期筛选市值排名50-100的币种进行投资
 */
export class SmallCapStrategy extends BaseStrategy {
  private currentHoldings: Set<string> = new Set();
  private lastRebalanceTime: number = 0;
  private rebalanceHistory: Array<{
    timestamp: number;
    added: string[];
    removed: string[];
    marketCapData: { [symbol: string]: number };
  }> = [];

  getMetadata(): StrategyMetadata {
    return {
      displayName: '小盘股策略',
      description: '定期筛选市值排名50-100的币种进行投资，通过捕捉小市值币种的成长机会获得收益',
      author: 'System',
      version: '1.0.0',
      category: 'market-cap',
      tags: ['small-cap', 'rebalancing', 'systematic', 'growth'],
      parameterSchema: [
        {
          name: 'minMarketCapRank',
          type: 'number',
          required: false,
          min: 1,
          max: 500,
          defaultValue: 50,
          description: '最小市值排名（包含）',
        },
        {
          name: 'maxMarketCapRank',
          type: 'number',
          required: false,
          min: 1,
          max: 500,
          defaultValue: 100,
          description: '最大市值排名（包含）',
        },
        {
          name: 'rebalanceFrequency',
          type: 'string',
          required: false,
          options: ['1d', '3d', '1w', '2w', '1M'],
          defaultValue: '1w',
          description: '调仓频率',
        },
        {
          name: 'maxHoldings',
          type: 'number',
          required: false,
          min: 5,
          max: 50,
          defaultValue: 20,
          description: '最大持仓币种数量',
        },
        {
          name: 'allocationPerCoin',
          type: 'number',
          required: false,
          min: 1,
          defaultValue: 100,
          description: '每个币种的分配金额（USDT）',
        },
        {
          name: 'volumeFilter',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否启用成交量过滤，排除低流动性币种',
        },
        {
          name: 'minDailyVolume',
          type: 'number',
          required: false,
          min: 0,
          defaultValue: 1000000,
          description: '最小日成交量（USDT，当volumeFilter为true时生效）',
        },
        {
          name: 'excludeStablecoins',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否排除稳定币',
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

    const currentTime = Date.now();
    
    // 检查是否需要调仓
    if (this.shouldRebalance(currentTime)) {
      const rebalanceSignals = await this.generateRebalanceSignals(marketData);
      signals.push(...rebalanceSignals);
      this.lastRebalanceTime = currentTime;
    }

    return signals;
  }

  validateParameters(parameters: any): boolean {
    try {
      const {
        minMarketCapRank,
        maxMarketCapRank,
        rebalanceFrequency,
        maxHoldings,
        allocationPerCoin,
        minDailyVolume,
      } = parameters;

      // 验证市值排名范围
      if (minMarketCapRank && (minMarketCapRank < 1 || minMarketCapRank > 500)) {
        return false;
      }

      if (maxMarketCapRank && (maxMarketCapRank < 1 || maxMarketCapRank > 500)) {
        return false;
      }

      if (minMarketCapRank && maxMarketCapRank && minMarketCapRank >= maxMarketCapRank) {
        return false;
      }

      // 验证调仓频率
      const validFrequencies = ['1d', '3d', '1w', '2w', '1M'];
      if (rebalanceFrequency && !validFrequencies.includes(rebalanceFrequency)) {
        return false;
      }

      // 验证最大持仓数量
      if (maxHoldings && (maxHoldings < 5 || maxHoldings > 50)) {
        return false;
      }

      // 验证分配金额
      if (allocationPerCoin && allocationPerCoin < 1) {
        return false;
      }

      // 验证最小成交量
      if (minDailyVolume && minDailyVolume < 0) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async onInit(): Promise<void> {
    this.currentHoldings = new Set();
    this.lastRebalanceTime = 0;
    this.rebalanceHistory = [];

    // 从策略状态中恢复数据
    if (this.config.state) {
      this.currentHoldings = new Set(this.config.state.currentHoldings || []);
      this.lastRebalanceTime = this.config.state.lastRebalanceTime || 0;
      this.rebalanceHistory = this.config.state.rebalanceHistory || [];
    }
  }

  async onTradeExecuted(signal: TradingSignal, result: any): Promise<void> {
    // 更新持仓状态
    if (signal.type === 'BUY') {
      this.currentHoldings.add(signal.symbol);
    } else if (signal.type === 'SELL') {
      this.currentHoldings.delete(signal.symbol);
    }

    // 更新策略状态
    if (!this.config.state) {
      this.config.state = {};
    }

    this.config.state.currentHoldings = Array.from(this.currentHoldings);
    this.config.state.lastRebalanceTime = this.lastRebalanceTime;
    this.config.state.rebalanceHistory = this.rebalanceHistory;
    this.config.state.lastExecutionTime = Date.now();
  }

  getMinDataLength(): number {
    return 1; // 小盘股策略主要依赖市值数据，对K线数据要求不高
  }

  /**
   * 判断是否需要调仓
   */
  private shouldRebalance(currentTime: number): boolean {
    if (this.lastRebalanceTime === 0) {
      return true; // 第一次运行
    }

    const { rebalanceFrequency } = this.config.parameters;
    const intervalMs = this.getRebalanceIntervalInMs(rebalanceFrequency || '1w');
    
    return currentTime - this.lastRebalanceTime >= intervalMs;
  }

  /**
   * 将调仓频率转换为毫秒
   */
  private getRebalanceIntervalInMs(frequency: string): number {
    const intervals: { [key: string]: number } = {
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '2w': 14 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
    };

    return intervals[frequency] || intervals['1w'];
  }

  /**
   * 生成调仓信号
   */
  private async generateRebalanceSignals(marketData: KlineData[]): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];
    
    // 获取当前市值排名数据（模拟）
    const marketCapData = await this.getMarketCapData(marketData);
    
    // 筛选符合条件的币种
    const targetCoins = this.selectTargetCoins(marketCapData);
    
    // 计算需要买入和卖出的币种
    const coinsToAdd = targetCoins.filter(coin => !this.currentHoldings.has(coin));
    const coinsToRemove = Array.from(this.currentHoldings).filter(coin => !targetCoins.includes(coin));

    // 生成卖出信号
    for (const coin of coinsToRemove) {
      const coinData = marketData.find(k => k.symbol === coin);
      if (coinData) {
        signals.push(this.createSellSignal(coinData, '调仓卖出：币种被踢出小盘股榜单'));
      }
    }

    // 生成买入信号
    for (const coin of coinsToAdd) {
      const coinData = marketData.find(k => k.symbol === coin);
      if (coinData) {
        signals.push(this.createBuySignal(coinData, '调仓买入：新进入小盘股榜单'));
      }
    }

    // 记录调仓历史
    this.rebalanceHistory.push({
      timestamp: Date.now(),
      added: coinsToAdd,
      removed: coinsToRemove,
      marketCapData: marketCapData,
    });

    // 保留最近10次调仓记录
    if (this.rebalanceHistory.length > 10) {
      this.rebalanceHistory = this.rebalanceHistory.slice(-10);
    }

    return signals;
  }

  /**
   * 获取市值数据（模拟实现）
   * 在实际应用中，这里应该调用真实的市值API
   */
  private async getMarketCapData(marketData: KlineData[]): Promise<{ [symbol: string]: number }> {
    const marketCapData: { [symbol: string]: number } = {};
    
    // 模拟市值数据生成
    // 在实际实现中，这里应该调用CoinGecko或CoinMarketCap API
    for (const kline of marketData) {
      // 使用价格和成交量的组合来模拟市值排名
      // 这只是一个简化的模拟，实际应用需要真实的市值数据
      const simulatedMarketCap = kline.close * kline.volume;
      marketCapData[kline.symbol] = simulatedMarketCap;
    }

    return marketCapData;
  }

  /**
   * 筛选目标币种
   */
  private selectTargetCoins(marketCapData: { [symbol: string]: number }): string[] {
    const {
      minMarketCapRank = 50,
      maxMarketCapRank = 100,
      maxHoldings = 20,
      excludeStablecoins = true,
    } = this.config.parameters;

    // 按市值排序
    const sortedCoins = Object.entries(marketCapData)
      .sort(([, a], [, b]) => b - a) // 降序排列
      .map(([symbol]) => symbol);

    // 过滤稳定币
    let filteredCoins = sortedCoins;
    if (excludeStablecoins) {
      const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'USDD'];
      filteredCoins = sortedCoins.filter(symbol => 
        !stablecoins.some(stable => symbol.includes(stable))
      );
    }

    // 选择指定排名范围内的币种
    const rankedCoins = filteredCoins.slice(minMarketCapRank - 1, maxMarketCapRank);

    // 限制最大持仓数量
    return rankedCoins.slice(0, maxHoldings);
  }

  /**
   * 创建买入信号
   */
  private createBuySignal(kline: KlineData, reason: string): TradingSignal {
    const { allocationPerCoin = 100 } = this.config.parameters;
    const quantity = allocationPerCoin / kline.close;

    return this.createSignal(
      'BUY',
      kline.symbol,
      quantity,
      0.8, // 小盘股策略的置信度设为80%
      reason,
      {
        price: kline.close,
        metadata: {
          strategy: 'SmallCap',
          allocationAmount: allocationPerCoin,
          rebalanceTime: Date.now(),
        },
      }
    );
  }

  /**
   * 创建卖出信号
   */
  private createSellSignal(kline: KlineData, reason: string): TradingSignal {
    // 卖出全部持仓
    return this.createSignal(
      'SELL',
      kline.symbol,
      0, // 数量为0表示卖出全部
      0.9, // 卖出信号的置信度更高
      reason,
      {
        price: kline.close,
        metadata: {
          strategy: 'SmallCap',
          sellAll: true,
          rebalanceTime: Date.now(),
        },
      }
    );
  }

  /**
   * 获取策略统计信息
   */
  getStrategyStats(): {
    currentHoldingsCount: number;
    currentHoldings: string[];
    lastRebalanceTime: number;
    nextRebalanceTime: number;
    rebalanceCount: number;
    totalCoinsTraded: number;
  } {
    const { rebalanceFrequency = '1w' } = this.config.parameters;
    const intervalMs = this.getRebalanceIntervalInMs(rebalanceFrequency);

    // 计算总交易币种数
    const allTradedCoins = new Set<string>();
    this.rebalanceHistory.forEach(rebalance => {
      rebalance.added.forEach(coin => allTradedCoins.add(coin));
      rebalance.removed.forEach(coin => allTradedCoins.add(coin));
    });

    return {
      currentHoldingsCount: this.currentHoldings.size,
      currentHoldings: Array.from(this.currentHoldings),
      lastRebalanceTime: this.lastRebalanceTime,
      nextRebalanceTime: this.lastRebalanceTime + intervalMs,
      rebalanceCount: this.rebalanceHistory.length,
      totalCoinsTraded: allTradedCoins.size,
    };
  }

  /**
   * 获取调仓历史
   */
  getRebalanceHistory(): Array<{
    timestamp: number;
    added: string[];
    removed: string[];
    marketCapData: { [symbol: string]: number };
  }> {
    return [...this.rebalanceHistory];
  }
}