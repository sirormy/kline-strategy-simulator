import { BaseStrategy, TradingSignal, IndicatorResult } from '../base-strategy';
import { KlineData } from '../../schemas/kline-data.schema';
import { StrategyMetadata } from '../../schemas/strategy.schema';

/**
 * 趋势跟随策略 (Trend Following Strategy)
 * 根据价格趋势变化执行做多做空操作
 */
export class TrendFollowingStrategy extends BaseStrategy {
  private currentPosition: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  private entryPrice: number = 0;
  private trendStrength: number = 0;
  private positionSize: number = 0;
  private tradeHistory: Array<{
    timestamp: number;
    action: string;
    price: number;
    position: string;
    trendStrength: number;
    pnl?: number;
  }> = [];

  getMetadata(): StrategyMetadata {
    return {
      displayName: '趋势跟随策略',
      description: '根据价格趋势变化执行做多做空操作，在上涨趋势中做多，在下跌趋势中做空',
      author: 'System',
      version: '1.0.0',
      category: 'trend',
      tags: ['trend-following', 'momentum', 'directional', 'swing'],
      parameterSchema: [
        {
          name: 'trendPeriod',
          type: 'number',
          required: false,
          min: 5,
          max: 100,
          defaultValue: 20,
          description: '趋势判断周期（K线数量）',
        },
        {
          name: 'trendThreshold',
          type: 'number',
          required: false,
          min: 0.1,
          max: 10,
          defaultValue: 2.0,
          description: '趋势强度阈值（百分比）',
        },
        {
          name: 'basePositionSize',
          type: 'number',
          required: false,
          min: 10,
          defaultValue: 100,
          description: '基础仓位大小（USDT）',
        },
        {
          name: 'maxPositionSize',
          type: 'number',
          required: false,
          min: 50,
          defaultValue: 500,
          description: '最大仓位大小（USDT）',
        },
        {
          name: 'stopLossPercent',
          type: 'number',
          required: false,
          min: 0.5,
          max: 20,
          defaultValue: 5.0,
          description: '止损百分比',
        },
        {
          name: 'takeProfitPercent',
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          defaultValue: 10.0,
          description: '止盈百分比',
        },
        {
          name: 'leverage',
          type: 'number',
          required: false,
          min: 1,
          max: 20,
          defaultValue: 1,
          description: '杠杆倍数（合约交易）',
        },
        {
          name: 'enableShort',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否启用做空操作',
        },
        {
          name: 'trendConfirmationBars',
          type: 'number',
          required: false,
          min: 1,
          max: 10,
          defaultValue: 3,
          description: '趋势确认所需的K线数量',
        },
        {
          name: 'volatilityFilter',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否启用波动率过滤',
        },
        {
          name: 'minVolatility',
          type: 'number',
          required: false,
          min: 0.01,
          max: 0.5,
          defaultValue: 0.02,
          description: '最小波动率要求',
        },
      ],
    };
  }

  async generateSignals(
    marketData: KlineData[],
    indicators: IndicatorResult[]
  ): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    if (marketData.length < this.getMinDataLength()) {
      return signals;
    }

    const currentKline = marketData[marketData.length - 1];
    const currentPrice = currentKline.close;

    // 计算趋势强度和方向
    const trendAnalysis = this.analyzeTrend(marketData);
    this.trendStrength = trendAnalysis.strength;

    // 检查止损止盈
    const stopSignal = this.checkStopConditions(currentPrice);
    if (stopSignal) {
      signals.push(stopSignal);
      return signals;
    }

    // 检查趋势变化信号
    const trendSignal = this.checkTrendSignals(currentKline, trendAnalysis);
    if (trendSignal) {
      signals.push(trendSignal);
    }

    return signals;
  }

  validateParameters(parameters: any): boolean {
    try {
      const {
        trendPeriod,
        trendThreshold,
        basePositionSize,
        maxPositionSize,
        stopLossPercent,
        takeProfitPercent,
        leverage,
        trendConfirmationBars,
        minVolatility,
      } = parameters;

      // 验证趋势周期
      if (trendPeriod && (trendPeriod < 5 || trendPeriod > 100)) {
        return false;
      }

      // 验证趋势阈值
      if (trendThreshold && (trendThreshold < 0.1 || trendThreshold > 10)) {
        return false;
      }

      // 验证仓位大小
      if (basePositionSize && basePositionSize < 10) {
        return false;
      }

      if (maxPositionSize && maxPositionSize < 50) {
        return false;
      }

      if (basePositionSize && maxPositionSize && basePositionSize > maxPositionSize) {
        return false;
      }

      // 验证止损止盈
      if (stopLossPercent && (stopLossPercent < 0.5 || stopLossPercent > 20)) {
        return false;
      }

      if (takeProfitPercent && (takeProfitPercent < 1 || takeProfitPercent > 50)) {
        return false;
      }

      // 验证杠杆
      if (leverage && (leverage < 1 || leverage > 20)) {
        return false;
      }

      // 验证确认K线数量
      if (trendConfirmationBars && (trendConfirmationBars < 1 || trendConfirmationBars > 10)) {
        return false;
      }

      // 验证最小波动率
      if (minVolatility && (minVolatility < 0.01 || minVolatility > 0.5)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async onInit(): Promise<void> {
    this.currentPosition = 'NONE';
    this.entryPrice = 0;
    this.trendStrength = 0;
    this.positionSize = 0;
    this.tradeHistory = [];

    // 从策略状态中恢复数据
    if (this.config.state) {
      this.currentPosition = this.config.state.currentPosition || 'NONE';
      this.entryPrice = this.config.state.entryPrice || 0;
      this.trendStrength = this.config.state.trendStrength || 0;
      this.positionSize = this.config.state.positionSize || 0;
      this.tradeHistory = this.config.state.tradeHistory || [];
    }
  }

  async onTradeExecuted(signal: TradingSignal, result: any): Promise<void> {
    // 更新持仓状态
    if (signal.type === 'LONG' || signal.type === 'BUY') {
      this.currentPosition = 'LONG';
      this.entryPrice = signal.price || 0;
      this.positionSize = signal.quantity;
    } else if (signal.type === 'SHORT') {
      this.currentPosition = 'SHORT';
      this.entryPrice = signal.price || 0;
      this.positionSize = signal.quantity;
    } else if (signal.type === 'CLOSE_LONG' || signal.type === 'CLOSE_SHORT' || signal.type === 'SELL') {
      // 计算PNL
      const pnl = this.calculatePNL(signal.price || 0);
      
      this.currentPosition = 'NONE';
      this.entryPrice = 0;
      this.positionSize = 0;

      // 记录交易历史
      this.tradeHistory.push({
        timestamp: Date.now(),
        action: 'CLOSE',
        price: signal.price || 0,
        position: 'NONE',
        trendStrength: this.trendStrength,
        pnl,
      });
    }

    // 记录交易历史
    this.tradeHistory.push({
      timestamp: Date.now(),
      action: signal.type,
      price: signal.price || 0,
      position: this.currentPosition,
      trendStrength: this.trendStrength,
    });

    // 保留最近50条交易记录
    if (this.tradeHistory.length > 50) {
      this.tradeHistory = this.tradeHistory.slice(-50);
    }

    // 更新策略状态
    if (!this.config.state) {
      this.config.state = {};
    }

    this.config.state.currentPosition = this.currentPosition;
    this.config.state.entryPrice = this.entryPrice;
    this.config.state.trendStrength = this.trendStrength;
    this.config.state.positionSize = this.positionSize;
    this.config.state.tradeHistory = this.tradeHistory;
    this.config.state.lastExecutionTime = Date.now();
  }

  getMinDataLength(): number {
    const { trendPeriod = 20 } = this.config.parameters;
    return Math.max(trendPeriod + 10, 30); // 确保有足够的数据进行趋势分析
  }

  /**
   * 分析趋势
   */
  private analyzeTrend(marketData: KlineData[]): {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    strength: number;
    confidence: number;
  } {
    const { trendPeriod = 20, volatilityFilter = true, minVolatility = 0.02 } = this.config.parameters;
    
    const prices = marketData.slice(-trendPeriod).map(k => k.close);
    const volumes = marketData.slice(-trendPeriod).map(k => k.volume);

    // 计算价格变化
    const priceChange = this.calculatePriceChange(prices[0], prices[prices.length - 1]);
    
    // 计算趋势强度（基于线性回归斜率）
    const trendSlope = this.calculateTrendSlope(prices);
    
    // 计算波动率
    const volatility = this.calculateVolatility(prices, prices.length);
    
    // 计算成交量趋势
    const volumeTrend = this.calculateVolumeTrend(volumes);

    // 判断趋势方向
    let direction: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
    if (Math.abs(priceChange) > (this.config.parameters.trendThreshold || 2.0)) {
      direction = priceChange > 0 ? 'UP' : 'DOWN';
    }

    // 计算趋势强度（0-100）
    let strength = Math.abs(trendSlope) * 100;
    strength = Math.min(100, Math.max(0, strength));

    // 计算置信度
    let confidence = 0.5;
    
    // 价格变化越大，置信度越高
    confidence += Math.min(0.3, Math.abs(priceChange) / 10);
    
    // 成交量确认趋势，置信度增加
    if ((direction === 'UP' && volumeTrend > 0) || (direction === 'DOWN' && volumeTrend < 0)) {
      confidence += 0.2;
    }

    // 波动率过滤
    if (volatilityFilter && volatility < minVolatility) {
      confidence *= 0.5; // 低波动率时降低置信度
    }

    confidence = Math.min(1, Math.max(0, confidence));

    return { direction, strength, confidence };
  }

  /**
   * 计算趋势斜率
   */
  private calculateTrendSlope(prices: number[]): number {
    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    return slope / prices[0]; // 标准化斜率
  }

  /**
   * 计算成交量趋势
   */
  private calculateVolumeTrend(volumes: number[]): number {
    if (volumes.length < 2) return 0;
    
    const firstHalf = volumes.slice(0, Math.floor(volumes.length / 2));
    const secondHalf = volumes.slice(Math.floor(volumes.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    return (secondAvg - firstAvg) / firstAvg;
  }

  /**
   * 检查止损止盈条件
   */
  private checkStopConditions(currentPrice: number): TradingSignal | null {
    if (this.currentPosition === 'NONE' || this.entryPrice === 0) {
      return null;
    }

    const { stopLossPercent = 5.0, takeProfitPercent = 10.0 } = this.config.parameters;
    
    const priceChangePercent = this.calculatePriceChange(this.entryPrice, currentPrice);
    
    // 做多仓位的止损止盈
    if (this.currentPosition === 'LONG') {
      if (priceChangePercent <= -stopLossPercent) {
        return this.createCloseSignal(currentPrice, 'CLOSE_LONG', '止损平多');
      }
      if (priceChangePercent >= takeProfitPercent) {
        return this.createCloseSignal(currentPrice, 'CLOSE_LONG', '止盈平多');
      }
    }
    
    // 做空仓位的止损止盈
    if (this.currentPosition === 'SHORT') {
      if (priceChangePercent >= stopLossPercent) {
        return this.createCloseSignal(currentPrice, 'CLOSE_SHORT', '止损平空');
      }
      if (priceChangePercent <= -takeProfitPercent) {
        return this.createCloseSignal(currentPrice, 'CLOSE_SHORT', '止盈平空');
      }
    }

    return null;
  }

  /**
   * 检查趋势信号
   */
  private checkTrendSignals(
    currentKline: KlineData,
    trendAnalysis: { direction: 'UP' | 'DOWN' | 'SIDEWAYS'; strength: number; confidence: number }
  ): TradingSignal | null {
    const { enableShort = true, trendThreshold = 2.0 } = this.config.parameters;
    const { direction, strength, confidence } = trendAnalysis;

    // 置信度太低，不产生信号
    if (confidence < 0.6) {
      return null;
    }

    // 趋势强度不够，不产生信号
    if (strength < trendThreshold) {
      return null;
    }

    const currentPrice = currentKline.close;

    // 上涨趋势信号
    if (direction === 'UP') {
      if (this.currentPosition === 'SHORT') {
        // 平空
        return this.createCloseSignal(currentPrice, 'CLOSE_SHORT', '趋势反转平空');
      } else if (this.currentPosition === 'NONE') {
        // 开多
        return this.createOpenSignal(currentKline, 'LONG', '上涨趋势开多', confidence);
      }
    }

    // 下跌趋势信号
    if (direction === 'DOWN' && enableShort) {
      if (this.currentPosition === 'LONG') {
        // 平多
        return this.createCloseSignal(currentPrice, 'CLOSE_LONG', '趋势反转平多');
      } else if (this.currentPosition === 'NONE') {
        // 开空
        return this.createOpenSignal(currentKline, 'SHORT', '下跌趋势开空', confidence);
      }
    }

    return null;
  }

  /**
   * 创建开仓信号
   */
  private createOpenSignal(
    kline: KlineData,
    direction: 'LONG' | 'SHORT',
    reason: string,
    confidence: number
  ): TradingSignal {
    const positionSize = this.calculatePositionSize();
    const quantity = positionSize / kline.close;

    const { stopLossPercent = 5.0, takeProfitPercent = 10.0, leverage = 1 } = this.config.parameters;

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'LONG') {
      stopLoss = kline.close * (1 - stopLossPercent / 100);
      takeProfit = kline.close * (1 + takeProfitPercent / 100);
    } else {
      stopLoss = kline.close * (1 + stopLossPercent / 100);
      takeProfit = kline.close * (1 - takeProfitPercent / 100);
    }

    return this.createSignal(
      direction,
      kline.symbol,
      quantity,
      confidence,
      reason,
      {
        price: kline.close,
        stopLoss,
        takeProfit,
        leverage,
        metadata: {
          strategy: 'TrendFollowing',
          trendStrength: this.trendStrength,
          positionSize,
        },
      }
    );
  }

  /**
   * 创建平仓信号
   */
  private createCloseSignal(
    currentPrice: number,
    signalType: 'CLOSE_LONG' | 'CLOSE_SHORT',
    reason: string
  ): TradingSignal {
    return this.createSignal(
      signalType,
      this.config.symbols[0], // 使用配置中的第一个交易对
      this.positionSize,
      1.0, // 平仓信号置信度为100%
      reason,
      {
        price: currentPrice,
        metadata: {
          strategy: 'TrendFollowing',
          entryPrice: this.entryPrice,
          pnl: this.calculatePNL(currentPrice),
        },
      }
    );
  }

  /**
   * 计算仓位大小
   */
  private calculatePositionSize(): number {
    const { basePositionSize = 100, maxPositionSize = 500 } = this.config.parameters;
    
    // 根据趋势强度调整仓位大小
    const strengthMultiplier = Math.min(2, 1 + this.trendStrength / 50);
    let positionSize = basePositionSize * strengthMultiplier;
    
    // 限制最大仓位
    positionSize = Math.min(positionSize, maxPositionSize);
    
    return positionSize;
  }

  /**
   * 计算PNL
   */
  private calculatePNL(currentPrice: number): number {
    if (this.currentPosition === 'NONE' || this.entryPrice === 0) {
      return 0;
    }

    const { leverage = 1 } = this.config.parameters;
    
    let pnlPercent = 0;
    if (this.currentPosition === 'LONG') {
      pnlPercent = (currentPrice - this.entryPrice) / this.entryPrice;
    } else if (this.currentPosition === 'SHORT') {
      pnlPercent = (this.entryPrice - currentPrice) / this.entryPrice;
    }

    return this.positionSize * pnlPercent * leverage;
  }

  /**
   * 获取策略统计信息
   */
  getStrategyStats(): {
    currentPosition: string;
    entryPrice: number;
    currentPNL: number;
    trendStrength: number;
    totalTrades: number;
    winningTrades: number;
    winRate: number;
    totalPNL: number;
  } {
    const tradesWithPNL = this.tradeHistory.filter(trade => trade.pnl !== undefined);
    const winningTrades = tradesWithPNL.filter(trade => (trade.pnl || 0) > 0);
    const totalPNL = tradesWithPNL.reduce((sum, trade) => sum + (trade.pnl || 0), 0);

    return {
      currentPosition: this.currentPosition,
      entryPrice: this.entryPrice,
      currentPNL: this.calculatePNL(0), // 需要当前价格才能计算
      trendStrength: this.trendStrength,
      totalTrades: tradesWithPNL.length,
      winningTrades: winningTrades.length,
      winRate: tradesWithPNL.length > 0 ? winningTrades.length / tradesWithPNL.length : 0,
      totalPNL,
    };
  }

  /**
   * 获取交易历史
   */
  getTradeHistory(): Array<{
    timestamp: number;
    action: string;
    price: number;
    position: string;
    trendStrength: number;
    pnl?: number;
  }> {
    return [...this.tradeHistory];
  }
}