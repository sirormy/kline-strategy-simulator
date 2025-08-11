import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { StrategyRegistry } from '../extensions/strategy-registry';
import { BaseStrategy } from '../extensions/base-strategy';
import { ParameterValidator, ValidationResult } from '../extensions/parameter-validator';
import { StrategyRepository } from '../repositories/strategy.repository';
import { KlineDataRepository } from '../repositories/kline-data.repository';
import { CreateStrategyDto, UpdateStrategyDto, QueryStrategyDto, BacktestStrategyDto } from '../dto/strategy.dto';
import { Strategy, StrategyDocument, StrategyMetadata } from '../schemas/strategy.schema';
import { KlineData } from '../schemas/kline-data.schema';

// 回测参数接口
export interface BacktestParams {
  startTime: number;
  endTime: number;
  initialBalance: number;
  commission: number;
  slippage: number;
}

// 回测结果接口
export interface BacktestResult {
  strategyId: string;
  startTime: number;
  endTime: number;
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  trades: BacktestTrade[];
  equity: EquityPoint[];
  metrics: { [key: string]: number };
}

// 回测交易记录
export interface BacktestTrade {
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission: number;
  pnl: number;
  balance: number;
  reason: string;
}

// 权益曲线点
export interface EquityPoint {
  timestamp: number;
  balance: number;
  drawdown: number;
}

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly strategyRepository: StrategyRepository,
    private readonly klineDataRepository: KlineDataRepository,
  ) {}

  /**
   * 创建策略
   */
  async createStrategy(createStrategyDto: CreateStrategyDto): Promise<StrategyDocument> {
    // 验证策略类型是否支持
    if (!this.strategyRegistry.isStrategySupported(createStrategyDto.type)) {
      throw new BadRequestException(
        `Strategy type '${createStrategyDto.type}' is not supported. Available types: ${this.strategyRegistry.getAvailableTypes().join(', ')}`
      );
    }

    // 获取策略元数据
    const metadata = this.strategyRegistry.getStrategyMetadata(createStrategyDto.type);
    if (!metadata) {
      throw new BadRequestException(`Failed to get metadata for strategy type '${createStrategyDto.type}'`);
    }

    // 验证参数
    const validation = ParameterValidator.validate(createStrategyDto.parameters, metadata.parameterSchema);
    if (!validation.isValid) {
      throw new BadRequestException(`Parameter validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // 应用默认值和清理参数
    const processedParameters = ParameterValidator.applyDefaults(createStrategyDto.parameters, metadata.parameterSchema);

    // 创建策略配置
    const strategyData = {
      ...createStrategyDto,
      parameters: processedParameters,
      metadata,
    };

    // 保存到数据库
    const strategy = await this.strategyRepository.create(strategyData);
    
    this.logger.log(`Strategy created: ${strategy.name} (${strategy.type})`);
    return strategy;
  }

  /**
   * 更新策略
   */
  async updateStrategy(id: string, updateStrategyDto: UpdateStrategyDto): Promise<StrategyDocument> {
    const strategy = await this.strategyRepository.findById(id);
    if (!strategy) {
      throw new NotFoundException(`Strategy with id ${id} not found`);
    }

    // 如果更新了参数，需要重新验证
    if (updateStrategyDto.parameters) {
      const metadata = this.strategyRegistry.getStrategyMetadata(strategy.type);
      if (metadata) {
        const mergedParameters = { ...strategy.parameters, ...updateStrategyDto.parameters };
        const validation = ParameterValidator.validate(mergedParameters, metadata.parameterSchema);
        
        if (!validation.isValid) {
          throw new BadRequestException(`Parameter validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        updateStrategyDto.parameters = ParameterValidator.applyDefaults(mergedParameters, metadata.parameterSchema);
      }
    }

    const updatedStrategy = await this.strategyRepository.update(id, updateStrategyDto);
    this.logger.log(`Strategy updated: ${updatedStrategy.name}`);
    
    return updatedStrategy;
  }

  /**
   * 删除策略
   */
  async deleteStrategy(id: string): Promise<void> {
    const strategy = await this.strategyRepository.findById(id);
    if (!strategy) {
      throw new NotFoundException(`Strategy with id ${id} not found`);
    }

    await this.strategyRepository.delete(id);
    this.logger.log(`Strategy deleted: ${strategy.name}`);
  }

  /**
   * 获取策略列表
   */
  async getStrategies(query: QueryStrategyDto): Promise<{
    strategies: StrategyDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const result = await this.strategyRepository.findWithFiltersAndPagination(query);
    const strategies = result.data;
    const total = result.total;
    
    return {
      strategies,
      total,
      page: query.page || 1,
      limit: query.limit || 100,
    };
  }

  /**
   * 获取单个策略
   */
  async getStrategy(id: string): Promise<StrategyDocument> {
    const strategy = await this.strategyRepository.findById(id);
    if (!strategy) {
      throw new NotFoundException(`Strategy with id ${id} not found`);
    }
    return strategy;
  }

  /**
   * 获取可用策略类型
   */
  getAvailableStrategyTypes(): StrategyMetadata[] {
    return this.strategyRegistry.getAvailableStrategies();
  }

  /**
   * 获取策略元数据
   */
  getStrategyMetadata(type: string): StrategyMetadata | null {
    return this.strategyRegistry.getStrategyMetadata(type);
  }

  /**
   * 验证策略参数
   */
  validateStrategyParameters(type: string, parameters: any): ValidationResult {
    const metadata = this.strategyRegistry.getStrategyMetadata(type);
    if (!metadata) {
      return {
        isValid: false,
        errors: [new Error(`Strategy type '${type}' not found`) as any],
        warnings: [],
      };
    }

    return ParameterValidator.validate(parameters, metadata.parameterSchema);
  }

  /**
   * 执行策略回测
   */
  async runBacktest(backtestDto: BacktestStrategyDto): Promise<BacktestResult> {
    const strategy = await this.getStrategy(backtestDto.strategyId);
    
    // 创建策略实例
    const strategyInstance = this.strategyRegistry.createStrategy({
      id: strategy.id,
      accountId: strategy.accountId,
      name: strategy.name,
      type: strategy.type,
      version: strategy.version,
      parameters: strategy.parameters,
      symbols: strategy.symbols,
      timeframe: strategy.timeframe,
      enabled: strategy.enabled,
      metadata: strategy.metadata,
    });

    // 初始化策略
    await strategyInstance.initialize();

    try {
      // 获取历史数据
      const marketData = await this.getBacktestData(
        strategy.symbols[0], // 暂时只支持单个交易对
        strategy.timeframe,
        backtestDto.startTime,
        backtestDto.endTime
      );

      if (marketData.length === 0) {
        throw new BadRequestException('No market data available for the specified time range');
      }

      // 执行回测
      const result = await this.executeBacktest(
        strategyInstance,
        marketData,
        {
          startTime: backtestDto.startTime,
          endTime: backtestDto.endTime,
          initialBalance: backtestDto.initialBalance || 10000,
          commission: backtestDto.backtestConfig?.commission || 0.001,
          slippage: backtestDto.backtestConfig?.slippage || 0.0001,
        }
      );

      // 保存回测结果
      await this.saveBacktestResult(strategy.id, result);

      this.logger.log(`Backtest completed for strategy: ${strategy.name}`);
      return result;
    } finally {
      // 清理策略实例
      await strategyInstance.destroy();
    }
  }

  /**
   * 获取回测数据
   */
  private async getBacktestData(
    symbol: string,
    timeframe: string,
    startTime: number,
    endTime: number
  ): Promise<KlineData[]> {
    return await this.klineDataRepository.findBySymbolAndInterval(symbol, timeframe, startTime, endTime);
  }

  /**
   * 执行回测逻辑
   */
  private async executeBacktest(
    strategy: BaseStrategy,
    marketData: KlineData[],
    params: BacktestParams
  ): Promise<BacktestResult> {
    let balance = params.initialBalance;
    let position = 0; // 持仓数量
    let maxBalance = balance;
    let maxDrawdown = 0;
    
    const trades: BacktestTrade[] = [];
    const equity: EquityPoint[] = [];
    
    let winningTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let largestWin = 0;
    let largestLoss = 0;

    // 逐个K线执行策略
    for (let i = strategy.getMinDataLength(); i < marketData.length; i++) {
      const currentData = marketData.slice(0, i + 1);
      const currentKline = currentData[currentData.length - 1];
      
      try {
        // 生成交易信号
        const signals = await strategy.generateSignals(currentData, []); // 暂时不使用指标
        
        // 执行交易信号
        for (const signal of signals) {
          const trade = await this.executeBacktestTrade(
            signal,
            currentKline,
            balance,
            position,
            params.commission,
            params.slippage
          );

          if (trade) {
            trades.push(trade);
            balance = trade.balance;
            
            // 更新持仓
            if (signal.type === 'BUY') {
              position += signal.quantity;
            } else if (signal.type === 'SELL') {
              position -= signal.quantity;
            }

            // 统计盈亏
            if (trade.pnl > 0) {
              winningTrades++;
              totalWins += trade.pnl;
              largestWin = Math.max(largestWin, trade.pnl);
            } else if (trade.pnl < 0) {
              totalLosses += Math.abs(trade.pnl);
              largestLoss = Math.max(largestLoss, Math.abs(trade.pnl));
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Error executing strategy at ${currentKline.openTime}:`, error);
      }

      // 计算当前权益（包括持仓价值）
      const currentEquity = balance + (position * currentKline.close);
      maxBalance = Math.max(maxBalance, currentEquity);
      const drawdown = (maxBalance - currentEquity) / maxBalance;
      maxDrawdown = Math.max(maxDrawdown, drawdown);

      // 记录权益点
      equity.push({
        timestamp: currentKline.closeTime,
        balance: currentEquity,
        drawdown,
      });
    }

    // 计算最终结果
    const finalBalance = balance + (position * marketData[marketData.length - 1].close);
    const totalReturn = finalBalance - params.initialBalance;
    const totalReturnPercent = (totalReturn / params.initialBalance) * 100;
    
    const totalTrades = trades.length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    
    const averageWin = winningTrades > 0 ? totalWins / winningTrades : 0;
    const averageLoss = losingTrades > 0 ? totalLosses / losingTrades : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    // 计算夏普比率（简化版本）
    const returns = equity.map((point, index) => {
      if (index === 0) return 0;
      return (point.balance - equity[index - 1].balance) / equity[index - 1].balance;
    }).slice(1);
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const returnStd = Math.sqrt(
      returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(252) : 0;

    return {
      strategyId: strategy.getConfig().id,
      startTime: params.startTime,
      endTime: params.endTime,
      initialBalance: params.initialBalance,
      finalBalance,
      totalReturn,
      totalReturnPercent,
      maxDrawdown,
      maxDrawdownPercent: maxDrawdown * 100,
      sharpeRatio,
      winRate,
      totalTrades,
      winningTrades,
      losingTrades,
      profitFactor,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      trades,
      equity,
      metrics: {
        volatility: returnStd * Math.sqrt(252),
        calmarRatio: totalReturnPercent > 0 && maxDrawdown > 0 ? totalReturnPercent / (maxDrawdown * 100) : 0,
      },
    };
  }

  /**
   * 执行回测交易
   */
  private async executeBacktestTrade(
    signal: any,
    kline: KlineData,
    currentBalance: number,
    currentPosition: number,
    commission: number,
    slippage: number
  ): Promise<BacktestTrade | null> {
    const price = signal.price || kline.close;
    const adjustedPrice = signal.type === 'BUY' 
      ? price * (1 + slippage) 
      : price * (1 - slippage);
    
    const cost = signal.quantity * adjustedPrice;
    const commissionCost = cost * commission;
    const totalCost = cost + commissionCost;

    // 检查资金是否足够
    if (signal.type === 'BUY' && totalCost > currentBalance) {
      return null; // 资金不足
    }

    // 检查持仓是否足够
    if (signal.type === 'SELL' && signal.quantity > currentPosition) {
      return null; // 持仓不足
    }

    const pnl = signal.type === 'BUY' ? -totalCost : cost - commissionCost;
    const newBalance = currentBalance + pnl;

    return {
      timestamp: kline.closeTime,
      symbol: signal.symbol,
      side: signal.type,
      quantity: signal.quantity,
      price: adjustedPrice,
      commission: commissionCost,
      pnl,
      balance: newBalance,
      reason: signal.reason,
    };
  }

  /**
   * 保存回测结果
   */
  private async saveBacktestResult(strategyId: string, result: BacktestResult): Promise<void> {
    await this.strategyRepository.update(strategyId, {
      backtestResults: {
        startTime: result.startTime,
        endTime: result.endTime,
        totalReturn: result.totalReturn,
        maxDrawdown: result.maxDrawdown,
        sharpeRatio: result.sharpeRatio,
        winRate: result.winRate,
        totalTrades: result.totalTrades,
        profitFactor: result.profitFactor,
        ...result.metrics,
      },
    });
  }
}