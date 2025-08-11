import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter } from 'events';
import { PNLCalculatorService } from './pnl-calculator.service';
import { MarketDataService } from './market-data.service';
import { PositionRepository } from '../repositories/position.repository';
import { AccountRepository } from '../repositories/account.repository';
import { Position } from '../schemas/position.schema';

export interface PNLUpdate {
  positionId: string;
  accountId: string;
  symbol: string;
  unrealizedPnl: number;
  roe: number;
  markPrice: number;
  timestamp: number;
}

export interface AccountPNLSummary {
  accountId: string;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalEquity: number;
  availableMargin: number;
  usedMargin: number;
  marginRatio: number;
  timestamp: number;
}

@Injectable()
export class PNLMonitorService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PNLMonitorService.name);
  private isRunning = false;
  private priceCache = new Map<string, { price: number; timestamp: number }>();
  private readonly PRICE_CACHE_TTL = 5000; // 5秒缓存

  constructor(
    private readonly pnlCalculatorService: PNLCalculatorService,
    private readonly marketDataService: MarketDataService,
    private readonly positionRepository: PositionRepository,
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async onModuleInit() {
    this.logger.log('PNL Monitor Service initializing...');
    
    // 设置市场数据事件监听
    this.setupMarketDataListeners();
    
    this.isRunning = true;
    this.logger.log('PNL Monitor Service initialized');
  }

  onModuleDestroy() {
    this.isRunning = false;
    this.cleanup();
  }

  /**
   * 定时更新所有持仓的PNL（每分钟执行）
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async updateAllPositionsPNL(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.logger.debug('Starting scheduled PNL update for all positions');
      
      // 获取所有活跃持仓
      const activePositions = await this.positionRepository.findActivePositions();
      
      if (activePositions.length === 0) {
        this.logger.debug('No active positions to update');
        return;
      }

      // 按交易对分组
      const positionsBySymbol = this.groupPositionsBySymbol(activePositions);
      
      // 批量获取价格
      const symbols = Object.keys(positionsBySymbol);
      const prices = await this.batchGetPrices(symbols);

      // 更新每个持仓的PNL
      const updates: PNLUpdate[] = [];
      const accountUpdates = new Map<string, Position[]>();

      for (const [symbol, positions] of Object.entries(positionsBySymbol)) {
        const currentPrice = prices[symbol];
        if (!currentPrice) {
          this.logger.warn(`No price available for ${symbol}, skipping PNL update`);
          continue;
        }

        for (const position of positions) {
          try {
            const unrealizedPnl = this.pnlCalculatorService.calculateUnrealizedPnl(position, currentPrice);
            const roe = position.margin > 0 ? (unrealizedPnl / position.margin) * 100 : 0;

            // 更新数据库中的持仓记录
            await this.positionRepository.updateMarkPriceAndPnl(
              position.id,
              currentPrice,
              unrealizedPnl
            );

            // 记录更新信息
            const update: PNLUpdate = {
              positionId: position.id,
              accountId: position.accountId,
              symbol: position.symbol,
              unrealizedPnl,
              roe,
              markPrice: currentPrice,
              timestamp: Date.now(),
            };
            updates.push(update);

            // 按账户分组以便后续更新账户信息
            if (!accountUpdates.has(position.accountId)) {
              accountUpdates.set(position.accountId, []);
            }
            accountUpdates.get(position.accountId)!.push({
              ...position,
              markPrice: currentPrice,
              unrealizedPnl,
            });

          } catch (error) {
            this.logger.error(`Failed to update PNL for position ${position.id}:`, error);
          }
        }
      }

      // 更新账户级别的PNL信息
      await this.updateAccountsPNL(accountUpdates);

      // 发出PNL更新事件
      this.emitPNLUpdates(updates);

      this.logger.debug(`Updated PNL for ${updates.length} positions across ${accountUpdates.size} accounts`);

    } catch (error) {
      this.logger.error('Failed to update positions PNL:', error);
    }
  }

  /**
   * 实时更新特定持仓的PNL
   */
  async updatePositionPNL(positionId: string, currentPrice?: number): Promise<PNLUpdate | null> {
    try {
      const position = await this.positionRepository.findById(positionId);
      if (!position || position.isClosed) {
        return null;
      }

      const markPrice = currentPrice || await this.getCurrentPrice(position.symbol);
      if (!markPrice) {
        throw new Error(`Unable to get current price for ${position.symbol}`);
      }

      const unrealizedPnl = this.pnlCalculatorService.calculateUnrealizedPnl(position, markPrice);
      const roe = position.margin > 0 ? (unrealizedPnl / position.margin) * 100 : 0;

      // 更新数据库
      await this.positionRepository.updateMarkPriceAndPnl(positionId, markPrice, unrealizedPnl);

      const update: PNLUpdate = {
        positionId,
        accountId: position.accountId,
        symbol: position.symbol,
        unrealizedPnl,
        roe,
        markPrice,
        timestamp: Date.now(),
      };

      // 发出单个持仓更新事件
      this.emit('positionPNLUpdate', update);

      return update;

    } catch (error) {
      this.logger.error(`Failed to update PNL for position ${positionId}:`, error);
      return null;
    }
  }

  /**
   * 获取账户PNL摘要
   */
  async getAccountPNLSummary(accountId: string): Promise<AccountPNLSummary | null> {
    try {
      const account = await this.accountRepository.findByAccountId(accountId);
      if (!account) {
        return null;
      }

      const activePositions = await this.positionRepository.findActivePositions(accountId);
      
      // 计算总的未实现盈亏
      let totalUnrealizedPnl = 0;
      let totalUsedMargin = 0;

      for (const position of activePositions) {
        totalUnrealizedPnl += position.unrealizedPnl || 0;
        totalUsedMargin += position.margin;
      }

      // 计算总权益和可用保证金
      const totalEquity = account.totalEquity + totalUnrealizedPnl;
      const availableMargin = totalEquity - totalUsedMargin;
      const marginRatio = totalEquity > 0 ? (totalUsedMargin / totalEquity) * 100 : 0;

      return {
        accountId,
        totalUnrealizedPnl,
        totalRealizedPnl: account.realizedPnl,
        totalEquity,
        availableMargin,
        usedMargin: totalUsedMargin,
        marginRatio,
        timestamp: Date.now(),
      };

    } catch (error) {
      this.logger.error(`Failed to get account PNL summary for ${accountId}:`, error);
      return null;
    }
  }

  /**
   * 监控保证金风险
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async monitorMarginRisk(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const activePositions = await this.positionRepository.findActivePositions();
      const riskPositions: Array<{
        position: Position;
        marginRatio: number;
        liquidationPrice: number;
      }> = [];

      // 按账户分组检查保证金风险
      const positionsByAccount = this.groupPositionsByAccount(activePositions);

      for (const [accountId, positions] of Object.entries(positionsByAccount)) {
        const account = await this.accountRepository.findByAccountId(accountId);
        if (!account) continue;

        for (const position of positions) {
          try {
            const currentPrice = await this.getCurrentPrice(position.symbol);
            if (!currentPrice) continue;

            const marginInfo = this.pnlCalculatorService.calculateMarginInfo(
              position,
              currentPrice,
              account.totalEquity
            );

            // 检查是否接近强平
            if (marginInfo.marginRatio > 80) { // 保证金率超过80%
              riskPositions.push({
                position,
                marginRatio: marginInfo.marginRatio,
                liquidationPrice: marginInfo.liquidationPrice,
              });
            }

          } catch (error) {
            this.logger.error(`Failed to check margin risk for position ${position.id}:`, error);
          }
        }
      }

      // 发出风险警告事件
      if (riskPositions.length > 0) {
        this.emit('marginRiskAlert', riskPositions);
        this.logger.warn(`Found ${riskPositions.length} positions at risk of liquidation`);
      }

    } catch (error) {
      this.logger.error('Failed to monitor margin risk:', error);
    }
  }

  /**
   * 设置市场数据监听器
   */
  private setupMarketDataListeners(): void {
    // 监听实时K线数据更新
    this.marketDataService.on('klineData', async (klineData) => {
      try {
        // 更新价格缓存
        this.updatePriceCache(klineData.symbol, klineData.close);

        // 获取该交易对的活跃持仓
        const positions = await this.positionRepository.findBySymbol(klineData.symbol, undefined, false);
        
        if (positions.length > 0) {
          // 批量更新这些持仓的PNL
          const updates: PNLUpdate[] = [];
          
          for (const position of positions) {
            const unrealizedPnl = this.pnlCalculatorService.calculateUnrealizedPnl(position, klineData.close);
            const roe = position.margin > 0 ? (unrealizedPnl / position.margin) * 100 : 0;

            updates.push({
              positionId: position.id,
              accountId: position.accountId,
              symbol: position.symbol,
              unrealizedPnl,
              roe,
              markPrice: klineData.close,
              timestamp: Date.now(),
            });
          }

          // 批量更新数据库
          await this.positionRepository.bulkUpdateMarkPrices(
            updates.map(u => ({
              positionId: u.positionId,
              markPrice: u.markPrice,
              unrealizedPnl: u.unrealizedPnl,
            }))
          );

          // 发出实时更新事件
          this.emit('realTimePNLUpdate', { symbol: klineData.symbol, updates });
        }

      } catch (error) {
        this.logger.error(`Failed to process real-time PNL update for ${klineData.symbol}:`, error);
      }
    });
  }

  /**
   * 批量获取价格
   */
  private async batchGetPrices(symbols: string[]): Promise<{ [symbol: string]: number }> {
    const prices: { [symbol: string]: number } = {};
    
    try {
      // 首先检查缓存
      const uncachedSymbols: string[] = [];
      const now = Date.now();

      for (const symbol of symbols) {
        const cached = this.priceCache.get(symbol);
        if (cached && (now - cached.timestamp) < this.PRICE_CACHE_TTL) {
          prices[symbol] = cached.price;
        } else {
          uncachedSymbols.push(symbol);
        }
      }

      // 获取未缓存的价格
      if (uncachedSymbols.length > 0) {
        const tickerPrices = await this.marketDataService.getTickerPrice();
        
        if (Array.isArray(tickerPrices)) {
          for (const ticker of tickerPrices) {
            if (uncachedSymbols.includes(ticker.symbol)) {
              const price = parseFloat(ticker.price);
              prices[ticker.symbol] = price;
              this.updatePriceCache(ticker.symbol, price);
            }
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to batch get prices:', error);
    }

    return prices;
  }

  /**
   * 更新价格缓存
   */
  private updatePriceCache(symbol: string, price: number): void {
    this.priceCache.set(symbol, {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    // 首先检查缓存
    const cached = this.priceCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    try {
      const tickerPrice = await this.marketDataService.getTickerPrice(symbol);
      if (Array.isArray(tickerPrice)) {
        const symbolTicker = tickerPrice.find(t => t.symbol === symbol);
        if (symbolTicker) {
          const price = parseFloat(symbolTicker.price);
          this.updatePriceCache(symbol, price);
          return price;
        }
      } else if (tickerPrice && typeof tickerPrice === 'object' && 'price' in tickerPrice) {
        const price = parseFloat(tickerPrice.price);
        this.updatePriceCache(symbol, price);
        return price;
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * 按交易对分组持仓
   */
  private groupPositionsBySymbol(positions: Position[]): { [symbol: string]: Position[] } {
    return positions.reduce((groups, position) => {
      if (!groups[position.symbol]) {
        groups[position.symbol] = [];
      }
      groups[position.symbol].push(position);
      return groups;
    }, {} as { [symbol: string]: Position[] });
  }

  /**
   * 按账户分组持仓
   */
  private groupPositionsByAccount(positions: Position[]): { [accountId: string]: Position[] } {
    return positions.reduce((groups, position) => {
      if (!groups[position.accountId]) {
        groups[position.accountId] = [];
      }
      groups[position.accountId].push(position);
      return groups;
    }, {} as { [accountId: string]: Position[] });
  }

  /**
   * 更新账户级别的PNL信息
   */
  private async updateAccountsPNL(accountUpdates: Map<string, Position[]>): Promise<void> {
    for (const [accountId, positions] of accountUpdates.entries()) {
      try {
        const account = await this.accountRepository.findByAccountId(accountId);
        if (!account) continue;

        // 计算总的未实现盈亏和已用保证金
        let totalUnrealizedPnl = 0;
        let totalUsedMargin = 0;

        for (const position of positions) {
          totalUnrealizedPnl += position.unrealizedPnl || 0;
          totalUsedMargin += position.margin;
        }

        // 计算总权益和可用保证金
        const totalEquity = account.totalEquity + totalUnrealizedPnl;
        const availableMargin = totalEquity - totalUsedMargin;

        // 更新账户信息
        await this.accountRepository.updateAccountEquity(
          accountId,
          totalEquity,
          availableMargin,
          totalUsedMargin,
          totalUnrealizedPnl
        );

        // 发出账户PNL更新事件
        const accountSummary: AccountPNLSummary = {
          accountId,
          totalUnrealizedPnl,
          totalRealizedPnl: account.realizedPnl,
          totalEquity,
          availableMargin,
          usedMargin: totalUsedMargin,
          marginRatio: totalEquity > 0 ? (totalUsedMargin / totalEquity) * 100 : 0,
          timestamp: Date.now(),
        };

        this.emit('accountPNLUpdate', accountSummary);

      } catch (error) {
        this.logger.error(`Failed to update account PNL for ${accountId}:`, error);
      }
    }
  }

  /**
   * 发出PNL更新事件
   */
  private emitPNLUpdates(updates: PNLUpdate[]): void {
    if (updates.length === 0) return;

    // 发出批量更新事件
    this.emit('batchPNLUpdate', updates);

    // 按账户分组发出事件
    const updatesByAccount = updates.reduce((groups, update) => {
      if (!groups[update.accountId]) {
        groups[update.accountId] = [];
      }
      groups[update.accountId].push(update);
      return groups;
    }, {} as { [accountId: string]: PNLUpdate[] });

    for (const [accountId, accountUpdates] of Object.entries(updatesByAccount)) {
      this.emit(`accountPNLUpdates:${accountId}`, accountUpdates);
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.priceCache.clear();
    this.removeAllListeners();
  }
}