import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KlineData, KlineDataDocument } from '../schemas/kline-data.schema';
import { BaseRepository, PaginationResult, PaginationOptions } from './base.repository';

export interface KlineDataFilter {
  symbol?: string;
  interval?: string;
  startTime?: number;
  endTime?: number;
}

export interface KlineDataQuery extends KlineDataFilter {
  page?: number;
  limit?: number;
  sort?: { [key: string]: 1 | -1 };
}

@Injectable()
export class KlineDataRepository extends BaseRepository<KlineDataDocument> {
  constructor(
    @InjectModel(KlineData.name)
    private readonly klineDataModel: Model<KlineDataDocument>
  ) {
    super(klineDataModel);
  }

  /**
   * 根据交易对和时间间隔查询K线数据
   */
  async findBySymbolAndInterval(
    symbol: string,
    interval: string,
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<KlineDataDocument[]> {
    const filter: any = { symbol, interval };
    
    if (startTime || endTime) {
      filter.openTime = {};
      if (startTime) filter.openTime.$gte = startTime;
      if (endTime) filter.openTime.$lte = endTime;
    }

    let query = this.klineDataModel.find(filter).sort({ openTime: 1 });
    
    if (limit) {
      query = query.limit(limit);
    }

    return query.exec();
  }

  /**
   * 获取最新的K线数据
   */
  async findLatest(symbol: string, interval: string, limit: number = 1): Promise<KlineDataDocument[]> {
    return this.klineDataModel
      .find({ symbol, interval })
      .sort({ openTime: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 获取指定时间范围内的K线数据（分页）
   */
  async findWithTimeRangeAndPagination(
    query: KlineDataQuery
  ): Promise<PaginationResult<KlineDataDocument>> {
    const { symbol, interval, startTime, endTime, page = 1, limit = 500, sort = { openTime: 1 } } = query;
    
    const filter: any = {};
    if (symbol) filter.symbol = symbol;
    if (interval) filter.interval = interval;
    
    if (startTime || endTime) {
      filter.openTime = {};
      if (startTime) filter.openTime.$gte = startTime;
      if (endTime) filter.openTime.$lte = endTime;
    }

    return this.findWithPagination(filter, { page, limit, sort });
  }

  /**
   * 批量插入K线数据（处理重复数据）
   */
  async bulkUpsert(klineData: Partial<KlineDataDocument>[]): Promise<any> {
    const operations = klineData.map(data => ({
      updateOne: {
        filter: {
          symbol: data.symbol,
          interval: data.interval,
          openTime: data.openTime,
        },
        update: { $set: data },
        upsert: true,
      },
    }));

    return this.bulkWrite(operations);
  }

  /**
   * 获取交易对的时间范围
   */
  async getTimeRange(symbol: string, interval: string): Promise<{ 
    earliest: number | null; 
    latest: number | null; 
    count: number 
  }> {
    const pipeline = [
      { $match: { symbol, interval } },
      {
        $group: {
          _id: null,
          earliest: { $min: '$openTime' },
          latest: { $max: '$openTime' },
          count: { $sum: 1 },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return { earliest: null, latest: null, count: 0 };
    }

    return {
      earliest: result[0].earliest,
      latest: result[0].latest,
      count: result[0].count,
    };
  }

  /**
   * 获取所有可用的交易对
   */
  async getAvailableSymbols(): Promise<string[]> {
    const result = await this.aggregate([
      { $group: { _id: '$symbol' } },
      { $sort: { _id: 1 } },
    ]);

    return result.map(item => item._id);
  }

  /**
   * 获取指定交易对的可用时间间隔
   */
  async getAvailableIntervals(symbol: string): Promise<string[]> {
    const result = await this.aggregate([
      { $match: { symbol } },
      { $group: { _id: '$interval' } },
      { $sort: { _id: 1 } },
    ]);

    return result.map(item => item._id);
  }

  /**
   * 删除指定时间范围的数据
   */
  async deleteByTimeRange(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<{ deletedCount: number }> {
    return this.deleteMany({
      symbol,
      interval,
      openTime: { $gte: startTime, $lte: endTime },
    });
  }

  /**
   * 获取数据统计信息
   */
  async getStatistics(symbol?: string, interval?: string): Promise<{
    totalRecords: number;
    symbols: number;
    intervals: number;
    dateRange: { earliest: number | null; latest: number | null };
  }> {
    const matchStage: any = {};
    if (symbol) matchStage.symbol = symbol;
    if (interval) matchStage.interval = interval;

    const pipeline = [
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          symbols: { $addToSet: '$symbol' },
          intervals: { $addToSet: '$interval' },
          earliest: { $min: '$openTime' },
          latest: { $max: '$openTime' },
        },
      },
      {
        $project: {
          totalRecords: 1,
          symbols: { $size: '$symbols' },
          intervals: { $size: '$intervals' },
          dateRange: {
            earliest: '$earliest',
            latest: '$latest',
          },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalRecords: 0,
        symbols: 0,
        intervals: 0,
        dateRange: { earliest: null, latest: null },
      };
    }

    return result[0];
  }

  /**
   * 检查数据完整性（查找缺失的K线）
   */
  async findMissingKlines(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    expectedInterval: number // 毫秒
  ): Promise<number[]> {
    const existingKlines = await this.findBySymbolAndInterval(
      symbol,
      interval,
      startTime,
      endTime
    );

    const existingTimes = new Set(existingKlines.map(k => k.openTime));
    const missingTimes: number[] = [];

    for (let time = startTime; time <= endTime; time += expectedInterval) {
      if (!existingTimes.has(time)) {
        missingTimes.push(time);
      }
    }

    return missingTimes;
  }

  /**
   * 根据查询条件查找K线数据
   */
  async findByQuery(query: {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<KlineDataDocument[]> {
    return this.findBySymbolAndInterval(
      query.symbol,
      query.interval,
      query.startTime,
      query.endTime,
      query.limit
    );
  }

  /**
   * 插入或更新单条K线数据
   */
  async upsert(klineData: Partial<KlineDataDocument>): Promise<KlineDataDocument> {
    return this.updateOne(
      {
        symbol: klineData.symbol,
        interval: klineData.interval,
        openTime: klineData.openTime,
      },
      klineData,
      { upsert: true }
    );
  }

  /**
   * 批量插入K线数据
   */
  async insertMany(klineData: Partial<KlineDataDocument>[]): Promise<KlineDataDocument[]> {
    return this.createMany(klineData);
  }

  /**
   * 创建必要的索引
   */
  async createIndexes(): Promise<void> {
    await Promise.all([
      this.createIndex({ symbol: 1, interval: 1, openTime: 1 }, { unique: true }),
      this.createIndex({ symbol: 1, interval: 1, openTime: -1 }),
      this.createIndex({ symbol: 1, interval: 1, closeTime: 1 }),
      this.createIndex({ openTime: 1 }),
      this.createIndex({ closeTime: 1 }),
    ]);
  }
}