import { KlineData } from '../schemas/kline-data.schema';
import { StrategyConfig, StrategyMetadata } from '../schemas/strategy.schema';

// 交易信号接口
export interface TradingSignal {
  type: 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  symbol: string;
  quantity: number;
  price?: number;
  confidence: number; // 0-1之间的置信度
  reason: string;
  timestamp: number;
  metadata?: {
    stopLoss?: number;
    takeProfit?: number;
    leverage?: number;
    [key: string]: any;
  };
}

// 指标结果接口
export interface IndicatorResult {
  type: string;
  values: number[] | { [key: string]: number[] };
  signals?: TradingSignal[];
  metadata?: any;
}

// 策略基类
export abstract class BaseStrategy {
  protected config: StrategyConfig;
  protected metadata: StrategyMetadata;
  protected isInitialized: boolean = false;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.metadata = this.getMetadata();
    this.validateConfig();
  }

  // 必须实现的抽象方法
  abstract getMetadata(): StrategyMetadata;
  abstract generateSignals(
    marketData: KlineData[], 
    indicators: IndicatorResult[]
  ): Promise<TradingSignal[]>;
  abstract validateParameters(parameters: any): boolean;

  // 可选重写的方法
  async onInit?(): Promise<void>;
  async onDestroy?(): Promise<void>;
  async onMarketDataUpdate?(data: KlineData): Promise<void>;
  async onTradeExecuted?(signal: TradingSignal, result: any): Promise<void>;

  // 获取策略配置
  getConfig(): StrategyConfig {
    return this.config;
  }

  // 更新策略配置
  updateConfig(newConfig: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }

  // 获取策略元数据
  getStrategyMetadata(): StrategyMetadata {
    return this.metadata;
  }

  // 初始化策略
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.onInit) {
      await this.onInit();
    }

    this.isInitialized = true;
  }

  // 销毁策略
  async destroy(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    if (this.onDestroy) {
      await this.onDestroy();
    }

    this.isInitialized = false;
  }

  // 检查策略是否已初始化
  isReady(): boolean {
    return this.isInitialized;
  }

  // 获取所需的最小数据量
  getMinDataLength(): number {
    // 默认需要至少30个数据点，子类可以重写
    return 30;
  }

  // 获取所需的指标列表
  getRequiredIndicators(): string[] {
    return this.metadata.requiredIndicators || [];
  }

  // 验证市场数据是否足够
  validateMarketData(marketData: KlineData[]): boolean {
    return marketData.length >= this.getMinDataLength();
  }

  // 验证配置
  private validateConfig(): void {
    if (!this.config.symbols || this.config.symbols.length === 0) {
      throw new Error('Strategy must have at least one symbol');
    }

    if (!this.config.timeframe) {
      throw new Error('Strategy must have a timeframe');
    }

    if (!this.validateParameters(this.config.parameters)) {
      throw new Error('Invalid strategy parameters');
    }
  }

  // 创建交易信号的辅助方法
  protected createSignal(
    type: TradingSignal['type'],
    symbol: string,
    quantity: number,
    confidence: number,
    reason: string,
    options?: {
      price?: number;
      stopLoss?: number;
      takeProfit?: number;
      leverage?: number;
      metadata?: any;
    }
  ): TradingSignal {
    return {
      type,
      symbol,
      quantity,
      price: options?.price,
      confidence: Math.max(0, Math.min(1, confidence)), // 确保在0-1范围内
      reason,
      timestamp: Date.now(),
      metadata: {
        stopLoss: options?.stopLoss,
        takeProfit: options?.takeProfit,
        leverage: options?.leverage,
        ...options?.metadata,
      },
    };
  }

  // 计算技术指标的辅助方法
  protected calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    
    return sma;
  }

  protected calculateEMA(prices: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // 第一个EMA值使用SMA
    ema[0] = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = 1; i < prices.length - period + 1; i++) {
      ema[i] = (prices[i + period - 1] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }
    
    return ema;
  }

  // 价格变化百分比计算
  protected calculatePriceChange(oldPrice: number, newPrice: number): number {
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  // 波动率计算
  protected calculateVolatility(prices: number[], period: number): number {
    if (prices.length < period) {
      return 0;
    }

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 252); // 年化波动率
  }
}

// 策略实现接口
export interface StrategyImplementation {
  new (config: StrategyConfig): BaseStrategy;
}

// 策略工厂接口
export interface StrategyFactory {
  createStrategy(config: StrategyConfig): BaseStrategy;
  getAvailableStrategies(): StrategyMetadata[];
  isStrategySupported(type: string): boolean;
}