import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TradeOrder, TradeOrderDocument, OrderStatus, OrderSide } from '../schemas/trade-order.schema';
import { BaseRepository, PaginationResult } from './base.repository';

export interface TradeOrderFilter {
  accountId?: string;
  symbol?: string;
  status?: OrderStatus;
  side?: OrderSide;
  startTime?: number;
  endTime?: number;
}

export interface TradeOrderQuery extends TradeOrderFilter {
  page?: number;
  limit?: number;
  sort?: { [key: string]: 1 | -1 };
}

@Injectable()
export class TradeOrderRepository extends BaseRepository<TradeOrderDocument> {
  constructor(
    @InjectModel(TradeOrder.name)
    private readonly tradeOrderModel: Model<TradeOrderDocument>
  ) {
    super(tradeOrderModel);
  }

  /**
   * 根据账户ID查询交易订单
   */
  async findByAccountId(
    accountId: string,
    status?: OrderStatus,
    limit?: number
  ): Promise<TradeOrderDocument[]> {
    const filter: any = { accountId };
    if (status) filter.status = status;

    let query = this.tradeOrderModel.find(filter).sort({ timestamp: -1 });
    
    if (limit) {
      query = query.limit(limit);
    }

    return query.exec();
  }

  /**
   * 根据交易对查询订单
   */
  async findBySymbol(
    symbol: string,
    accountId?: string,
    status?: OrderStatus
  ): Promise<TradeOrderDocument[]> {
    const filter: any = { symbol };
    if (accountId) filter.accountId = accountId;
    if (status) filter.status = status;

    return this.tradeOrderModel
      .find(filter)
      .sort({ timestamp: -1 })
      .exec();
  }

  /**
   * 获取待处理的订单
   */
  async findPendingOrders(accountId?: string): Promise<TradeOrderDocument[]> {
    const filter: any = { status: OrderStatus.PENDING };
    if (accountId) filter.accountId = accountId;

    return this.tradeOrderModel
      .find(filter)
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * 分页查询交易订单
   */
  async findWithFiltersAndPagination(
    query: TradeOrderQuery
  ): Promise<PaginationResult<TradeOrderDocument>> {
    const { 
      accountId, 
      symbol, 
      status, 
      side, 
      startTime, 
      endTime, 
      page = 1, 
      limit = 100, 
      sort = { timestamp: -1 } 
    } = query;
    
    const filter: any = {};
    if (accountId) filter.accountId = accountId;
    if (symbol) filter.symbol = symbol;
    if (status) filter.status = status;
    if (side) filter.side = side;
    
    if (startTime || endTime) {
      filter.timestamp = {};
      if (startTime) filter.timestamp.$gte = startTime;
      if (endTime) filter.timestamp.$lte = endTime;
    }

    return this.findWithPagination(filter, { page, limit, sort });
  }

  /**
   * 更新订单状态
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    filledQuantity?: number,
    filledPrice?: number,
    commission?: number,
    commissionAsset?: string,
    errorMessage?: string
  ): Promise<TradeOrderDocument | null> {
    const updateData: any = { status };
    
    if (filledQuantity !== undefined) updateData.filledQuantity = filledQuantity;
    if (filledPrice !== undefined) updateData.filledPrice = filledPrice;
    if (commission !== undefined) updateData.commission = commission;
    if (commissionAsset !== undefined) updateData.commissionAsset = commissionAsset;
    if (errorMessage !== undefined) updateData.errorMessage = errorMessage;

    return this.update(orderId, updateData);
  }

  /**
   * 批量更新订单状态
   */
  async bulkUpdateStatus(
    orderIds: string[],
    status: OrderStatus,
    errorMessage?: string
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const updateData: any = { status };
    if (errorMessage) updateData.errorMessage = errorMessage;

    return this.updateMany(
      { id: { $in: orderIds } },
      updateData
    );
  }

  /**
   * 获取账户交易统计
   */
  async getAccountTradingStats(accountId: string, startTime?: number, endTime?: number): Promise<{
    totalOrders: number;
    filledOrders: number;
    cancelledOrders: number;
    rejectedOrders: number;
    totalVolume: number;
    totalCommission: number;
    symbols: string[];
  }> {
    const matchStage: any = { accountId };
    
    if (startTime || endTime) {
      matchStage.timestamp = {};
      if (startTime) matchStage.timestamp.$gte = startTime;
      if (endTime) matchStage.timestamp.$lte = endTime;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          filledOrders: {
            $sum: { $cond: [{ $eq: ['$status', OrderStatus.FILLED] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', OrderStatus.CANCELLED] }, 1, 0] }
          },
          rejectedOrders: {
            $sum: { $cond: [{ $eq: ['$status', OrderStatus.REJECTED] }, 1, 0] }
          },
          totalVolume: {
            $sum: {
              $cond: [
                { $eq: ['$status', OrderStatus.FILLED] },
                { $multiply: ['$filledQuantity', '$filledPrice'] },
                0
              ]
            }
          },
          totalCommission: { $sum: { $ifNull: ['$commission', 0] } },
          symbols: { $addToSet: '$symbol' },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalOrders: 0,
        filledOrders: 0,
        cancelledOrders: 0,
        rejectedOrders: 0,
        totalVolume: 0,
        totalCommission: 0,
        symbols: [],
      };
    }

    return result[0];
  }

  /**
   * 获取交易对的订单统计
   */
  async getSymbolOrderStats(symbol: string, accountId?: string): Promise<{
    totalOrders: number;
    buyOrders: number;
    sellOrders: number;
    avgOrderSize: number;
    totalVolume: number;
  }> {
    const matchStage: any = { symbol, status: OrderStatus.FILLED };
    if (accountId) matchStage.accountId = accountId;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          buyOrders: {
            $sum: { $cond: [{ $eq: ['$side', OrderSide.BUY] }, 1, 0] }
          },
          sellOrders: {
            $sum: { $cond: [{ $eq: ['$side', OrderSide.SELL] }, 1, 0] }
          },
          totalQuantity: { $sum: '$filledQuantity' },
          totalVolume: {
            $sum: { $multiply: ['$filledQuantity', '$filledPrice'] }
          },
        },
      },
      {
        $project: {
          totalOrders: 1,
          buyOrders: 1,
          sellOrders: 1,
          avgOrderSize: { $divide: ['$totalQuantity', '$totalOrders'] },
          totalVolume: 1,
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalOrders: 0,
        buyOrders: 0,
        sellOrders: 0,
        avgOrderSize: 0,
        totalVolume: 0,
      };
    }

    return result[0];
  }

  /**
   * 获取订单执行历史
   */
  async getOrderExecutionHistory(
    accountId: string,
    limit: number = 100
  ): Promise<TradeOrderDocument[]> {
    return this.tradeOrderModel
      .find({
        accountId,
        status: OrderStatus.FILLED,
      })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 取消过期的待处理订单
   */
  async cancelExpiredOrders(expirationTime: number): Promise<{ modifiedCount: number }> {
    return this.updateMany(
      {
        status: OrderStatus.PENDING,
        timestamp: { $lt: expirationTime },
      },
      {
        status: OrderStatus.CANCELLED,
        errorMessage: 'Order expired',
      }
    );
  }

  /**
   * 创建必要的索引
   */
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.createIndex({ accountId: 1, timestamp: -1 }),
      this.createIndex({ symbol: 1, timestamp: -1 }),
      this.createIndex({ status: 1, timestamp: -1 }),
      this.createIndex({ accountId: 1, symbol: 1, timestamp: -1 }),
      this.createIndex({ accountId: 1, status: 1 }),
      this.createIndex({ id: 1 }, { unique: true }),
    ]);
  }
}