import { BaseIndicator, IndicatorMetadata, IndicatorResult } from '../base-indicator';
import { KlineData } from '../../schemas/kline-data.schema';

/**
 * RSI指标 (Relative Strength Index)
 * 相对强弱指数
 */
export class RSIIndicator extends BaseIndicator {
  getMetadata(): IndicatorMetadata {
    return {
      displayName: 'RSI',
      description: '相对强弱指数，用于识别超买超卖状态',
      category: 'momentum',
      outputType: 'single',
      chartType: 'separate',
      colorScheme: ['#9C27B0'],
      author: 'System',
      version: '1.0.0',
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: false,
          min: 2,
          max: 100,
          defaultValue: 14,
          description: 'RSI计算周期',
        },
        {
          name: 'overbought',
          type: 'number',
          required: false,
          min: 50,
          max: 100,
          defaultValue: 70,
          description: '超买阈值',
        },
        {
          name: 'oversold',
          type: 'number',
          required: false,
          min: 0,
          max: 50,
          defaultValue: 30,
          description: '超卖阈值',
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

    const { period = 14, overbought = 70, oversold = 30, source = 'close' } = this.config.parameters;
    
    if (data.length < period + 1) {
      return this.createResult([]);
    }

    // 获取价格数据
    const prices = this.extractPrices(data, source);
    
    // 计算RSI
    const rsiValues = this.calculateRSI(prices, period);

    // 生成交易信号
    const signals = this.generateTradingSignals(rsiValues, overbought, oversold, data);

    // 生成时间戳
    const timestamps = data.slice(period).map(k => k.closeTime);

    return this.createResult(rsiValues, {
      signals,
      timestamp: timestamps,
      validity: rsiValues.map(() => true),
    });
  }

  validateParameters(parameters: any): boolean {
    const { period = 14, overbought = 70, oversold = 30, source } = parameters;

    // 验证周期
    if (period < 2 || period > 100) return false;

    // 验证超买超卖阈值
    if (overbought < 50 || overbought > 100) return false;
    if (oversold < 0 || oversold > 50) return false;
    if (oversold >= overbought) return false;

    // 验证价格源
    if (source && !['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'].includes(source)) {
      return false;
    }

    return true;
  }

  getMinDataLength(): number {
    const period = this.config.parameters?.period || 14;
    return period + 10; // 额外缓冲
  }

  /**
   * 计算RSI
   */
  private calculateRSI(prices: number[], period: number): number[] {
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    // 计算价格变化
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    if (gains.length < period) {
      return rsi;
    }

    // 计算初始平均增益和损失
    let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;

    // 计算第一个RSI值
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    // 计算后续RSI值（使用Wilder's平滑）
    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
      
      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return rsi;
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
    rsiValues: number[],
    overbought: number,
    oversold: number,
    data: KlineData[]
  ): any[] {
    const signals: any[] = [];
    
    if (rsiValues.length < 2) {
      return signals;
    }

    const dataStartIndex = data.length - rsiValues.length;

    for (let i = 1; i < rsiValues.length; i++) {
      const currentRSI = rsiValues[i];
      const prevRSI = rsiValues[i - 1];

      const klineIndex = dataStartIndex + i;
      if (klineIndex >= data.length) continue;

      const currentKline = data[klineIndex];

      // 超卖区域反弹 - 买入信号
      if (prevRSI <= oversold && currentRSI > oversold) {
        const confidence = Math.min(0.9, (oversold - Math.min(prevRSI, 20)) / 20 + 0.5);
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            confidence,
            `RSI从超卖区域反弹，买入信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'oversold_bounce',
              threshold: oversold,
            }
          )
        );
      }

      // 超买区域回落 - 卖出信号
      if (prevRSI >= overbought && currentRSI < overbought) {
        const confidence = Math.min(0.9, (Math.max(prevRSI, 80) - overbought) / 20 + 0.5);
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            confidence,
            `RSI从超买区域回落，卖出信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'overbought_decline',
              threshold: overbought,
            }
          )
        );
      }

      // RSI穿越50中线
      if (prevRSI <= 50 && currentRSI > 50) {
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            0.6,
            `RSI上穿50中线，买入信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'midline_cross_up',
              threshold: 50,
            }
          )
        );
      } else if (prevRSI >= 50 && currentRSI < 50) {
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            0.6,
            `RSI下穿50中线，卖出信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'midline_cross_down',
              threshold: 50,
            }
          )
        );
      }

      // 极端超买超卖信号
      if (currentRSI >= 80) {
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            0.8,
            `RSI极度超买，强烈卖出信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'extreme_overbought',
              threshold: 80,
            }
          )
        );
      } else if (currentRSI <= 20) {
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            0.8,
            `RSI极度超卖，强烈买入信号 (RSI: ${currentRSI.toFixed(2)})`,
            currentKline.closeTime,
            {
              rsi: currentRSI,
              signalType: 'extreme_oversold',
              threshold: 20,
            }
          )
        );
      }
    }

    return signals;
  }
}