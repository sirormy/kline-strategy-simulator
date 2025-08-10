import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account, AccountDocument, Balance } from '../schemas/account.schema';
import { BaseRepository, PaginationResult } from './base.repository';

export interface AccountFilter {
  isActive?: boolean;
}

export interface AccountQuery extends AccountFilter {
  page?: number;
  limit?: number;
  sort?: { [key: string]: 1 | -1 };
}

@Injectable()
export class AccountRepository extends BaseRepository<AccountDocument> {
  constructor(
    @InjectModel(Account.name)
    private readonly accountModel: Model<AccountDocument>
  ) {
    super(accountModel);
  }

  /**
   * 根据账户ID查询账户
   */
  async findByAccountId(accountId: string): Promise<AccountDocument | null> {
    return this.accountModel.findOne({ accountId }).exec();
  }

  /**
   * 获取所有活跃账户
   */
  async findActiveAccounts(): Promise<AccountDocument[]> {
    return this.accountModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 分页查询账户
   */
  async findWithFiltersAndPagination(
    query: AccountQuery
  ): Promise<PaginationResult<AccountDocument>> {
    const { 
      isActive, 
      page = 1, 
      limit = 100, 
      sort = { createdAt: -1 } 
    } = query;
    
    const filter: any = {};
    if (isActive !== undefined) filter.isActive = isActive;

    return this.findWithPagination(filter, { page, limit, sort });
  }

  /**
   * 更新账户余额
   */
  async updateAccountBalance(
    accountId: string,
    asset: string,
    freeChange: number,
    lockedChange: number = 0
  ): Promise<AccountDocument | null> {
    const account = await this.findByAccountId(accountId);
    if (!account) return null;

    // 使用账户模型的方法更新余额
    try {
      account.updateBalance(asset, freeChange, lockedChange);
      return account.save();
    } catch (error) {
      throw error;
    }
  }

  /**
   * 批量更新账户余额
   */
  async bulkUpdateBalances(
    updates: Array<{
      accountId: string;
      asset: string;
      freeChange: number;
      lockedChange?: number;
    }>
  ): Promise<any> {
    const operations = [];

    for (const update of updates) {
      const { accountId, asset, freeChange, lockedChange = 0 } = update;
      
      operations.push({
        updateOne: {
          filter: { accountId, 'balances.asset': asset },
          update: {
            $inc: {
              'balances.$.free': freeChange,
              'balances.$.locked': lockedChange,
            },
          },
        },
      });

      // 如果资产不存在，添加新的余额记录
      operations.push({
        updateOne: {
          filter: { 
            accountId, 
            'balances.asset': { $ne: asset } 
          },
          update: {
            $push: {
              balances: {
                asset,
                free: Math.max(0, freeChange),
                locked: Math.max(0, lockedChange),
              },
            },
          },
        },
      });
    }

    return this.bulkWrite(operations);
  }

  /**
   * 更新账户权益信息
   */
  async updateAccountEquity(
    accountId: string,
    totalEquity: number,
    availableMargin: number,
    usedMargin: number,
    unrealizedPnl: number,
    realizedPnl?: number
  ): Promise<AccountDocument | null> {
    const updateData: any = {
      totalEquity,
      availableMargin,
      usedMargin,
      unrealizedPnl,
    };

    if (realizedPnl !== undefined) {
      updateData.realizedPnl = realizedPnl;
    }

    return this.updateOne({ accountId }, updateData);
  }

  /**
   * 更新账户统计信息
   */
  async updateAccountStats(
    accountId: string,
    tradeResult: {
      pnl: number;
      isWin: boolean;
      commission: number;
      fundingFee?: number;
    }
  ): Promise<AccountDocument | null> {
    const account = await this.findByAccountId(accountId);
    if (!account) return null;

    // 使用账户模型的方法更新统计
    account.updateStats(tradeResult);
    return account.save();
  }

  /**
   * 获取账户资产余额
   */
  async getAccountBalance(
    accountId: string,
    asset: string
  ): Promise<Balance | null> {
    const account = await this.findByAccountId(accountId);
    if (!account) return null;

    return account.getBalance(asset);
  }

  /**
   * 获取账户所有余额
   */
  async getAccountBalances(accountId: string): Promise<Balance[]> {
    const account = await this.findByAccountId(accountId);
    if (!account) return [];

    return account.balances;
  }

  /**
   * 激活/停用账户
   */
  async toggleAccountStatus(
    accountId: string,
    isActive: boolean
  ): Promise<AccountDocument | null> {
    return this.updateOne({ accountId }, { isActive });
  }

  /**
   * 获取账户总览统计
   */
  async getAccountOverviewStats(): Promise<{
    totalAccounts: number;
    activeAccounts: number;
    totalEquity: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  }> {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalAccounts: { $sum: 1 },
          activeAccounts: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          totalEquity: { $sum: '$totalEquity' },
          totalUnrealizedPnl: { $sum: '$unrealizedPnl' },
          totalRealizedPnl: { $sum: '$realizedPnl' },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalAccounts: 0,
        activeAccounts: 0,
        totalEquity: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
      };
    }

    return result[0];
  }

  /**
   * 获取资产分布统计
   */
  async getAssetDistribution(): Promise<Array<{
    asset: string;
    totalFree: number;
    totalLocked: number;
    accountCount: number;
  }>> {
    const pipeline = [
      { $unwind: '$balances' },
      {
        $group: {
          _id: '$balances.asset',
          totalFree: { $sum: '$balances.free' },
          totalLocked: { $sum: '$balances.locked' },
          accountCount: { $sum: 1 },
        },
      },
      {
        $project: {
          asset: '$_id',
          totalFree: 1,
          totalLocked: 1,
          accountCount: 1,
          _id: 0,
        },
      },
      { $sort: { totalFree: -1 } },
    ];

    return this.aggregate(pipeline);
  }

  /**
   * 获取账户性能排行
   */
  async getAccountPerformanceRanking(limit: number = 10): Promise<Array<{
    accountId: string;
    name: string;
    totalEquity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    winRate: number;
  }>> {
    const pipeline = [
      { $match: { isActive: true } },
      {
        $project: {
          accountId: 1,
          name: 1,
          totalEquity: 1,
          realizedPnl: 1,
          unrealizedPnl: 1,
          totalPnl: { $add: ['$realizedPnl', '$unrealizedPnl'] },
          winRate: {
            $cond: [
              { $gt: [{ $ifNull: ['$stats.totalTrades', 0] }, 0] },
              {
                $divide: [
                  { $ifNull: ['$stats.winningTrades', 0] },
                  { $ifNull: ['$stats.totalTrades', 1] }
                ]
              },
              0
            ]
          },
        },
      },
      { $sort: { totalPnl: -1 } },
      { $limit: limit },
    ];

    return this.aggregate(pipeline);
  }

  /**
   * 计算并更新账户总权益
   */
  async calculateAndUpdateTotalEquity(
    accountId: string,
    prices: { [asset: string]: number }
  ): Promise<AccountDocument | null> {
    const account = await this.findByAccountId(accountId);
    if (!account) return null;

    // 使用账户模型的方法计算总权益
    account.calculateTotalEquity(prices);
    
    return account.save();
  }

  /**
   * 清理无效的账户数据
   */
  async cleanupInvalidAccounts(): Promise<{ deletedCount: number }> {
    // 删除没有余额记录的账户
    return this.deleteMany({
      $or: [
        { balances: { $size: 0 } },
        { balances: { $exists: false } },
      ],
    });
  }

  /**
   * 创建必要的索引
   */
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.createIndex({ accountId: 1 }, { unique: true }),
      this.createIndex({ isActive: 1 }),
      this.createIndex({ totalEquity: -1 }),
      this.createIndex({ 'balances.asset': 1 }),
    ]);
  }
}