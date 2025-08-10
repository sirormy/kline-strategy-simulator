import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { BinanceApiService } from './binance-api.service';
import { BinanceWebSocketService } from './binance-websocket.service';
import { KlineDataRepository } from '../repositories/kline-data.repository';
import { KlineData } from '../schemas/kline-data.schema';

export interface MarketDataQuery {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache size
}

export interface MarketDataServiceConfig {
  cache: CacheConfig;
  realTimeEnabled: boolean;
  persistRealTimeData: boolean;
  maxHistoricalDataPoints: number;
}

@Injectable()
export class MarketDataService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly cache = new Map<string, { data: KlineData[]; timestamp: number }>();
  private readonly config: MarketDataServiceConfig;
  private readonly supportedIntervals = [
    '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly binanceApiService: BinanceApiService,
    private readonly binanceWebSocketService: BinanceWebSocketService,
    private readonly klineDataRepository: KlineDataRepository,
  ) {
    super();
    
    this.config = {
      cache: {
        enabled: this.configService.get('MARKET_DATA_CACHE_ENABLED', 'true') === 'true',
        ttl: parseInt(this.configService.get('MARKET_DATA_CACHE_TTL', '300')), // 5 minutes
        maxSize: parseInt(this.configService.get('MARKET_DATA_CACHE_MAX_SIZE', '1000')),
      },
      realTimeEnabled: this.configService.get('REAL_TIME_DATA_ENABLED', 'true') === 'true',
      persistRealTimeData: this.configService.get('PERSIST_REAL_TIME_DATA', 'true') === 'true',
      maxHistoricalDataPoints: parseInt(this.configService.get('MAX_HISTORICAL_DATA_POINTS', '10000')),
    };
  }

  async onModuleInit() {
    this.logger.log('Market Data Service initializing...');
    
    // 设置WebSocket事件监听
    if (this.config.realTimeEnabled) {
      this.setupWebSocketListeners();
    }

    // 清理过期缓存的定时器
    if (this.config.cache.enabled) {
      setInterval(() => this.cleanExpiredCache(), 60000); // 每分钟清理一次
    }

    this.logger.log('Market Data Service initialized');
  }

  onModuleDestroy() {
    this.cleanup();
  }

  /**
   * 获取历史K线数据
   * @param query 查询参数
   * @param useCache 是否使用缓存
   */
  async getHistoricalKlines(query: MarketDataQuery, useCache = true): Promise<KlineData[]> {
    this.validateQuery(query);

    const cacheKey = this.generateCacheKey(query);
    
    // 尝试从缓存获取
    if (useCache && this.config.cache.enabled) {
      const cachedData = this.getFromCache(cacheKey);
      if (cachedData) {
        this.logger.debug(`Cache hit for ${cacheKey}`);
        return cachedData;
      }
    }

    try {
      // 首先尝试从数据库获取
      const dbData = await this.getFromDatabase(query);
      
      // 如果数据库中的数据不完整，从API获取
      const missingData = await this.getMissingDataFromApi(query, dbData);
      
      // 合并数据
      const allData = this.mergeKlineData(dbData, missingData);
      
      // 保存新数据到数据库
      if (missingData.length > 0) {
        await this.saveToDatabase(missingData);
      }

      // 缓存结果
      if (this.config.cache.enabled) {
        this.setCache(cacheKey, allData);
      }

      this.logger.debug(`Retrieved ${allData.length} kline data points for ${query.symbol} ${query.interval}`);
      return allData;

    } catch (error) {
      this.logger.error(`Failed to get historical klines for ${query.symbol} ${query.interval}:`, error);
      throw error;
    }
  }

  /**
   * 订阅实时K线数据
   * @param symbol 交易对符号
   * @param interval 时间间隔
   */
  subscribeKlineStream(symbol: string, interval: string): void {
    if (!this.config.realTimeEnabled) {
      throw new Error('Real-time data is disabled');
    }

    this.validateSymbolAndInterval(symbol, interval);
    
    if (this.binanceWebSocketService.isSubscribed(symbol, interval)) {
      this.logger.warn(`Already subscribed to ${symbol} ${interval}`);
      return;
    }

    this.logger.log(`Subscribing to real-time kline data: ${symbol} ${interval}`);
    this.binanceWebSocketService.subscribeKlineStream(symbol, interval);
  }

  /**
   * 取消订阅实时K线数据
   * @param symbol 交易对符号
   * @param interval 时间间隔
   */
  unsubscribeKlineStream(symbol: string, interval: string): void {
    this.logger.log(`Unsubscribing from real-time kline data: ${symbol} ${interval}`);
    this.binanceWebSocketService.unsubscribeKlineStream(symbol, interval);
  }

  /**
   * 获取支持的交易对
   */
  async getSupportedSymbols(): Promise<string[]> {
    const cacheKey = 'supported_symbols';
    
    if (this.config.cache.enabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cache.ttl * 1000) {
        return cached.data as any;
      }
    }

    try {
      const symbols = await this.binanceApiService.getSupportedSymbols();
      
      if (this.config.cache.enabled) {
        this.cache.set(cacheKey, { data: symbols as any, timestamp: Date.now() });
      }

      return symbols;
    } catch (error) {
      this.logger.error('Failed to get supported symbols:', error);
      throw error;
    }
  }

  /**
   * 获取支持的时间间隔
   */
  getSupportedIntervals(): string[] {
    return [...this.supportedIntervals];
  }

  /**
   * 获取交易对信息
   * @param symbol 交易对符号
   */
  async getSymbolInfo(symbol: string) {
    return this.binanceApiService.getSymbolInfo(symbol);
  }

  /**
   * 获取24小时价格统计
   * @param symbol 交易对符号
   */
  async get24hrTicker(symbol?: string) {
    return this.binanceApiService.get24hrTicker(symbol);
  }

  /**
   * 获取最新价格
   * @param symbol 交易对符号
   */
  async getTickerPrice(symbol?: string) {
    return this.binanceApiService.getTickerPrice(symbol);
  }

  /**
   * 检查服务健康状态
   */
  async getHealthStatus() {
    const apiStatus = await this.binanceApiService.ping();
    const wsStatus = this.binanceWebSocketService.getConnectionStatus();
    
    return {
      api: apiStatus,
      websocket: wsStatus,
      cache: {
        enabled: this.config.cache.enabled,
        size: this.cache.size,
        maxSize: this.config.cache.maxSize,
      },
      subscriptions: this.binanceWebSocketService.getActiveSubscriptions(),
    };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Cache cleared');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.cache.maxSize,
      enabled: this.config.cache.enabled,
      ttl: this.config.cache.ttl,
    };
  }

  /**
   * 设置WebSocket事件监听器
   */
  private setupWebSocketListeners(): void {
    this.binanceWebSocketService.on('klineData', async (klineData: KlineData) => {
      try {
        // 持久化实时数据
        if (this.config.persistRealTimeData) {
          await this.klineDataRepository.upsert(klineData);
        }

        // 更新缓存
        this.updateCacheWithRealTimeData(klineData);

        // 发出事件
        this.emit('klineData', klineData);
        this.emit(`klineData:${klineData.symbol}:${klineData.interval}`, klineData);

      } catch (error) {
        this.logger.error('Failed to process real-time kline data:', error);
      }
    });

    this.binanceWebSocketService.on('connected', () => {
      this.emit('websocketConnected');
    });

    this.binanceWebSocketService.on('disconnected', () => {
      this.emit('websocketDisconnected');
    });

    this.binanceWebSocketService.on('error', (error: Error) => {
      this.emit('websocketError', error);
    });
  }

  /**
   * 验证查询参数
   */
  private validateQuery(query: MarketDataQuery): void {
    if (!query.symbol || typeof query.symbol !== 'string') {
      throw new Error('Invalid symbol');
    }

    if (!query.interval || !this.supportedIntervals.includes(query.interval)) {
      throw new Error(`Invalid interval. Supported intervals: ${this.supportedIntervals.join(', ')}`);
    }

    if (query.limit !== undefined && (query.limit < 1 || query.limit > this.config.maxHistoricalDataPoints)) {
      throw new Error(`Invalid limit. Must be between 1 and ${this.config.maxHistoricalDataPoints}`);
    }
  }

  /**
   * 验证交易对和时间间隔
   */
  private validateSymbolAndInterval(symbol: string, interval: string): void {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol');
    }

    if (!interval || !this.supportedIntervals.includes(interval)) {
      throw new Error(`Invalid interval. Supported intervals: ${this.supportedIntervals.join(', ')}`);
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(query: MarketDataQuery): string {
    const parts = [query.symbol, query.interval];
    if (query.startTime) parts.push(`start:${query.startTime}`);
    if (query.endTime) parts.push(`end:${query.endTime}`);
    if (query.limit) parts.push(`limit:${query.limit}`);
    return parts.join('_');
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache(key: string): KlineData[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.config.cache.ttl * 1000;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存
   */
  private setCache(key: string, data: KlineData[]): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.config.cache.maxSize) {
      // 删除最旧的缓存项
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * 从数据库获取数据
   */
  private async getFromDatabase(query: MarketDataQuery): Promise<KlineData[]> {
    return this.klineDataRepository.findByQuery({
      symbol: query.symbol,
      interval: query.interval,
      startTime: query.startTime,
      endTime: query.endTime,
      limit: query.limit,
    });
  }

  /**
   * 获取API中缺失的数据
   */
  private async getMissingDataFromApi(
    query: MarketDataQuery,
    existingData: KlineData[]
  ): Promise<KlineData[]> {
    // 如果没有现有数据，直接从API获取
    if (!existingData || existingData.length === 0) {
      return this.binanceApiService.getHistoricalKlines(
        query.symbol,
        query.interval,
        query.startTime,
        query.endTime,
        query.limit
      );
    }

    // 找出时间间隙并填补
    const missingData: KlineData[] = [];
    
    // 简化实现：如果查询有时间范围，检查是否需要更多数据
    if (query.startTime || query.endTime) {
      const sortedData = existingData.sort((a, b) => a.openTime - b.openTime);
      const firstTime = sortedData[0]?.openTime;
      const lastTime = sortedData[sortedData.length - 1]?.openTime;

      // 获取开始时间之前的数据
      if (query.startTime && firstTime && query.startTime < firstTime) {
        const beforeData = await this.binanceApiService.getHistoricalKlines(
          query.symbol,
          query.interval,
          query.startTime,
          firstTime - 1,
          1000
        );
        missingData.push(...beforeData);
      }

      // 获取结束时间之后的数据
      if (query.endTime && lastTime && query.endTime > lastTime) {
        const afterData = await this.binanceApiService.getHistoricalKlines(
          query.symbol,
          query.interval,
          lastTime + 1,
          query.endTime,
          1000
        );
        missingData.push(...afterData);
      }
    }

    return missingData;
  }

  /**
   * 合并K线数据
   */
  private mergeKlineData(dbData: KlineData[], apiData: KlineData[]): KlineData[] {
    const safeDbData = dbData || [];
    const safeApiData = apiData || [];
    const allData = [...safeDbData, ...safeApiData];
    
    // 去重并排序
    const uniqueData = allData.reduce((acc, current) => {
      const key = `${current.symbol}_${current.interval}_${current.openTime}`;
      if (!acc.has(key)) {
        acc.set(key, current);
      }
      return acc;
    }, new Map<string, KlineData>());

    return Array.from(uniqueData.values()).sort((a, b) => a.openTime - b.openTime);
  }

  /**
   * 保存数据到数据库
   */
  private async saveToDatabase(data: KlineData[]): Promise<void> {
    if (data.length === 0) return;

    try {
      await this.klineDataRepository.insertMany(data);
      this.logger.debug(`Saved ${data.length} kline data points to database`);
    } catch (error) {
      this.logger.error('Failed to save kline data to database:', error);
      // 不抛出错误，因为这不应该影响数据返回
    }
  }

  /**
   * 用实时数据更新缓存
   */
  private updateCacheWithRealTimeData(klineData: KlineData): void {
    if (!this.config.cache.enabled) return;

    // 更新相关的缓存项
    for (const [key, cached] of this.cache.entries()) {
      if (key.includes(`${klineData.symbol}_${klineData.interval}`)) {
        const data = cached.data;
        const existingIndex = data.findIndex(
          item => item.openTime === klineData.openTime
        );

        if (existingIndex >= 0) {
          // 更新现有数据
          data[existingIndex] = klineData;
        } else {
          // 添加新数据并保持排序
          data.push(klineData);
          data.sort((a, b) => a.openTime - b.openTime);
        }

        cached.timestamp = Date.now(); // 更新缓存时间戳
      }
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.config.cache.ttl * 1000) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.cache.clear();
    this.removeAllListeners();
  }
}