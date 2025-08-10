import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { MarketDataService, MarketDataQuery } from '../services/market-data.service';

export class GetKlinesQueryDto {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export class SubscribeStreamDto {
  symbol: string;
  interval: string;
}

@Controller('api/market-data')
export class MarketDataController {
  private readonly logger = new Logger(MarketDataController.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  /**
   * 获取历史K线数据
   */
  @Get('klines')
  async getKlines(@Query() query: GetKlinesQueryDto) {
    try {
      const marketDataQuery: MarketDataQuery = {
        symbol: query.symbol?.toUpperCase(),
        interval: query.interval,
        startTime: query.startTime ? Number(query.startTime) : undefined,
        endTime: query.endTime ? Number(query.endTime) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      };

      const data = await this.marketDataService.getHistoricalKlines(marketDataQuery);
      
      return {
        success: true,
        data,
        count: data.length,
      };
    } catch (error) {
      this.logger.error('Failed to get klines:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get klines',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * 获取支持的交易对
   */
  @Get('symbols')
  async getSupportedSymbols() {
    try {
      const symbols = await this.marketDataService.getSupportedSymbols();
      
      return {
        success: true,
        data: symbols,
        count: symbols.length,
      };
    } catch (error) {
      this.logger.error('Failed to get supported symbols:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get supported symbols',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 获取支持的时间间隔
   */
  @Get('intervals')
  getSupportedIntervals() {
    const intervals = this.marketDataService.getSupportedIntervals();
    
    return {
      success: true,
      data: intervals,
      count: intervals.length,
    };
  }

  /**
   * 获取交易对信息
   */
  @Get('symbol/:symbol')
  async getSymbolInfo(@Param('symbol') symbol: string) {
    try {
      const symbolInfo = await this.marketDataService.getSymbolInfo(symbol.toUpperCase());
      
      if (!symbolInfo) {
        throw new HttpException(
          {
            success: false,
            message: 'Symbol not found',
          },
          HttpStatus.NOT_FOUND
        );
      }

      return {
        success: true,
        data: symbolInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get symbol info for ${symbol}:`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get symbol info',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 获取24小时价格统计
   */
  @Get('ticker/24hr')
  async get24hrTicker(@Query('symbol') symbol?: string) {
    try {
      const ticker = await this.marketDataService.get24hrTicker(
        symbol ? symbol.toUpperCase() : undefined
      );
      
      return {
        success: true,
        data: ticker,
      };
    } catch (error) {
      this.logger.error('Failed to get 24hr ticker:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get 24hr ticker',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 获取最新价格
   */
  @Get('ticker/price')
  async getTickerPrice(@Query('symbol') symbol?: string) {
    try {
      const price = await this.marketDataService.getTickerPrice(
        symbol ? symbol.toUpperCase() : undefined
      );
      
      return {
        success: true,
        data: price,
      };
    } catch (error) {
      this.logger.error('Failed to get ticker price:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get ticker price',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 订阅实时K线数据流
   */
  @Post('stream/subscribe')
  subscribeKlineStream(@Body() body: SubscribeStreamDto) {
    try {
      this.marketDataService.subscribeKlineStream(
        body.symbol.toUpperCase(),
        body.interval
      );
      
      return {
        success: true,
        message: `Subscribed to ${body.symbol.toUpperCase()} ${body.interval} kline stream`,
      };
    } catch (error) {
      this.logger.error('Failed to subscribe to kline stream:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to subscribe to kline stream',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * 取消订阅实时K线数据流
   */
  @Delete('stream/unsubscribe')
  unsubscribeKlineStream(@Body() body: SubscribeStreamDto) {
    try {
      this.marketDataService.unsubscribeKlineStream(
        body.symbol.toUpperCase(),
        body.interval
      );
      
      return {
        success: true,
        message: `Unsubscribed from ${body.symbol.toUpperCase()} ${body.interval} kline stream`,
      };
    } catch (error) {
      this.logger.error('Failed to unsubscribe from kline stream:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to unsubscribe from kline stream',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * 获取活跃的订阅列表
   */
  @Get('stream/subscriptions')
  getActiveSubscriptions() {
    // 通过WebSocket服务获取活跃订阅
    const subscriptions = this.marketDataService['binanceWebSocketService'].getActiveSubscriptions();
    
    return {
      success: true,
      data: subscriptions,
      count: subscriptions.length,
    };
  }

  /**
   * 获取服务健康状态
   */
  @Get('health')
  async getHealthStatus() {
    try {
      const health = await this.marketDataService.getHealthStatus();
      
      return {
        success: true,
        data: health,
      };
    } catch (error) {
      this.logger.error('Failed to get health status:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get health status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 获取缓存统计
   */
  @Get('cache/stats')
  getCacheStats() {
    const stats = this.marketDataService.getCacheStats();
    
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * 清理缓存
   */
  @Delete('cache')
  clearCache() {
    this.marketDataService.clearCache();
    
    return {
      success: true,
      message: 'Cache cleared successfully',
    };
  }
}