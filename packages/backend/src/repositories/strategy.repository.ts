import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Strategy, StrategyDocument } from '../schemas/strategy.schema';
import { BaseRepository, PaginationResult } from './base.repository';

export interface StrategyFilter {
  accountId?: string;
  type?: string;
  enabled?: boolean;
  symbol?: string;
  timeframe?: string;
}

export interface StrategyQuery extends StrategyFilter {
  page?: number;
  limit?: number;
  sort?: { [key: string]: 1 | -1 };
}

@Injectable()
export class StrategyRepository extends BaseRepository<StrategyDocument> {
  constructor(
    @InjectModel(Strategy.name)
    private readonly strategyModel: Model<StrategyDocument>
  ) {
    super(strategyModel);
  }

  /**
   * 根据账户ID查询策略
   */
  async findByAccountId(
    accountId: string,
    enabled?: boolean
  ): Promise<StrategyDocument[]> {
    const filter: any = { accountId };
    if (enabled !== undefined) filter.enabled = enabled;

    return this.strategyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 根据策略类型查询
   */
  async findByType(
    type: string,
    enabled: boolean = true
  ): Promise<StrategyDocument[]> {
    return this.strategyModel
      .find({ type, enabled })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 根据账户和策略名称查询
   */
  async findByAccountAndName(
    accountId: string,
    name: string
  ): Promise<StrategyDocument | null> {
    return this.strategyModel
      .findOne({ accountId, name })
      .exec();
  }

  /**
   * 获取启用的策略
   */
  async findEnabledStrategies(accountId?: string): Promise<StrategyDocument[]> {
    const filter: any = { enabled: true };
    if (accountId) filter.accountId = accountId;

    return this.strategyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 分页查询策略
   */
  async findWithFiltersAndPagination(
    query: StrategyQuery
  ): Promise<PaginationResult<StrategyDocument>> {
    const { 
      accountId, 
      type, 
      enabled, 
      symbol, 
      timeframe, 
      page = 1, 
      limit = 100, 
      sort = { createdAt: -1 } 
    } = query;
    
    const filter: any = {};
    if (accountId) filter.accountId = accountId;
    if (type) filter.type = type;
    if (enabled !== undefined) filter.enabled = enabled;
    if (timeframe) filter.timeframe = timeframe;
    
    // 如果指定了交易对，查询包含该交易对的策略
    if (symbol) {
      filter.symbols = { $in: [symbol] };
    }

    return this.findWithPagination(filter, { page, limit, sort });
  }

  /**
   * 更新策略状态
   */
  async updateStrategyState(
    strategyId: string,
    stateUpdate: {
      lastExecutionTime?: number;
      totalTrades?: number;
      winningTrades?: number;
      totalPnl?: number;
      [key: string]: any;
    }
  ): Promise<StrategyDocument | null> {
    return this.updateOne(
      { id: strategyId },
      { $set: { 'state': stateUpdate } }
    );
  }

  /**
   * 增量更新策略统计
   */
  async incrementStrategyStats(
    strategyId: string,
    tradeResult: { pnl: number; isWin: boolean }
  ): Promise<StrategyDocument | null> {
    const updateData: any = {
      $inc: {
        'state.totalTrades': 1,
        'state.totalPnl': tradeResult.pnl,
      },
      $set: {
        'state.lastExecutionTime': Date.now(),
      },
    };

    if (tradeResult.isWin) {
      updateData.$inc['state.winningTrades'] = 1;
    }

    return this.updateOne({ id: strategyId }, updateData);
  }

  /**
   * 更新策略回测结果
   */
  async updateBacktestResults(
    strategyId: string,
    backtestResults: {
      startTime: number;
      endTime: number;
      totalReturn: number;
      maxDrawdown: number;
      sharpeRatio: number;
      winRate: number;
      totalTrades: number;
      profitFactor: number;
      [key: string]: any;
    }
  ): Promise<StrategyDocument | null> {
    return this.update(strategyId, {
      backtestResults,
    });
  }

  /**
   * 启用/禁用策略
   */
  async toggleStrategy(
    strategyId: string,
    enabled: boolean
  ): Promise<StrategyDocument | null> {
    return this.update(strategyId, { enabled });
  }

  /**
   * 批量启用/禁用策略
   */
  async bulkToggleStrategies(
    strategyIds: string[],
    enabled: boolean
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.updateMany(
      { id: { $in: strategyIds } },
      { enabled }
    );
  }

  /**
   * 获取策略类型统计
   */
  async getStrategyTypeStats(): Promise<Array<{
    type: string;
    count: number;
    enabledCount: number;
  }>> {
    const pipeline = [
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          enabledCount: {
            $sum: { $cond: [{ $eq: ['$enabled', true] }, 1, 0] }
          },
        },
      },
      {
        $project: {
          type: '$_id',
          count: 1,
          enabledCount: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ];

    return this.aggregate(pipeline);
  }

  /**
   * 获取账户策略统计
   */
  async getAccountStrategyStats(accountId: string): Promise<{
    totalStrategies: number;
    enabledStrategies: number;
    totalTrades: number;
    totalPnl: number;
    avgWinRate: number;
    strategyTypes: string[];
  }> {
    const pipeline = [
      { $match: { accountId } },
      {
        $group: {
          _id: null,
          totalStrategies: { $sum: 1 },
          enabledStrategies: {
            $sum: { $cond: [{ $eq: ['$enabled', true] }, 1, 0] }
          },
          totalTrades: { $sum: { $ifNull: ['$state.totalTrades', 0] } },
          totalPnl: { $sum: { $ifNull: ['$state.totalPnl', 0] } },
          totalWinningTrades: { $sum: { $ifNull: ['$state.winningTrades', 0] } },
          strategyTypes: { $addToSet: '$type' },
        },
      },
      {
        $project: {
          totalStrategies: 1,
          enabledStrategies: 1,
          totalTrades: 1,
          totalPnl: 1,
          avgWinRate: {
            $cond: [
              { $gt: ['$totalTrades', 0] },
              { $divide: ['$totalWinningTrades', '$totalTrades'] },
              0
            ]
          },
          strategyTypes: 1,
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalStrategies: 0,
        enabledStrategies: 0,
        totalTrades: 0,
        totalPnl: 0,
        avgWinRate: 0,
        strategyTypes: [],
      };
    }

    return result[0];
  }

  /**
   * 获取策略性能排行
   */
  async getStrategyPerformanceRanking(
    accountId?: string,
    limit: number = 10
  ): Promise<Array<{
    strategyId: string;
    name: string;
    type: string;
    totalPnl: number;
    winRate: number;
    totalTrades: number;
  }>> {
    const matchStage: any = { enabled: true };
    if (accountId) matchStage.accountId = accountId;

    const pipeline = [
      { $match: matchStage },
      {
        $project: {
          strategyId: '$id',
          name: 1,
          type: 1,
          totalPnl: { $ifNull: ['$state.totalPnl', 0] },
          totalTrades: { $ifNull: ['$state.totalTrades', 0] },
          winningTrades: { $ifNull: ['$state.winningTrades', 0] },
          winRate: {
            $cond: [
              { $gt: [{ $ifNull: ['$state.totalTrades', 0] }, 0] },
              {
                $divide: [
                  { $ifNull: ['$state.winningTrades', 0] },
                  { $ifNull: ['$state.totalTrades', 1] }
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
   * 查找使用特定交易对的策略
   */
  async findStrategiesBySymbol(
    symbol: string,
    enabled: boolean = true
  ): Promise<StrategyDocument[]> {
    return this.strategyModel
      .find({
        symbols: { $in: [symbol] },
        enabled,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 查找使用特定时间框架的策略
   */
  async findStrategiesByTimeframe(
    timeframe: string,
    enabled: boolean = true
  ): Promise<StrategyDocument[]> {
    return this.strategyModel
      .find({ timeframe, enabled })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * 清理无效的策略配置
   */
  async cleanupInvalidStrategies(): Promise<{ deletedCount: number }> {
    // 删除没有交易对或参数为空的策略
    return this.deleteMany({
      $or: [
        { symbols: { $size: 0 } },
        { symbols: { $exists: false } },
        { parameters: { $exists: false } },
        { parameters: null },
      ],
    });
  }

  /**
   * 创建必要的索引
   */
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.createIndex({ accountId: 1, enabled: 1 }),
      this.createIndex({ type: 1, enabled: 1 }),
      this.createIndex({ accountId: 1, name: 1 }, { unique: true }),
      this.createIndex({ enabled: 1, createdAt: -1 }),
      this.createIndex({ symbols: 1, enabled: 1 }),
      this.createIndex({ timeframe: 1, enabled: 1 }),
      this.createIndex({ id: 1 }, { unique: true }),
    ]);
  }
}