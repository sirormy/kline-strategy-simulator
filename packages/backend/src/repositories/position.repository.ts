import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Position, PositionDocument, PositionSide } from '../schemas/position.schema';
import { BaseRepository, PaginationResult } from './base.repository';

export interface PositionFilter {
  accountId?: string;
  symbol?: string;
  side?: PositionSide;
  isClosed?: boolean;
  startTime?: number;
  endTime?: number;
}

export interface PositionQuery extends PositionFilter {
  page?: number;
  limit?: number;
  sort?: { [key: string]: 1 | -1 };
}

@Injectable()
export class PositionRepository extends BaseRepository<PositionDocument> {
  constructor(
    @InjectModel(Position.name)
    private readonly positionModel: Model<PositionDocument>
  ) {
    super(positionModel);
  }

  /**
   * 根据账户ID查询持仓
   */
  async findByAccountId(
    accountId: string,
    isClosed: boolean = false
  ): Promise<PositionDocument[]> {
    return this.positionModel
      .find({ accountId, isClosed })
      .sort({ openTime: -1 })
      .exec();
  }

  /**
   * 根据交易对查询持仓
   */
  async findBySymbol(
    symbol: string,
    accountId?: string,
    isClosed: boolean = false
  ): Promise<PositionDocument[]> {
    const filter: any = { symbol, isClosed };
    if (accountId) filter.accountId = accountId;

    return this.positionModel
      .find(filter)
      .sort({ openTime: -1 })
      .exec();
  }

  /**
   * 获取活跃持仓
   */
  async findActivePositions(accountId?: string): Promise<PositionDocument[]> {
    const filter: any = { isClosed: false };
    if (accountId) filter.accountId = accountId;

    return this.positionModel
      .find(filter)
      .sort({ openTime: -1 })
      .exec();
  }

  /**
   * 根据账户和交易对查询特定持仓
   */
  async findByAccountAndSymbol(
    accountId: string,
    symbol: string,
    isClosed: boolean = false
  ): Promise<PositionDocument | null> {
    return this.positionModel
      .findOne({ accountId, symbol, isClosed })
      .exec();
  }

  /**
   * 分页查询持仓
   */
  async findWithFiltersAndPagination(
    query: PositionQuery
  ): Promise<PaginationResult<PositionDocument>> {
    const { 
      accountId, 
      symbol, 
      side, 
      isClosed, 
      startTime, 
      endTime, 
      page = 1, 
      limit = 100, 
      sort = { openTime: -1 } 
    } = query;
    
    const filter: any = {};
    if (accountId) filter.accountId = accountId;
    if (symbol) filter.symbol = symbol;
    if (side) filter.side = side;
    if (isClosed !== undefined) filter.isClosed = isClosed;
    
    if (startTime || endTime) {
      filter.openTime = {};
      if (startTime) filter.openTime.$gte = startTime;
      if (endTime) filter.openTime.$lte = endTime;
    }

    return this.findWithPagination(filter, { page, limit, sort });
  }

  /**
   * 更新持仓标记价格和未实现盈亏
   */
  async updateMarkPriceAndPnl(
    positionId: string,
    markPrice: number,
    unrealizedPnl: number
  ): Promise<PositionDocument | null> {
    return this.update(positionId, {
      markPrice,
      unrealizedPnl,
    });
  }

  /**
   * 批量更新持仓标记价格
   */
  async bulkUpdateMarkPrices(
    updates: Array<{ positionId: string; markPrice: number; unrealizedPnl: number }>
  ): Promise<any> {
    const operations = updates.map(({ positionId, markPrice, unrealizedPnl }) => ({
      updateOne: {
        filter: { id: positionId },
        update: { $set: { markPrice, unrealizedPnl } },
      },
    }));

    return this.bulkWrite(operations);
  }

  /**
   * 关闭持仓
   */
  async closePosition(
    positionId: string,
    closePrice: number,
    closeTime: number = Date.now()
  ): Promise<PositionDocument | null> {
    const position = await this.findById(positionId);
    if (!position) return null;

    // 计算已实现盈亏
    const realizedPnl = position.calculateRealizedPnl ? 
      position.calculateRealizedPnl() : 
      this.calculateRealizedPnl(position, closePrice);

    return this.update(positionId, {
      closePrice,
      closeTime,
      realizedPnl,
      isClosed: true,
    });
  }

  /**
   * 计算已实现盈亏的辅助方法
   */
  private calculateRealizedPnl(position: PositionDocument, closePrice: number): number {
    const priceDiff = position.side === PositionSide.LONG 
      ? closePrice - position.entryPrice 
      : position.entryPrice - closePrice;
    
    return (priceDiff * position.size * position.leverage) - 
           position.totalCommission - position.totalFundingFee;
  }

  /**
   * 更新持仓手续费
   */
  async updateCommission(
    positionId: string,
    additionalCommission: number
  ): Promise<PositionDocument | null> {
    return this.updateOne(
      { id: positionId },
      { $inc: { totalCommission: additionalCommission } }
    );
  }

  /**
   * 更新持仓资金费率
   */
  async updateFundingFee(
    positionId: string,
    additionalFundingFee: number
  ): Promise<PositionDocument | null> {
    return this.updateOne(
      { id: positionId },
      { $inc: { totalFundingFee: additionalFundingFee } }
    );
  }

  /**
   * 获取账户持仓统计
   */
  async getAccountPositionStats(accountId: string): Promise<{
    totalPositions: number;
    activePositions: number;
    closedPositions: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    totalMargin: number;
    symbols: string[];
  }> {
    const pipeline = [
      { $match: { accountId } },
      {
        $group: {
          _id: null,
          totalPositions: { $sum: 1 },
          activePositions: {
            $sum: { $cond: [{ $eq: ['$isClosed', false] }, 1, 0] }
          },
          closedPositions: {
            $sum: { $cond: [{ $eq: ['$isClosed', true] }, 1, 0] }
          },
          totalUnrealizedPnl: {
            $sum: {
              $cond: [
                { $eq: ['$isClosed', false] },
                '$unrealizedPnl',
                0
              ]
            }
          },
          totalRealizedPnl: {
            $sum: { $ifNull: ['$realizedPnl', 0] }
          },
          totalMargin: {
            $sum: {
              $cond: [
                { $eq: ['$isClosed', false] },
                '$margin',
                0
              ]
            }
          },
          symbols: { $addToSet: '$symbol' },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalPositions: 0,
        activePositions: 0,
        closedPositions: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        totalMargin: 0,
        symbols: [],
      };
    }

    return result[0];
  }

  /**
   * 获取交易对持仓统计
   */
  async getSymbolPositionStats(symbol: string, accountId?: string): Promise<{
    totalPositions: number;
    longPositions: number;
    shortPositions: number;
    avgHoldingTime: number;
    totalPnl: number;
  }> {
    const matchStage: any = { symbol };
    if (accountId) matchStage.accountId = accountId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalPositions: { $sum: 1 },
          longPositions: {
            $sum: { $cond: [{ $eq: ['$side', PositionSide.LONG] }, 1, 0] }
          },
          shortPositions: {
            $sum: { $cond: [{ $eq: ['$side', PositionSide.SHORT] }, 1, 0] }
          },
          totalHoldingTime: {
            $sum: {
              $cond: [
                { $eq: ['$isClosed', true] },
                { $subtract: ['$closeTime', '$openTime'] },
                { $subtract: [new Date().getTime(), '$openTime'] }
              ]
            }
          },
          totalPnl: {
            $sum: {
              $add: [
                { $ifNull: ['$realizedPnl', 0] },
                {
                  $cond: [
                    { $eq: ['$isClosed', false] },
                    '$unrealizedPnl',
                    0
                  ]
                }
              ]
            }
          },
        },
      },
      {
        $project: {
          totalPositions: 1,
          longPositions: 1,
          shortPositions: 1,
          avgHoldingTime: { $divide: ['$totalHoldingTime', '$totalPositions'] },
          totalPnl: 1,
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalPositions: 0,
        longPositions: 0,
        shortPositions: 0,
        avgHoldingTime: 0,
        totalPnl: 0,
      };
    }

    return result[0];
  }

  /**
   * 获取持仓历史记录
   */
  async getPositionHistory(
    accountId: string,
    symbol?: string,
    limit: number = 100
  ): Promise<PositionDocument[]> {
    const filter: any = { accountId, isClosed: true };
    if (symbol) filter.symbol = symbol;

    return this.positionModel
      .find(filter)
      .sort({ closeTime: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 清理过期的已关闭持仓记录
   */
  async cleanupOldClosedPositions(
    olderThanTimestamp: number
  ): Promise<{ deletedCount: number }> {
    return this.deleteMany({
      isClosed: true,
      closeTime: { $lt: olderThanTimestamp },
    });
  }

  /**
   * 创建必要的索引
   */
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.createIndex({ accountId: 1, symbol: 1 }),
      this.createIndex({ accountId: 1, openTime: -1 }),
      this.createIndex({ symbol: 1, side: 1 }),
      this.createIndex({ accountId: 1, isClosed: 1, openTime: -1 }),
      this.createIndex({ isClosed: 1, closeTime: -1 }),
      this.createIndex({ id: 1 }, { unique: true }),
    ]);
  }
}