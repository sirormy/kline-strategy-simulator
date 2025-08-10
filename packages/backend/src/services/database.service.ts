import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { 
  AccountRepository,
  KlineDataRepository,
  PositionRepository,
  StrategyRepository,
  TradeOrderRepository
} from '../repositories';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly klineDataRepository: KlineDataRepository,
    private readonly positionRepository: PositionRepository,
    private readonly strategyRepository: StrategyRepository,
    private readonly tradeOrderRepository: TradeOrderRepository,
  ) {}

  async onModuleInit() {
    await this.initializeDatabase();
  }

  /**
   * 初始化数据库索引和基础数据
   */
  async initializeDatabase(): Promise<void> {
    try {
      this.logger.log('Initializing database indexes...');
      
      // 创建所有必要的索引
      await Promise.all([
        this.accountRepository.createIndexes(),
        this.klineDataRepository.createIndexes(),
        this.positionRepository.createIndexes(),
        this.strategyRepository.createIndexes(),
        this.tradeOrderRepository.createIndexes(),
      ]);

      this.logger.log('Database indexes created successfully');

      // 初始化默认数据
      await this.initializeDefaultData();

      this.logger.log('Database initialization completed');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * 初始化默认数据
   */
  private async initializeDefaultData(): Promise<void> {
    try {
      // 检查是否存在默认账户
      const defaultAccount = await this.accountRepository.findByAccountId('default');
      
      if (!defaultAccount) {
        this.logger.log('Creating default account...');
        
        await this.accountRepository.create({
          accountId: 'default',
          name: 'Default Account',
          balances: [
            {
              asset: 'USDT',
              free: 10000,
              locked: 0,
            },
          ],
          totalEquity: 10000,
          availableMargin: 10000,
          usedMargin: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          isActive: true,
          config: {
            defaultLeverage: 1,
            maxPositions: 10,
            riskPerTrade: 0.02,
            autoStopLoss: false,
            autoTakeProfit: false,
          },
        } as any);

        this.logger.log('Default account created successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize default data:', error);
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats(): Promise<{
    accounts: number;
    klineRecords: number;
    positions: number;
    strategies: number;
    tradeOrders: number;
  }> {
    const [accounts, klineRecords, positions, strategies, tradeOrders] = await Promise.all([
      this.accountRepository.count(),
      this.klineDataRepository.count(),
      this.positionRepository.count(),
      this.strategyRepository.count(),
      this.tradeOrderRepository.count(),
    ]);

    return {
      accounts,
      klineRecords,
      positions,
      strategies,
      tradeOrders,
    };
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      this.logger.log('Starting database cleanup...');

      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      // 清理过期的已关闭持仓（30天前）
      const cleanedPositions = await this.positionRepository.cleanupOldClosedPositions(thirtyDaysAgo);
      this.logger.log(`Cleaned up ${cleanedPositions.deletedCount} old closed positions`);

      // 取消过期的待处理订单（7天前）
      const cancelledOrders = await this.tradeOrderRepository.cancelExpiredOrders(sevenDaysAgo);
      this.logger.log(`Cancelled ${cancelledOrders.modifiedCount} expired orders`);

      // 清理无效的策略配置
      const cleanedStrategies = await this.strategyRepository.cleanupInvalidStrategies();
      this.logger.log(`Cleaned up ${cleanedStrategies.deletedCount} invalid strategies`);

      // 清理无效的账户数据
      const cleanedAccounts = await this.accountRepository.cleanupInvalidAccounts();
      this.logger.log(`Cleaned up ${cleanedAccounts.deletedCount} invalid accounts`);

      this.logger.log('Database cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup database:', error);
      throw error;
    }
  }

  /**
   * 备份数据库
   */
  async backupDatabase(): Promise<void> {
    // 这里可以实现数据库备份逻辑
    // 例如导出重要数据到文件或其他存储系统
    this.logger.log('Database backup functionality not implemented yet');
  }

  /**
   * 验证数据完整性
   */
  async validateDataIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // 检查账户余额一致性
      const accounts = await this.accountRepository.findActiveAccounts();
      for (const account of accounts) {
        for (const balance of account.balances) {
          if (balance.free < 0 || balance.locked < 0) {
            issues.push(`Account ${account.accountId} has negative balance for ${balance.asset}`);
          }
        }
      }

      // 检查持仓数据一致性
      const activePositions = await this.positionRepository.findActivePositions();
      for (const position of activePositions) {
        if (position.size <= 0) {
          issues.push(`Position ${position.id} has invalid size: ${position.size}`);
        }
        
        if (position.margin <= 0) {
          issues.push(`Position ${position.id} has invalid margin: ${position.margin}`);
        }
      }

      // 检查策略配置完整性
      const strategies = await this.strategyRepository.findEnabledStrategies();
      for (const strategy of strategies) {
        if (!strategy.symbols || strategy.symbols.length === 0) {
          issues.push(`Strategy ${strategy.id} has no symbols configured`);
        }
        
        if (!strategy.parameters) {
          issues.push(`Strategy ${strategy.id} has no parameters configured`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
      };
    } catch (error) {
      this.logger.error('Failed to validate data integrity:', error);
      return {
        isValid: false,
        issues: [`Validation failed: ${error.message}`],
      };
    }
  }
}