import { Injectable, Logger } from '@nestjs/common';
import { Position, PositionSide } from '../schemas/position.schema';
import { TradeOrder, OrderSide } from '../schemas/trade-order.schema';
import { MarketDataService } from './market-data.service';

export interface PNLResult {
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  roe: number; // Return on Equity (%)
  commission: number;
  fundingFee: number;
  netPnl: number; // PNL after fees
}

export interface MarginCalculation {
  initialMargin: number;
  maintenanceMargin: number;
  marginRatio: number;
  liquidationPrice: number;
}

export interface FundingFeeCalculation {
  fundingRate: number;
  fundingFee: number;
  nextFundingTime: number;
}

export interface TradingFees {
  makerFee: number;
  takerFee: number;
  commission: number;
  commissionAsset: string;
}

@Injectable()
export class PNLCalculatorService {
  private readonly logger = new Logger(PNLCalculatorService.name);

  // 默认费率配置
  private readonly defaultFeeRates = {
    spot: {
      maker: 0.001,  // 0.1%
      taker: 0.001,  // 0.1%
    },
    futures: {
      maker: 0.0002, // 0.02%
      taker: 0.0004, // 0.04%
    },
    fundingRate: 0.0001, // 0.01% 每8小时
  };

  // 维持保证金率
  private readonly maintenanceMarginRates = {
    default: 0.05, // 5%
    high_leverage: 0.1, // 10% (杠杆 > 20x)
  };

  constructor(
    private readonly marketDataService: MarketDataService,
  ) {}

  /**
   * 计算持仓的实时PNL
   */
  async calculatePositionPNL(
    position: Position,
    currentPrice?: number
  ): Promise<PNLResult> {
    try {
      // 获取当前价格
      const markPrice = currentPrice || await this.getCurrentPrice(position.symbol);
      if (!markPrice) {
        throw new Error(`Unable to get current price for ${position.symbol}`);
      }

      // 计算未实现盈亏
      const unrealizedPnl = this.calculateUnrealizedPnl(position, markPrice);

      // 已实现盈亏（如果持仓已关闭）
      const realizedPnl = position.isClosed ? 
        (position.realizedPnl || 0) : 0;

      // 总盈亏
      const totalPnl = unrealizedPnl + realizedPnl;

      // 计算ROE (Return on Equity)
      const roe = position.margin > 0 ? (totalPnl / position.margin) * 100 : 0;

      // 费用
      const commission = position.totalCommission || 0;
      const fundingFee = position.totalFundingFee || 0;

      // 净盈亏（扣除费用）
      const netPnl = totalPnl - commission - fundingFee;

      return {
        unrealizedPnl,
        realizedPnl,
        totalPnl,
        roe,
        commission,
        fundingFee,
        netPnl,
      };

    } catch (error) {
      this.logger.error(`Failed to calculate PNL for position ${position.id}:`, error);
      throw error;
    }
  }

  /**
   * 计算未实现盈亏
   */
  calculateUnrealizedPnl(position: Position, currentPrice: number): number {
    if (position.isClosed) {
      return 0;
    }

    const priceDiff = position.side === PositionSide.LONG 
      ? currentPrice - position.entryPrice 
      : position.entryPrice - currentPrice;
    
    return priceDiff * position.size * position.leverage;
  }

  /**
   * 计算已实现盈亏
   */
  calculateRealizedPnl(
    position: Position,
    closePrice: number,
    closeQuantity?: number
  ): number {
    const quantity = closeQuantity || position.size;
    
    const priceDiff = position.side === PositionSide.LONG 
      ? closePrice - position.entryPrice 
      : position.entryPrice - closePrice;
    
    return priceDiff * quantity * position.leverage;
  }

  /**
   * 计算保证金相关信息
   */
  calculateMarginInfo(
    position: Position,
    currentPrice: number,
    accountEquity: number
  ): MarginCalculation {
    // 初始保证金
    const initialMargin = (position.size * position.entryPrice) / position.leverage;

    // 维持保证金率
    const maintenanceMarginRate = position.leverage > 20 ? 
      this.maintenanceMarginRates.high_leverage : 
      this.maintenanceMarginRates.default;

    // 维持保证金
    const maintenanceMargin = position.size * currentPrice * maintenanceMarginRate;

    // 保证金率
    const unrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);
    const marginBalance = initialMargin + unrealizedPnl;
    const marginRatio = marginBalance > 0 ? (maintenanceMargin / marginBalance) * 100 : 100;

    // 强平价格
    const liquidationPrice = this.calculateLiquidationPrice(position, maintenanceMarginRate);

    return {
      initialMargin,
      maintenanceMargin,
      marginRatio,
      liquidationPrice,
    };
  }

  /**
   * 计算强平价格
   */
  calculateLiquidationPrice(position: Position, maintenanceMarginRate: number): number {
    const { side, entryPrice, leverage, size } = position;
    
    // 简化的强平价格计算
    // 实际计算会更复杂，需要考虑手续费、资金费率等
    const maintenanceMarginRatio = maintenanceMarginRate;
    
    if (side === PositionSide.LONG) {
      // 多头强平价格 = 开仓价格 * (1 - 1/杠杆 + 维持保证金率)
      return entryPrice * (1 - 1/leverage + maintenanceMarginRatio);
    } else {
      // 空头强平价格 = 开仓价格 * (1 + 1/杠杆 - 维持保证金率)
      return entryPrice * (1 + 1/leverage - maintenanceMarginRatio);
    }
  }

  /**
   * 计算交易手续费
   */
  calculateTradingFees(
    symbol: string,
    quantity: number,
    price: number,
    orderSide: OrderSide,
    orderType: 'MARKET' | 'LIMIT',
    isSpot: boolean = false
  ): TradingFees {
    const notionalValue = quantity * price;
    
    // 选择费率
    const feeRates = isSpot ? this.defaultFeeRates.spot : this.defaultFeeRates.futures;
    const feeRate = orderType === 'LIMIT' ? feeRates.maker : feeRates.taker;
    
    const commission = notionalValue * feeRate;
    
    return {
      makerFee: feeRates.maker,
      takerFee: feeRates.taker,
      commission,
      commissionAsset: this.getCommissionAsset(symbol),
    };
  }

  /**
   * 计算资金费率
   */
  async calculateFundingFee(
    position: Position,
    fundingRate?: number,
    hoursHeld?: number
  ): Promise<FundingFeeCalculation> {
    // 获取当前资金费率（简化实现，实际应该从API获取）
    const currentFundingRate = fundingRate || this.defaultFeeRates.fundingRate;
    
    // 计算持仓时间（小时）
    const currentTime = Date.now();
    const positionHours = hoursHeld || (currentTime - position.openTime) / (1000 * 60 * 60);
    
    // 资金费率每8小时收取一次
    const fundingPeriods = Math.floor(positionHours / 8);
    
    // 计算资金费用
    const positionValue = position.size * position.markPrice;
    const fundingFee = positionValue * currentFundingRate * fundingPeriods;
    
    // 下次资金费率时间（每8小时的整点）
    const nextFundingTime = this.getNextFundingTime();

    return {
      fundingRate: currentFundingRate,
      fundingFee,
      nextFundingTime,
    };
  }

  /**
   * 批量计算多个持仓的PNL
   */
  async calculatePortfolioPNL(
    positions: Position[],
    prices?: { [symbol: string]: number }
  ): Promise<{
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    totalPnl: number;
    totalCommission: number;
    totalFundingFee: number;
    totalNetPnl: number;
    positionPnls: { [positionId: string]: PNLResult };
  }> {
    const positionPnls: { [positionId: string]: PNLResult } = {};
    let totalUnrealizedPnl = 0;
    let totalRealizedPnl = 0;
    let totalCommission = 0;
    let totalFundingFee = 0;

    for (const position of positions) {
      try {
        const currentPrice = prices?.[position.symbol] || await this.getCurrentPrice(position.symbol);
        if (currentPrice) {
          const pnlResult = await this.calculatePositionPNL(position, currentPrice);
          positionPnls[position.id] = pnlResult;
          
          totalUnrealizedPnl += pnlResult.unrealizedPnl;
          totalRealizedPnl += pnlResult.realizedPnl;
          totalCommission += pnlResult.commission;
          totalFundingFee += pnlResult.fundingFee;
        }
      } catch (error) {
        this.logger.error(`Failed to calculate PNL for position ${position.id}:`, error);
        // 继续处理其他持仓
      }
    }

    const totalPnl = totalUnrealizedPnl + totalRealizedPnl;
    const totalNetPnl = totalPnl - totalCommission - totalFundingFee;

    return {
      totalUnrealizedPnl,
      totalRealizedPnl,
      totalPnl,
      totalCommission,
      totalFundingFee,
      totalNetPnl,
      positionPnls,
    };
  }

  /**
   * 计算账户级别的PNL统计
   */
  async calculateAccountPNLStats(
    accountId: string,
    positions: Position[],
    trades: TradeOrder[]
  ): Promise<{
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    totalCommission: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
  }> {
    const completedTrades = trades.filter(t => t.status === 'FILLED');
    const closedPositions = positions.filter(p => p.isClosed && p.realizedPnl !== undefined);

    let totalPnl = 0;
    let totalCommission = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    // 统计已关闭持仓的盈亏
    for (const position of closedPositions) {
      const pnl = position.realizedPnl || 0;
      const commission = position.totalCommission || 0;
      const fundingFee = position.totalFundingFee || 0;
      
      const netPnl = pnl - commission - fundingFee;
      totalPnl += netPnl;
      totalCommission += commission + fundingFee;

      if (netPnl > 0) {
        winningTrades++;
        totalWinAmount += netPnl;
      } else if (netPnl < 0) {
        losingTrades++;
        totalLossAmount += Math.abs(netPnl);
      }
    }

    const totalTrades = winningTrades + losingTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const averageWin = winningTrades > 0 ? totalWinAmount / winningTrades : 0;
    const averageLoss = losingTrades > 0 ? totalLossAmount / losingTrades : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0;

    // 简化的最大回撤计算
    const maxDrawdown = this.calculateMaxDrawdown(closedPositions);

    // 简化的夏普比率计算
    const sharpeRatio = this.calculateSharpeRatio(closedPositions);

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      totalCommission,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
    };
  }

  /**
   * 实时更新持仓PNL
   */
  async updatePositionPNL(
    positionId: string,
    currentPrice: number
  ): Promise<{ unrealizedPnl: number; roe: number }> {
    // 这个方法会被定时任务调用，用于更新持仓的实时PNL
    // 实际实现中，这里会更新数据库中的持仓记录
    
    // 返回计算结果供调用者使用
    return {
      unrealizedPnl: 0, // 实际计算值
      roe: 0, // 实际计算值
    };
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const tickerPrice = await this.marketDataService.getTickerPrice(symbol);
      if (Array.isArray(tickerPrice)) {
        const symbolTicker = tickerPrice.find(t => t.symbol === symbol);
        return symbolTicker ? parseFloat(symbolTicker.price) : null;
      } else if (tickerPrice && typeof tickerPrice === 'object' && 'price' in tickerPrice) {
        return parseFloat(tickerPrice.price);
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * 获取手续费资产
   */
  private getCommissionAsset(symbol: string): string {
    // 简化处理，统一使用USDT作为手续费资产
    return 'USDT';
  }

  /**
   * 获取下次资金费率时间
   */
  private getNextFundingTime(): number {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    // 资金费率时间：00:00, 08:00, 16:00 UTC
    const fundingHours = [0, 8, 16];
    let nextHour = fundingHours.find(hour => hour > currentHour);
    
    if (!nextHour) {
      nextHour = fundingHours[0]; // 下一天的00:00
      now.setUTCDate(now.getUTCDate() + 1);
    }
    
    now.setUTCHours(nextHour, 0, 0, 0);
    return now.getTime();
  }

  /**
   * 计算最大回撤
   */
  private calculateMaxDrawdown(positions: Position[]): number {
    if (positions.length === 0) return 0;

    let maxEquity = 0;
    let currentEquity = 0;
    let maxDrawdown = 0;

    // 按时间排序
    const sortedPositions = positions
      .filter(p => p.realizedPnl !== undefined)
      .sort((a, b) => (a.closeTime || 0) - (b.closeTime || 0));

    for (const position of sortedPositions) {
      currentEquity += position.realizedPnl || 0;
      
      if (currentEquity > maxEquity) {
        maxEquity = currentEquity;
      }
      
      const drawdown = maxEquity > 0 ? (maxEquity - currentEquity) / maxEquity : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown * 100; // 返回百分比
  }

  /**
   * 计算夏普比率
   */
  private calculateSharpeRatio(positions: Position[]): number {
    if (positions.length < 2) return 0;

    const returns = positions
      .filter(p => p.realizedPnl !== undefined)
      .map(p => p.realizedPnl || 0);

    if (returns.length === 0) return 0;

    // 计算平均收益率
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;

    // 计算收益率标准差
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // 夏普比率 = (平均收益率 - 无风险利率) / 收益率标准差
    // 这里假设无风险利率为0
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }
}