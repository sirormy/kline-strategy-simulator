import { BaseIndicator, IndicatorMetadata, IndicatorResult } from '../base-indicator';
import { KlineData } from '../../schemas/kline-data.schema';

/**
 * 移动平均指标 (Moving Average)
 * 支持简单移动平均(SMA)和指数移动平均(EMA)
 */
export class MAIndicator extends BaseIndicator {
  getMetadata(): IndicatorMetadata {
    return {
      displayName: '移动平均线',
      description: '计算价格的移动平均值，支持SMA和EMA两种类型',
      category: 'trend',
      outputType: 'single',
      chartType: 'overlay',
      colorScheme: ['#2196F3'],
      author: 'System',
      version: '1.0.0',
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: true,
          min: 1,
          max: 200,
          defaultValue: 20,
          description: '移动平均周期',
        },
        {
          name: 'type',
          type: 'string',
          required: true,
          options: ['SMA', 'EMA'],
          defaultValue: 'SMA',
          description: '移动平均类型：SMA=简单移动平均, EMA=指数移动平均',
        },
        {
          name: 'source',
          type: 'string',
          required: false,
          options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
          defaultValue: 'close',
          description: '价格源：close=收盘价, hl2=(高+低)/2, hlc3=(高+低+收)/3, ohlc4=(开+高+低+收)/4',
        },
      ],
    };
  }

  async calculate(data: KlineData[]): Promise<IndicatorResult> {
    if (!this.validateDataIntegrity(data)) {
      throw new Error('Invalid market data');
    }

    const { period, type, source } = this.config.parameters;
    
    if (data.length < period) {
      return this.createResult([]);
    }

    // 获取价格数据
    const prices = this.extractPrices(data, source || 'close');
    
    // 计算移动平均
    let values: number[];
    if (type === 'EMA') {
      values = this.calculateEMA(prices, period);
    } else {
      values = this.calculateSMA(prices, period);
    }

    // 生成时间戳
    const timestamps = data.slice(period - 1).map(k => k.closeTime);

    return this.createResult(values, {
      timestamp: timestamps,
      validity: values.map(() => true),
    });
  }

  validateParameters(parameters: any): boolean {
    const { period, type, source } = parameters;

    // 验证周期
    if (!period || period < 1 || period > 200) {
      return false;
    }

    // 验证类型
    if (type && !['SMA', 'EMA'].includes(type)) {
      return false;
    }

    // 验证价格源
    if (source && !['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'].includes(source)) {
      return false;
    }

    return true;
  }

  getMinDataLength(): number {
    return this.config.parameters?.period || this.config.period || 20;
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
}