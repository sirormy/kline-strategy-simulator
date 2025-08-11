import { BaseIndicator, IndicatorMetadata, IndicatorResult } from '../base-indicator';
import { KlineData } from '../../schemas/kline-data.schema';

/**
 * KDJ指标 (Stochastic Oscillator with J line)
 * 随机指标，包含K、D、J三条线
 */
export class KDJIndicator extends BaseIndicator {
  getMetadata(): IndicatorMetadata {
    return {
      displayName: 'KDJ',
      description: '随机指标，通过K、D、J三条线判断超买超卖状态和趋势变化',
      category: 'momentum',
      outputType: 'multiple',
      outputNames: ['k', 'd', 'j'],
      chartType: 'separate',
      colorScheme: ['#2196F3', '#FF9800', '#4CAF50'],
      author: 'System',
      version: '1.0.0',
      parameterSchema: [
        {
          name: 'kPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 100,
          defaultValue: 9,
          description: 'K值计算周期（RSV周期）',
        },
        {
          name: 'dPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          defaultValue: 3,
          description: 'D值平滑周期',
        },
        {
          name: 'jPeriod',
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          defaultValue: 3,
          description: 'J值平滑周期',
        },
        {
          name: 'overbought',
          type: 'number',
          required: false,
          min: 50,
          max: 100,
          defaultValue: 80,
          description: '超买阈值',
        },
        {
          name: 'oversold',
          type: 'number',
          required: false,
          min: 0,
          max: 50,
          defaultValue: 20,
          description: '超卖阈值',
        },
        {
          name: 'enableJSignals',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: '是否启用J线信号',
        },
      ],
    };
  }

  async calculate(data: KlineData[]): Promise<IndicatorResult> {
    if (!this.validateDataIntegrity(data)) {
      throw new Error('Invalid market data');
    }

    const {
      kPeriod = 9,
      dPeriod = 3,
      jPeriod = 3,
      overbought = 80,
      oversold = 20,
    } = this.config.parameters;

    const minLength = Math.max(kPeriod, dPeriod, jPeriod) + 10;
    if (data.length < minLength) {
      return this.createResult({
        k: [],
        d: [],
        j: [],
      });
    }

    // 计算RSV (Raw Stochastic Value)
    const rsvValues = this.calculateRSV(data, kPeriod);
    
    if (rsvValues.length === 0) {
      return this.createResult({
        k: [],
        d: [],
        j: [],
      });
    }

    // 计算K值（RSV的移动平均）
    const kValues = this.calculateKValues(rsvValues, dPeriod);
    
    // 计算D值（K值的移动平均）
    const dValues = this.calculateDValues(kValues, jPeriod);
    
    // 计算J值（3*K - 2*D）
    const jValues = this.calculateJValues(kValues, dValues);

    // 对齐所有数组长度
    const finalLength = Math.min(kValues.length, dValues.length, jValues.length);
    const alignedK = kValues.slice(-finalLength);
    const alignedD = dValues.slice(-finalLength);
    const alignedJ = jValues.slice(-finalLength);

    // 生成交易信号
    const signals = this.generateTradingSignals(
      alignedK,
      alignedD,
      alignedJ,
      overbought,
      oversold,
      data
    );

    // 生成时间戳
    const timestamps = data.slice(-finalLength).map(k => k.closeTime);

    return this.createResult(
      {
        k: alignedK,
        d: alignedD,
        j: alignedJ,
      },
      {
        signals,
        timestamp: timestamps,
        validity: alignedK.map(() => true),
      }
    );
  }

  validateParameters(parameters: any): boolean {
    const {
      kPeriod = 9,
      dPeriod = 3,
      jPeriod = 3,
      overbought = 80,
      oversold = 20,
    } = parameters;

    // 验证周期参数
    if (kPeriod < 1 || kPeriod > 100) return false;
    if (dPeriod < 1 || dPeriod > 50) return false;
    if (jPeriod < 1 || jPeriod > 50) return false;

    // 验证超买超卖阈值
    if (overbought < 50 || overbought > 100) return false;
    if (oversold < 0 || oversold > 50) return false;
    if (oversold >= overbought) return false;

    return true;
  }

  getMinDataLength(): number {
    const { kPeriod = 9, dPeriod = 3, jPeriod = 3 } = this.config.parameters;
    return Math.max(kPeriod, dPeriod, jPeriod) + 20; // 额外缓冲
  }

  /**
   * 计算RSV (Raw Stochastic Value)
   * RSV = (收盘价 - N日内最低价) / (N日内最高价 - N日内最低价) * 100
   */
  private calculateRSV(data: KlineData[], period: number): number[] {
    const rsv: number[] = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const currentClose = data[i].close;
      const highestHigh = Math.max(...slice.map(k => k.high));
      const lowestLow = Math.min(...slice.map(k => k.low));
      
      if (highestHigh === lowestLow) {
        // 避免除零错误
        rsv.push(50);
      } else {
        const rsvValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
        rsv.push(Math.max(0, Math.min(100, rsvValue))); // 限制在0-100范围内
      }
    }
    
    return rsv;
  }

  /**
   * 计算K值
   * K值 = (2/3) * 前一日K值 + (1/3) * 当日RSV
   * 简化为移动平均：K = SMA(RSV, period)
   */
  private calculateKValues(rsvValues: number[], period: number): number[] {
    if (rsvValues.length === 0) return [];
    
    const kValues: number[] = [];
    let sum = 0;
    
    // 初始化：使用前period个RSV的平均值作为第一个K值
    for (let i = 0; i < Math.min(period, rsvValues.length); i++) {
      sum += rsvValues[i];
      if (i === 0) {
        kValues.push(rsvValues[i]); // 第一个K值等于第一个RSV
      } else {
        kValues.push(sum / (i + 1));
      }
    }
    
    // 使用指数移动平均计算后续K值
    const smoothingFactor = 2 / (period + 1);
    for (let i = period; i < rsvValues.length; i++) {
      const newK = (rsvValues[i] * smoothingFactor) + (kValues[kValues.length - 1] * (1 - smoothingFactor));
      kValues.push(newK);
    }
    
    return kValues;
  }

  /**
   * 计算D值
   * D值 = (2/3) * 前一日D值 + (1/3) * 当日K值
   * 简化为移动平均：D = SMA(K, period)
   */
  private calculateDValues(kValues: number[], period: number): number[] {
    if (kValues.length === 0) return [];
    
    const dValues: number[] = [];
    let sum = 0;
    
    // 初始化：使用前period个K值的平均值作为第一个D值
    for (let i = 0; i < Math.min(period, kValues.length); i++) {
      sum += kValues[i];
      if (i === 0) {
        dValues.push(kValues[i]); // 第一个D值等于第一个K值
      } else {
        dValues.push(sum / (i + 1));
      }
    }
    
    // 使用指数移动平均计算后续D值
    const smoothingFactor = 2 / (period + 1);
    for (let i = period; i < kValues.length; i++) {
      const newD = (kValues[i] * smoothingFactor) + (dValues[dValues.length - 1] * (1 - smoothingFactor));
      dValues.push(newD);
    }
    
    return dValues;
  }

  /**
   * 计算J值
   * J值 = 3 * K值 - 2 * D值
   */
  private calculateJValues(kValues: number[], dValues: number[]): number[] {
    const jValues: number[] = [];
    const minLength = Math.min(kValues.length, dValues.length);
    
    for (let i = 0; i < minLength; i++) {
      const jValue = 3 * kValues[i] - 2 * dValues[i];
      jValues.push(jValue);
    }
    
    return jValues;
  }

  /**
   * 生成交易信号
   */
  private generateTradingSignals(
    kValues: number[],
    dValues: number[],
    jValues: number[],
    overbought: number,
    oversold: number,
    data: KlineData[]
  ): any[] {
    const signals: any[] = [];
    const { enableJSignals = true } = this.config.parameters;
    
    if (kValues.length < 2 || dValues.length < 2) {
      return signals;
    }

    const dataStartIndex = data.length - kValues.length;

    for (let i = 1; i < kValues.length; i++) {
      const currentK = kValues[i];
      const currentD = dValues[i];
      const currentJ = jValues[i];
      const prevK = kValues[i - 1];
      const prevD = dValues[i - 1];
      const prevJ = jValues[i - 1];

      const klineIndex = dataStartIndex + i;
      if (klineIndex >= data.length) continue;

      const currentKline = data[klineIndex];

      // K线穿越D线信号
      if (prevK <= prevD && currentK > currentD) {
        // K线上穿D线 - 金叉买入信号
        let confidence = 0.7;
        
        // 在超卖区域的金叉信号更强
        if (currentK < oversold + 10 && currentD < oversold + 10) {
          confidence = 0.9;
        }
        
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            confidence,
            `KDJ金叉，买入信号 (K: ${currentK.toFixed(2)}, D: ${currentD.toFixed(2)})`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'golden_cross',
            }
          )
        );
      } else if (prevK >= prevD && currentK < currentD) {
        // K线下穿D线 - 死叉卖出信号
        let confidence = 0.7;
        
        // 在超买区域的死叉信号更强
        if (currentK > overbought - 10 && currentD > overbought - 10) {
          confidence = 0.9;
        }
        
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            confidence,
            `KDJ死叉，卖出信号 (K: ${currentK.toFixed(2)}, D: ${currentD.toFixed(2)})`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'death_cross',
            }
          )
        );
      }

      // 超买超卖信号
      if (currentK >= overbought && currentD >= overbought) {
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            0.8,
            `KDJ超买，卖出信号 (K: ${currentK.toFixed(2)}, D: ${currentD.toFixed(2)})`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'overbought',
            }
          )
        );
      } else if (currentK <= oversold && currentD <= oversold) {
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            0.8,
            `KDJ超卖，买入信号 (K: ${currentK.toFixed(2)}, D: ${currentD.toFixed(2)})`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'oversold',
            }
          )
        );
      }

      // J线信号（如果启用）
      if (enableJSignals && i > 0) {
        // J线从下方穿越0
        if (prevJ <= 0 && currentJ > 0) {
          signals.push(
            this.createSignal(
              'BUY',
              currentKline.symbol,
              0.6,
              `J线上穿0轴，买入信号 (J: ${currentJ.toFixed(2)})`,
              currentKline.closeTime,
              {
                k: currentK,
                d: currentD,
                j: currentJ,
                signalType: 'j_cross_up_zero',
              }
            )
          );
        }
        // J线从上方穿越100
        else if (prevJ >= 100 && currentJ < 100) {
          signals.push(
            this.createSignal(
              'SELL',
              currentKline.symbol,
              0.6,
              `J线下穿100，卖出信号 (J: ${currentJ.toFixed(2)})`,
              currentKline.closeTime,
              {
                k: currentK,
                d: currentD,
                j: currentJ,
                signalType: 'j_cross_down_100',
              }
            )
          );
        }

        // J线极值信号
        if (currentJ <= -10) {
          signals.push(
            this.createSignal(
              'BUY',
              currentKline.symbol,
              0.9,
              `J线极度超卖，强烈买入信号 (J: ${currentJ.toFixed(2)})`,
              currentKline.closeTime,
              {
                k: currentK,
                d: currentD,
                j: currentJ,
                signalType: 'j_extreme_oversold',
              }
            )
          );
        } else if (currentJ >= 110) {
          signals.push(
            this.createSignal(
              'SELL',
              currentKline.symbol,
              0.9,
              `J线极度超买，强烈卖出信号 (J: ${currentJ.toFixed(2)})`,
              currentKline.closeTime,
              {
                k: currentK,
                d: currentD,
                j: currentJ,
                signalType: 'j_extreme_overbought',
              }
            )
          );
        }
      }

      // 三线共振信号
      if (currentK > currentD && currentD > 50 && currentJ > currentK) {
        signals.push(
          this.createSignal(
            'BUY',
            currentKline.symbol,
            0.85,
            `KDJ三线共振向上，强烈买入信号`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'triple_resonance_up',
            }
          )
        );
      } else if (currentK < currentD && currentD < 50 && currentJ < currentK) {
        signals.push(
          this.createSignal(
            'SELL',
            currentKline.symbol,
            0.85,
            `KDJ三线共振向下，强烈卖出信号`,
            currentKline.closeTime,
            {
              k: currentK,
              d: currentD,
              j: currentJ,
              signalType: 'triple_resonance_down',
            }
          )
        );
      }
    }

    return signals;
  }
}