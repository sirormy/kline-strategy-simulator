import { BaseIndicator, IndicatorMetadata, IndicatorResult } from '../base-indicator';
import { KlineData } from '../../schemas/kline-data.schema';

/**
 * MACD指标 (Moving Average Convergence Divergence)
 * 移动平均收敛散度指标
 */
export class MACDIndicator extends BaseIndicator {
  getMetadata(): IndicatorMetadata {
    return {
      displayName: 'MACD',
      description: '移动平均收敛散度指标，用于识别趋势变化和动量',
      category: 'momentum',
      outputType: 'multiple',
      outputNames: ['macd', 'signal', 'histogram'],
      chartType: 'separate',
      colorScheme: ['#2196F3', '#FF9800', '#4CAF50'],
      author: 'System',
      version: '1.0.0',
      parameterSchema: [
        {
          name: 'fastPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          defaultValue: 12,
          description: '快线EMA周期',
        },
        {
          name: 'slowPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 100,
          defaultValue: 26,
          description: '慢线EMA周期',
        },
        {
          name: 'signalPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          defaultValue: 9,
          description: '信号线EMA周期',
        },
        {
          name: 'source',
          type: 'string',
          required: false,
          options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
          defaultValue: 'close',
          description: '价格源',
        },
      ],
    };
  }

  async calculate(data: KlineData[]): Promise<IndicatorResult> {
    if (!this.validateDataIntegrity(data)) {
      throw new Error('Invalid market data');
    }

    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, source = 'close' } = this.config.parameters;
    
    const minLength = Math.max(slowPeriod, fastPeriod) + signalPeriod;
    if (data.length < minLength) {
      return this.createResult({
        macd: [],
        signal: [],
        histogram: [],
      });
    }

    // 获取价格数据
    const prices = this.extractPrices(data, source);
    
    // 计算快线和慢线EMA
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    
    // 计算MACD线（快线 - 慢线）
    const macdLine: number[] = [];
    const startIndex = slowPeriod - fastPeriod;
    
    for (let i = startIndex; i < fastEMA.length; i++) {
      const slowIndex = i - startIndex;
      if (slowIndex < slowEMA.length) {
        macdLine.push(fastEMA[i] - slowEMA[slowIndex]);
      }
    }
    
    // 计算信号线（MACD的EMA）
    const signalLine = this.calculateEMA(macdLine, signalPeriod);
    
    // 计算柱状图（MACD - 信号线）
    const histogram: number[] = [];
    const signalStartIndex = macdLine.length - signalLine.length;
    
    for (let i = 0; i < signalLine.length; i++) {
      const macdIndex = signalStartIndex + i;
      histogram.push(macdLine[macdIndex] - signalLine[i]);
    }

    // 对齐所有数组长度
    const finalLength = histogram.length;
    const alignedMacd = macdLine.slice(-finalLength);
    const alignedSignal = signalLine.slice(-finalLength);

    // 生成交易信号
    const signals = this.generateTradingSignals(alignedMacd, alignedSignal, histogram, data);

    // 生成时间戳
    const timestamps = data.slice(-finalLength).map(k => k.closeTime);

    return this.createResult(
      {
        macd: alignedMacd,
        signal: alignedSignal,
        histogram: histogram,
      },
      {
        signals,
        timestamp: timestamps,
        validity: alignedMacd.map(() => true),
      }
    );
  }

  validateParameters(parameters: any): boolean {
    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, source } = parameters;

    // 验证周期参数
    if (fastPeriod < 1 || fastPeriod > 50) return false;
    if (slowPeriod < 1 || slowPeriod > 100) return false;
    if (signalPeriod < 1 || signalPeriod > 50) return false;

    // 快线周期必须小于慢线周期
    if (fastPeriod >= slowPeriod) return false;

    // 验证价格源
    if (source && !['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'].includes(source)) {
      return false;
    }

    return true;
  }

  getMinDataLength(): number {
    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = this.config.parameters;
    return Math.max(slowPeriod, fastPeriod) + signalPeriod + 10; // 额外缓冲
  }

  /**
   * 提取价格数据
   */
  private extractPrices(data: KlineData[], source: string): number[] {
    switch (source) {
      case 'open':
        return data.map(k => k.open);
      case 'high':
        return data.map(k => k.high);
      case 'low':
        return data.map(k => k.low);
      case 'close':
        return data.map(k => k.close);
      case 'hl2':
        return data.map(k => (k.high + k.low) / 2);
      case 'hlc3':
        return data.map(k => (k.high + k.low + k.close) / 3);
      case 'ohlc4':
        return data.map(k => (k.open + k.high + k.low + k.close) / 4);
      default:
        return data.map(k => k.close);
    }
  }

  /**
   * 生成交易信号
   */
  private generateTradingSignals(
    macd: number[],
    signal: number[],
    histogram: number[],
    data: KlineData[]
  ): any[] {
    const signals: any[] = [];
    
    if (macd.length < 2 || signal.length < 2) {
      return signals;
    }

    const dataStartIndex = data.length - macd.length;

    for (let i = 1; i < macd.length; i++) {
      const currentMacd = macd[i];
      const currentSignal = signal[i];
      const prevMacd = macd[i - 1];
      const prevSignal = signal[i - 1];
      const currentHistogram = histogram[i];
      const prevHistogram = histogram[i - 1];

      const klineIndex = dataStartIndex + i;
      if (klineIndex >= data.length) continue;

      const currentKline = data[klineIndex];

      // MACD线穿越信号线
      if (prevMacd <= prevSignal && currentMacd > currentSignal) {
        // 金叉 - 买入信号
        const confidence = Math.min(0.9, Math.abs(currentMacd - currentSignal) / Math.abs(currentSignal) + 0.5);
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            confidence,
            'MACD金叉，买入信号',
            currentKline.closeTime,
            {
              macd: currentMacd,
              signal: currentSignal,
              histogram: currentHistogram,
              crossType: 'golden_cross',
            }
          )
        );
      } else if (prevMacd >= prevSignal && currentMacd < currentSignal) {
        // 死叉 - 卖出信号
        const confidence = Math.min(0.9, Math.abs(currentMacd - currentSignal) / Math.abs(currentSignal) + 0.5);
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            confidence,
            'MACD死叉，卖出信号',
            currentKline.closeTime,
            {
              macd: currentMacd,
              signal: currentSignal,
              histogram: currentHistogram,
              crossType: 'death_cross',
            }
          )
        );
      }

      // 柱状图穿越零轴
      if (prevHistogram <= 0 && currentHistogram > 0) {
        // 柱状图上穿零轴 - 买入信号
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            0.7,
            'MACD柱状图上穿零轴，买入信号',
            currentKline.closeTime,
            {
              macd: currentMacd,
              signal: currentSignal,
              histogram: currentHistogram,
              crossType: 'histogram_above_zero',
            }
          )
        );
      } else if (prevHistogram >= 0 && currentHistogram < 0) {
        // 柱状图下穿零轴 - 卖出信号
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            0.7,
            'MACD柱状图下穿零轴，卖出信号',
            currentKline.closeTime,
            {
              macd: currentMacd,
              signal: currentSignal,
              histogram: currentHistogram,
              crossType: 'histogram_below_zero',
            }
          )
        );
      }
    }

    return signals;
  }
}