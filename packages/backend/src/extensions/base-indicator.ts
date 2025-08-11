import { KlineData } from '../schemas/kline-data.schema';

// 指标配置接口
export interface IndicatorConfig {
  type: string;
  period: number;
  parameters?: { [key: string]: any };
  metadata?: IndicatorMetadata;
}

// 指标元数据接口
export interface IndicatorMetadata {
  displayName: string;
  description: string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'custom';
  outputType: 'single' | 'multiple';
  outputNames?: string[]; // 多值指标的输出名称
  parameterSchema: ParameterSchema[];
  chartType: 'overlay' | 'separate'; // 图表显示类型
  colorScheme?: string[]; // 颜色方案
  author?: string;
  version?: string;
}

// 参数模式定义（重用策略的定义）
export interface ParameterSchema {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
  options?: string[];
  description: string;
}

// 指标结果接口
export interface IndicatorResult {
  type: string;
  values: number[] | { [key: string]: number[] }; // 支持单值和多值输出
  signals?: TradingSignal[]; // 可选的交易信号
  metadata?: IndicatorMetadata;
  timestamp?: number[];
  validity?: boolean[]; // 每个值的有效性标记
}

// 交易信号接口（重用策略的定义）
export interface TradingSignal {
  type: 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  symbol: string;
  quantity: number;
  price?: number;
  confidence: number;
  reason: string;
  timestamp: number;
  metadata?: { [key: string]: any };
}

// 指标基类
export abstract class BaseIndicator {
  protected config: IndicatorConfig;
  protected metadata: IndicatorMetadata;
  protected cache: Map<string, any> = new Map();

  constructor(config: IndicatorConfig) {
    this.config = config;
    this.metadata = this.getMetadata();
    this.validateConfig();
  }

  // 必须实现的抽象方法
  abstract getMetadata(): IndicatorMetadata;
  abstract calculate(data: KlineData[]): Promise<IndicatorResult>;
  abstract validateParameters(parameters: any): boolean;

  // 可选重写的方法
  async onInit?(): Promise<void>;
  async onDestroy?(): Promise<void>;

  // 获取指标配置
  getConfig(): IndicatorConfig {
    return this.config;
  }

  // 更新指标配置
  updateConfig(newConfig: Partial<IndicatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    this.clearCache(); // 配置更新后清除缓存
  }

  // 获取指标元数据
  getIndicatorMetadata(): IndicatorMetadata {
    return this.metadata;
  }

  // 获取所需的最小数据量
  getMinDataLength(): number {
    return this.config.period || 1;
  }

  // 验证数据是否足够
  validateData(data: KlineData[]): boolean {
    return data.length >= this.getMinDataLength();
  }

  // 清除缓存
  clearCache(): void {
    this.cache.clear();
  }

  // 获取缓存键
  protected getCacheKey(data: KlineData[], suffix?: string): string {
    const lastTimestamp = data[data.length - 1]?.closeTime || 0;
    const dataLength = data.length;
    const configHash = this.hashConfig();
    return `${this.config.type}_${configHash}_${dataLength}_${lastTimestamp}${suffix ? '_' + suffix : ''}`;
  }

  // 配置哈希
  private hashConfig(): string {
    const configStr = JSON.stringify({
      type: this.config.type,
      period: this.config.period,
      parameters: this.config.parameters,
    });
    
    // 简单哈希函数
    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString();
  }

  // 验证配置
  private validateConfig(): void {
    if (!this.config.type) {
      throw new Error('Indicator must have a type');
    }

    if (!this.validateParameters(this.config.parameters || {})) {
      throw new Error('Invalid indicator parameters');
    }
  }

  // 创建指标结果的辅助方法
  protected createResult(
    values: number[] | { [key: string]: number[] },
    options?: {
      signals?: TradingSignal[];
      timestamp?: number[];
      validity?: boolean[];
    }
  ): IndicatorResult {
    return {
      type: this.config.type,
      values,
      signals: options?.signals,
      metadata: this.metadata,
      timestamp: options?.timestamp,
      validity: options?.validity,
    };
  }

  // 常用技术指标计算方法

  // 简单移动平均
  protected calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    
    return sma;
  }

  // 指数移动平均
  protected calculateEMA(prices: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    if (prices.length === 0) return ema;
    
    // 第一个EMA值使用第一个价格
    ema[0] = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }
    
    return ema;
  }

  // 标准差
  protected calculateStandardDeviation(values: number[], period: number): number[] {
    const result: number[] = [];
    
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const mean = slice.reduce((sum, val) => sum + val, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      result.push(Math.sqrt(variance));
    }
    
    return result;
  }

  // 最高价
  protected calculateHighest(highs: number[], period: number): number[] {
    const result: number[] = [];
    
    for (let i = period - 1; i < highs.length; i++) {
      const slice = highs.slice(i - period + 1, i + 1);
      result.push(Math.max(...slice));
    }
    
    return result;
  }

  // 最低价
  protected calculateLowest(lows: number[], period: number): number[] {
    const result: number[] = [];
    
    for (let i = period - 1; i < lows.length; i++) {
      const slice = lows.slice(i - period + 1, i + 1);
      result.push(Math.min(...slice));
    }
    
    return result;
  }

  // 真实波幅 (True Range)
  protected calculateTrueRange(data: KlineData[]): number[] {
    const tr: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const previous = data[i - 1];
      
      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);
      
      tr.push(Math.max(tr1, tr2, tr3));
    }
    
    return tr;
  }

  // 价格变化
  protected calculatePriceChange(prices: number[]): number[] {
    const changes: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    return changes;
  }

  // 价格变化百分比
  protected calculatePriceChangePercent(prices: number[]): number[] {
    const changes: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
      changes.push(change);
    }
    
    return changes;
  }

  // 交叉检测
  protected detectCrossover(series1: number[], series2: number[]): {
    bullishCrosses: number[];
    bearishCrosses: number[];
  } {
    const bullishCrosses: number[] = [];
    const bearishCrosses: number[] = [];
    
    for (let i = 1; i < Math.min(series1.length, series2.length); i++) {
      const prev1 = series1[i - 1];
      const prev2 = series2[i - 1];
      const curr1 = series1[i];
      const curr2 = series2[i];
      
      // 向上穿越
      if (prev1 <= prev2 && curr1 > curr2) {
        bullishCrosses.push(i);
      }
      
      // 向下穿越
      if (prev1 >= prev2 && curr1 < curr2) {
        bearishCrosses.push(i);
      }
    }
    
    return { bullishCrosses, bearishCrosses };
  }

  // 信号生成辅助方法
  protected createSignal(
    type: TradingSignal['type'],
    symbol: string,
    confidence: number,
    reason: string,
    timestamp: number,
    metadata?: any
  ): TradingSignal {
    return {
      type,
      symbol,
      quantity: 0, // 指标信号通常不包含具体数量
      confidence: Math.max(0, Math.min(1, confidence)),
      reason,
      timestamp,
      metadata,
    };
  }

  // 数据验证辅助方法
  protected validateDataIntegrity(data: KlineData[]): boolean {
    if (!data || data.length === 0) {
      return false;
    }

    // 检查数据完整性
    for (const kline of data) {
      if (!kline.open || !kline.high || !kline.low || !kline.close || !kline.volume) {
        return false;
      }

      // 检查价格逻辑
      if (kline.high < kline.low || 
          kline.high < kline.open || 
          kline.high < kline.close ||
          kline.low > kline.open || 
          kline.low > kline.close) {
        return false;
      }
    }

    return true;
  }
}

// 指标实现接口
export interface IndicatorImplementation {
  new (config: IndicatorConfig): BaseIndicator;
}

// 指标工厂接口
export interface IndicatorFactory {
  createIndicator(config: IndicatorConfig): BaseIndicator;
  getAvailableIndicators(): IndicatorMetadata[];
  isIndicatorSupported(type: string): boolean;
}