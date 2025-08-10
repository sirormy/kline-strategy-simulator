import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Spot } from '@binance/connector';
import { KlineData } from '../schemas/kline-data.schema';

export interface BinanceKlineResponse {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
  ignore: string;
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  baseAssetPrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  quoteAssetPrecision: number;
  orderTypes: string[];
  icebergAllowed: boolean;
  ocoAllowed: boolean;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  filters: any[];
  permissions: string[];
}

export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  rateLimits: any[];
  exchangeFilters: any[];
  symbols: BinanceSymbolInfo[];
}

@Injectable()
export class BinanceApiService implements OnModuleInit {
  private readonly logger = new Logger(BinanceApiService.name);
  private client: Spot;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(private readonly configService: ConfigService) {
    const binanceConfig = this.configService.get('binance');
    
    this.client = new Spot(
      binanceConfig.apiKey,
      binanceConfig.secretKey,
      {
        baseURL: binanceConfig.baseUrl,
        timeout: binanceConfig.timeout,
      }
    );

    this.retryAttempts = binanceConfig.retryAttempts;
    this.retryDelay = binanceConfig.retryDelay;
  }

  onModuleInit() {
    this.logger.log('Binance API Service initialized');
  }

  /**
   * 获取历史K线数据
   * @param symbol 交易对符号
   * @param interval 时间间隔
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @param limit 限制数量
   */
  async getHistoricalKlines(
    symbol: string,
    interval: string,
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<KlineData[]> {
    const operation = async () => {
      this.logger.debug(`Fetching historical klines for ${symbol} ${interval}`);
      
      const params: any = {
        symbol: symbol.toUpperCase(),
        interval,
      };

      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      if (limit) params.limit = Math.min(limit, 1000); // Binance限制最大1000

      const response = await this.client.klines(params);
      return this.transformKlineData(response.data, symbol, interval);
    };

    return this.executeWithRetry(operation, `getHistoricalKlines ${symbol} ${interval}`);
  }

  /**
   * 获取交易对信息
   */
  async getExchangeInfo(): Promise<BinanceExchangeInfo> {
    const operation = async () => {
      this.logger.debug('Fetching exchange info');
      const response = await this.client.exchangeInfo();
      return response.data;
    };

    return this.executeWithRetry(operation, 'getExchangeInfo');
  }

  /**
   * 获取指定交易对信息
   * @param symbol 交易对符号
   */
  async getSymbolInfo(symbol: string): Promise<BinanceSymbolInfo | null> {
    const exchangeInfo = await this.getExchangeInfo();
    return exchangeInfo.symbols.find(s => s.symbol === symbol.toUpperCase()) || null;
  }

  /**
   * 获取所有支持的交易对
   */
  async getSupportedSymbols(): Promise<string[]> {
    const exchangeInfo = await this.getExchangeInfo();
    return exchangeInfo.symbols
      .filter(symbol => symbol.status === 'TRADING' && symbol.isSpotTradingAllowed)
      .map(symbol => symbol.symbol);
  }

  /**
   * 获取24小时价格变动统计
   * @param symbol 交易对符号，可选
   */
  async get24hrTicker(symbol?: string): Promise<any> {
    const operation = async () => {
      this.logger.debug(`Fetching 24hr ticker${symbol ? ` for ${symbol}` : ''}`);
      
      const params = symbol ? { symbol: symbol.toUpperCase() } : {};
      const response = await this.client.ticker24hr(params);
      return response.data;
    };

    return this.executeWithRetry(operation, `get24hrTicker${symbol ? ` ${symbol}` : ''}`);
  }

  /**
   * 获取最新价格
   * @param symbol 交易对符号，可选
   */
  async getTickerPrice(symbol?: string): Promise<any> {
    const operation = async () => {
      this.logger.debug(`Fetching ticker price${symbol ? ` for ${symbol}` : ''}`);
      
      const params = symbol ? { symbol: symbol.toUpperCase() } : {};
      const response = await this.client.tickerPrice(params);
      return response.data;
    };

    return this.executeWithRetry(operation, `getTickerPrice${symbol ? ` ${symbol}` : ''}`);
  }

  /**
   * 检查服务器连接状态
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      this.logger.error('Binance API ping failed:', error);
      return false;
    }
  }

  /**
   * 获取服务器时间
   */
  async getServerTime(): Promise<number> {
    const operation = async () => {
      const response = await this.client.time();
      return response.data.serverTime;
    };

    return this.executeWithRetry(operation, 'getServerTime');
  }

  /**
   * 转换Binance K线数据格式
   */
  private transformKlineData(
    rawData: BinanceKlineResponse[],
    symbol: string,
    interval: string
  ): KlineData[] {
    return rawData.map(kline => ({
      symbol: symbol.toUpperCase(),
      interval,
      openTime: kline.openTime,
      closeTime: kline.closeTime,
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
      quoteVolume: parseFloat(kline.quoteAssetVolume),
      trades: kline.numberOfTrades,
      takerBuyBaseVolume: parseFloat(kline.takerBuyBaseAssetVolume),
      takerBuyQuoteVolume: parseFloat(kline.takerBuyQuoteAssetVolume),
    }));
  }

  /**
   * 带重试机制的操作执行
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn(
          `${operationName} failed on attempt ${attempt}/${this.retryAttempts}: ${error.message}`
        );

        // 检查是否是可重试的错误
        if (!this.isRetryableError(error)) {
          throw error;
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // 指数退避
          this.logger.debug(`Retrying ${operationName} in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`${operationName} failed after ${this.retryAttempts} attempts`);
    throw lastError;
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    // 网络错误或临时服务器错误可重试
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP 5xx 错误可重试
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Binance API 限流错误可重试
    if (error.response && error.response.status === 429) {
      return true;
    }

    // Binance API 特定错误码
    if (error.response && error.response.data) {
      const errorCode = error.response.data.code;
      // -1003: TOO_MANY_REQUESTS
      // -1021: TIMESTAMP_OUTSIDE_RECV_WINDOW
      if (errorCode === -1003 || errorCode === -1021) {
        return true;
      }
    }

    return false;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}