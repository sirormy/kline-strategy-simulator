import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { AccountRepository } from '../repositories/account.repository';
import { PositionRepository } from '../repositories/position.repository';
import { TradeOrderRepository } from '../repositories/trade-order.repository';
import { PNLCalculatorService } from './pnl-calculator.service';
import { MarketDataService } from './market-data.service';
import { Account, AccountDocument, Balance, AccountConfig } from '../schemas/account.schema';
import { Position } from '../schemas/position.schema';
import { TradeOrder, OrderStatus } from '../schemas/trade-order.schema';
import { v4 as uuidv4 } from 'uuid';

export interface CreateAccountRequest {
  name: string;
  initialBalance: number;
  initialAsset?: string;
  config?: Partial<AccountConfig>;
}

export interface AccountInfo {
  accountId: string;
  name: string;
  balances: Balance[];
  totalEquity: number;
  availableMargin: number;
  usedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  isActive: boolean;
  config?: AccountConfig;
  stats?: any;
}

export interface RiskAssessment {
  marginRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  maxPositionSize: number;
  recommendedPositionSize: number;
  warnings: string[];
  liquidationRisk: boolean;
}

export interface AccountPerformance {
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
  calmarRatio: number;
  currentDrawdown: number;
}

export interface BalanceUpdate {
  asset: string;
  freeChange: number;
  lockedChange?: number;
  reason: string;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  // 默认账户配置
  private readonly defaultConfig: AccountConfig = {
    defaultLeverage: 1,
    maxPositions: 10,
    riskPerTrade: 0.02, // 2% per trade
    autoStopLoss: false,
    autoTakeProfit: false,
  };

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly positionRepository: PositionRepository,
    private readonly tradeOrderRepository: TradeOrderRepository,
    private readonly pnlCalculatorService: PNLCalculatorService,
    private readonly marketDataService: MarketDataService,
  ) { }

  /**
   * 创建新账户
   */
  async createAccount(request: CreateAccountRequest): Promise<AccountDocument> {
    const accountId = uuidv4();
    const initialAsset = request.initialAsset || 'USDT';

    // 验证初始余额
    if (request.initialBalance <= 0) {
      throw new BadRequestException('Initial balance must be positive');
    }

    // 创建初始余额
    const initialBalance: Balance = {
      asset: initialAsset,
      free: request.initialBalance,
      locked: 0,
    };

    // 合并配置
    const config: AccountConfig = {
      ...this.defaultConfig,
      ...request.config,
    };

    const accountData: Partial<Account> = {
      accountId,
      name: request.name,
      balances: [initialBalance],
      totalEquity: request.initialBalance,
      availableMargin: request.initialBalance,
      usedMargin: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      isActive: true,
      config,
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        totalCommission: 0,
        totalFundingFee: 0,
        maxDrawdown: 0,
        maxEquity: request.initialBalance,
        createdAt: Date.now(),
      },
    };

    const account = await this.accountRepository.create(accountData);

    this.logger.log(`Created new account: ${accountId} with initial balance: ${request.initialBalance} ${initialAsset}`);

    return account;
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo(accountId: string): Promise<AccountInfo> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // 更新实时权益信息
    await this.updateAccountEquity(accountId);

    // 重新获取更新后的账户信息
    const updatedAccount = await this.accountRepository.findByAccountId(accountId);
    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after update`);
    }

    return {
      accountId: updatedAccount.accountId,
      name: updatedAccount.name,
      balances: updatedAccount.balances,
      totalEquity: updatedAccount.totalEquity,
      availableMargin: updatedAccount.availableMargin,
      usedMargin: updatedAccount.usedMargin,
      unrealizedPnl: updatedAccount.unrealizedPnl,
      realizedPnl: updatedAccount.realizedPnl,
      isActive: updatedAccount.isActive,
      config: updatedAccount.config,
      stats: updatedAccount.stats,
    };
  }

  /**
   * 初始化默认账户
   */
  async initializeDefaultAccount(): Promise<AccountDocument> {
    const existingAccounts = await this.accountRepository.findActiveAccounts();

    if (existingAccounts.length > 0) {
      this.logger.log('Default account already exists');
      return existingAccounts[0];
    }

    const defaultAccount = await this.createAccount({
      name: 'Default Trading Account',
      initialBalance: 10000, // 默认10000 USDT
      initialAsset: 'USDT',
      config: {
        ...this.defaultConfig,
        maxPositions: 20,
        riskPerTrade: 0.05, // 5% per trade for simulation
      },
    });

    this.logger.log(`Initialized default account: ${defaultAccount.accountId}`);
    return defaultAccount;
  }

  /**
   * 更新账户余额
   */
  async updateBalance(
    accountId: string,
    updates: BalanceUpdate[]
  ): Promise<AccountDocument> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    if (!account.isActive) {
      throw new BadRequestException('Account is not active');
    }

    // 批量更新余额
    const balanceUpdates = updates.map(update => ({
      accountId,
      asset: update.asset,
      freeChange: update.freeChange,
      lockedChange: update.lockedChange || 0,
    }));

    await this.accountRepository.bulkUpdateBalances(balanceUpdates);

    // 记录余额变更日志
    for (const update of updates) {
      this.logger.debug(
        `Balance updated for account ${accountId}: ${update.asset} free: ${update.freeChange}, locked: ${update.lockedChange || 0}, reason: ${update.reason}`
      );
    }

    // 更新账户权益
    await this.updateAccountEquity(accountId);

    const updatedAccount = await this.accountRepository.findByAccountId(accountId);
    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after update`);
    }

    return updatedAccount;
  }

  /**
   * 更新账户权益信息
   */
  async updateAccountEquity(accountId: string): Promise<void> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // 获取所有活跃持仓
    const activePositions = await this.positionRepository.findActivePositions(accountId);

    // 获取当前价格
    const symbols = [...new Set(activePositions.map(p => p.symbol))];
    const prices: { [symbol: string]: number } = {};

    for (const symbol of symbols) {
      try {
        const tickerPrice = await this.marketDataService.getTickerPrice(symbol);
        if (Array.isArray(tickerPrice)) {
          const symbolTicker = tickerPrice.find(t => t.symbol === symbol);
          if (symbolTicker) {
            prices[symbol] = parseFloat(symbolTicker.price);
          }
        } else if (tickerPrice && typeof tickerPrice === 'object' && 'price' in tickerPrice) {
          prices[symbol] = parseFloat(tickerPrice.price);
        }
      } catch (error) {
        this.logger.warn(`Failed to get price for ${symbol}:`, error);
      }
    }

    // 计算总的未实现盈亏和已用保证金
    let totalUnrealizedPnl = 0;
    let totalUsedMargin = 0;

    for (const position of activePositions) {
      const currentPrice = prices[position.symbol];
      if (currentPrice) {
        const unrealizedPnl = this.pnlCalculatorService.calculateUnrealizedPnl(position, currentPrice);
        totalUnrealizedPnl += unrealizedPnl;

        // 更新持仓的标记价格和未实现盈亏
        await this.positionRepository.updateMarkPriceAndPnl(
          position.id,
          currentPrice,
          unrealizedPnl
        );
      }
      totalUsedMargin += position.margin;
    }

    // 计算总权益
    const baseEquity = this.calculateBaseEquity(account.balances, prices);
    const totalEquity = baseEquity + totalUnrealizedPnl;
    const availableMargin = totalEquity - totalUsedMargin;

    // 更新账户信息
    await this.accountRepository.updateAccountEquity(
      accountId,
      totalEquity,
      availableMargin,
      totalUsedMargin,
      totalUnrealizedPnl
    );
  }

  /**
   * 风险评估
   */
  async assessRisk(accountId: string): Promise<RiskAssessment> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const activePositions = await this.positionRepository.findActivePositions(accountId);

    // 计算保证金率
    const marginRatio = account.totalEquity > 0 ?
      (account.usedMargin / account.totalEquity) * 100 : 0;

    // 确定风险等级
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (marginRatio < 30) {
      riskLevel = 'LOW';
    } else if (marginRatio < 60) {
      riskLevel = 'MEDIUM';
    } else if (marginRatio < 80) {
      riskLevel = 'HIGH';
    } else {
      riskLevel = 'CRITICAL';
    }

    // 计算最大和推荐持仓大小
    const maxPositionSize = account.availableMargin * 0.8; // 最大使用80%可用保证金
    const riskPerTrade = account.config?.riskPerTrade || 0.02;
    const recommendedPositionSize = account.totalEquity * riskPerTrade;

    // 生成警告
    const warnings: string[] = [];

    if (marginRatio > 70) {
      warnings.push('High margin usage - consider reducing position sizes');
    }

    if (activePositions.length > (account.config?.maxPositions || 10)) {
      warnings.push('Too many open positions - consider consolidating');
    }

    if (account.availableMargin < account.totalEquity * 0.1) {
      warnings.push('Low available margin - limited ability to open new positions');
    }

    // 检查强平风险
    const liquidationRisk = await this.checkLiquidationRisk(activePositions);

    return {
      marginRatio,
      riskLevel,
      maxPositionSize,
      recommendedPositionSize,
      warnings,
      liquidationRisk,
    };
  }

  /**
   * 获取账户性能统计
   */
  async getAccountPerformance(accountId: string): Promise<AccountPerformance> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // 获取交易历史
    const trades = await this.tradeOrderRepository.findByAccountId(accountId, OrderStatus.FILLED);
    const closedPositions = await this.positionRepository.findByAccountId(accountId, true);

    // 使用PNL计算器计算详细统计
    const stats = await this.pnlCalculatorService.calculateAccountPNLStats(
      accountId,
      closedPositions,
      trades
    );

    // 计算额外的性能指标
    const calmarRatio = stats.maxDrawdown > 0 ?
      (stats.totalPnl / stats.maxDrawdown) : 0;

    // 计算当前回撤
    const currentEquity = account.totalEquity;
    const maxEquity = account.stats?.maxEquity || currentEquity;
    const currentDrawdown = maxEquity > 0 ?
      ((maxEquity - currentEquity) / maxEquity) * 100 : 0;

    return {
      totalTrades: stats.totalTrades,
      winningTrades: stats.winningTrades,
      losingTrades: stats.losingTrades,
      winRate: stats.winRate,
      totalPnl: stats.totalPnl,
      totalCommission: stats.totalCommission,
      averageWin: stats.averageWin,
      averageLoss: stats.averageLoss,
      profitFactor: stats.profitFactor,
      maxDrawdown: stats.maxDrawdown,
      sharpeRatio: stats.sharpeRatio,
      calmarRatio,
      currentDrawdown,
    };
  }

  /**
   * 激活/停用账户
   */
  async toggleAccountStatus(accountId: string, isActive: boolean): Promise<AccountDocument> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // 如果要停用账户，检查是否有活跃持仓
    if (!isActive) {
      const activePositions = await this.positionRepository.findActivePositions(accountId);
      if (activePositions.length > 0) {
        throw new BadRequestException('Cannot deactivate account with active positions');
      }

      const pendingOrders = await this.tradeOrderRepository.findPendingOrders(accountId);
      if (pendingOrders.length > 0) {
        throw new BadRequestException('Cannot deactivate account with pending orders');
      }
    }

    const updatedAccount = await this.accountRepository.toggleAccountStatus(accountId, isActive);
    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after update`);
    }

    this.logger.log(`Account ${accountId} ${isActive ? 'activated' : 'deactivated'}`);

    return updatedAccount;
  }

  /**
   * 更新账户配置
   */
  async updateAccountConfig(
    accountId: string,
    config: Partial<AccountConfig>
  ): Promise<AccountDocument> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const updatedConfig = {
      ...account.config,
      ...config,
    };

    // 验证配置
    this.validateAccountConfig(updatedConfig);

    const updatedAccount = await this.accountRepository.updateOne(
      { accountId },
      { config: updatedConfig }
    );

    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after update`);
    }

    this.logger.log(`Updated configuration for account ${accountId}`);

    return updatedAccount;
  }

  /**
   * 获取账户余额
   */
  async getAccountBalance(accountId: string, asset?: string): Promise<Balance[]> {
    if (asset) {
      const balance = await this.accountRepository.getAccountBalance(accountId, asset);
      return balance ? [balance] : [];
    }

    return this.accountRepository.getAccountBalances(accountId);
  }

  /**
   * 重置账户（用于模拟测试）
   */
  async resetAccount(
    accountId: string,
    initialBalance: number = 10000,
    initialAsset: string = 'USDT'
  ): Promise<AccountDocument> {
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // 检查是否有活跃持仓或待处理订单
    const activePositions = await this.positionRepository.findActivePositions(accountId);
    const pendingOrders = await this.tradeOrderRepository.findPendingOrders(accountId);

    if (activePositions.length > 0 || pendingOrders.length > 0) {
      throw new BadRequestException('Cannot reset account with active positions or pending orders');
    }

    // 重置余额
    const resetBalance: Balance = {
      asset: initialAsset,
      free: initialBalance,
      locked: 0,
    };

    const resetData = {
      balances: [resetBalance],
      totalEquity: initialBalance,
      availableMargin: initialBalance,
      usedMargin: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        totalCommission: 0,
        totalFundingFee: 0,
        maxDrawdown: 0,
        maxEquity: initialBalance,
        createdAt: Date.now(),
      },
    };

    const updatedAccount = await this.accountRepository.updateOne(
      { accountId },
      resetData
    );

    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after reset`);
    }

    this.logger.log(`Reset account ${accountId} with balance: ${initialBalance} ${initialAsset}`);

    return updatedAccount;
  }

  /**
   * 计算基础权益（不包括未实现盈亏）
   */
  private calculateBaseEquity(balances: Balance[], prices: { [symbol: string]: number }): number {
    let totalEquity = 0;

    for (const balance of balances) {
      const totalBalance = balance.free + balance.locked;

      if (balance.asset === 'USDT') {
        totalEquity += totalBalance;
      } else {
        const price = prices[`${balance.asset}USDT`] || 0;
        totalEquity += totalBalance * price;
      }
    }

    return totalEquity;
  }

  /**
   * 检查强平风险
   */
  private async checkLiquidationRisk(positions: Position[]): Promise<boolean> {
    for (const position of positions) {
      try {
        const currentPrice = await this.getCurrentPrice(position.symbol);
        if (!currentPrice) continue;

        const marginInfo = this.pnlCalculatorService.calculateMarginInfo(
          position,
          currentPrice,
          position.margin * 10 // 简化的权益计算
        );

        if (marginInfo.marginRatio > 90) {
          return true;
        }
      } catch (error) {
        this.logger.error(`Failed to check liquidation risk for position ${position.id}:`, error);
      }
    }

    return false;
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
   * 验证账户配置
   */
  private validateAccountConfig(config: AccountConfig): void {
    if (config.defaultLeverage < 1 || config.defaultLeverage > 125) {
      throw new BadRequestException('Default leverage must be between 1 and 125');
    }

    if (config.maxPositions < 1 || config.maxPositions > 100) {
      throw new BadRequestException('Max positions must be between 1 and 100');
    }

    if (config.riskPerTrade < 0.001 || config.riskPerTrade > 1) {
      throw new BadRequestException('Risk per trade must be between 0.1% and 100%');
    }
  }
}