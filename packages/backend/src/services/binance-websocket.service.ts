import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsocketStream } from '@binance/connector';
import { EventEmitter } from 'events';
import { KlineData } from '../schemas/kline-data.schema';

export interface BinanceWsKlineData {
  e: string;      // Event type
  E: number;      // Event time
  s: string;      // Symbol
  k: {
    t: number;    // Kline start time
    T: number;    // Kline close time
    s: string;    // Symbol
    i: string;    // Interval
    f: number;    // First trade ID
    L: number;    // Last trade ID
    o: string;    // Open price
    c: string;    // Close price
    h: string;    // High price
    l: string;    // Low price
    v: string;    // Base asset volume
    n: number;    // Number of trades
    x: boolean;   // Is this kline closed?
    q: string;    // Quote asset volume
    V: string;    // Taker buy base asset volume
    Q: string;    // Taker buy quote asset volume
    B: string;    // Ignore
  };
}

export interface StreamSubscription {
  symbol: string;
  interval: string;
  streamName: string;
  isActive: boolean;
}

@Injectable()
export class BinanceWebSocketService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(BinanceWebSocketService.name);
  private wsClient: WebsocketStream;
  private subscriptions = new Map<string, StreamSubscription>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000;
  private reconnectTimer?: NodeJS.Timeout;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    super();
    this.initializeWebSocket();
  }

  onModuleDestroy() {
    this.cleanup();
  }

  /**
   * 初始化WebSocket连接
   */
  private initializeWebSocket(): void {
    const binanceConfig = this.configService.get('binance');
    
    this.wsClient = new WebsocketStream({
      baseURL: binanceConfig.wsBaseUrl,
      callbacks: {
        open: () => this.handleOpen(),
        close: () => this.handleClose(),
        message: (data: string) => this.handleMessage(data),
        error: (error: Error) => this.handleError(error),
      },
    });
  }

  /**
   * 订阅K线数据流
   * @param symbol 交易对符号
   * @param interval 时间间隔
   */
  subscribeKlineStream(symbol: string, interval: string): void {
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const subscriptionKey = `${symbol}_${interval}`;

    if (this.subscriptions.has(subscriptionKey)) {
      this.logger.warn(`Already subscribed to ${streamName}`);
      return;
    }

    this.logger.log(`Subscribing to kline stream: ${streamName}`);

    try {
      this.wsClient.kline(symbol, interval);
      
      this.subscriptions.set(subscriptionKey, {
        symbol: symbol.toUpperCase(),
        interval,
        streamName,
        isActive: true,
      });

      this.logger.log(`Successfully subscribed to ${streamName}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to ${streamName}:`, error);
      throw error;
    }
  }

  /**
   * 取消订阅K线数据流
   * @param symbol 交易对符号
   * @param interval 时间间隔
   */
  unsubscribeKlineStream(symbol: string, interval: string): void {
    const subscriptionKey = `${symbol}_${interval}`;
    const subscription = this.subscriptions.get(subscriptionKey);

    if (!subscription) {
      this.logger.warn(`No active subscription found for ${symbol} ${interval}`);
      return;
    }

    this.logger.log(`Unsubscribing from kline stream: ${subscription.streamName}`);

    try {
      // 注意：@binance/connector 的 WebsocketStream 没有直接的取消订阅方法
      // 需要关闭整个连接或使用组合流的方式
      subscription.isActive = false;
      this.subscriptions.delete(subscriptionKey);
      
      this.logger.log(`Successfully unsubscribed from ${subscription.streamName}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from ${subscription.streamName}:`, error);
      throw error;
    }
  }

  /**
   * 订阅多个K线数据流
   * @param streams 流配置数组
   */
  subscribeMultipleStreams(streams: Array<{ symbol: string; interval: string }>): void {
    streams.forEach(({ symbol, interval }) => {
      this.subscribeKlineStream(symbol, interval);
    });
  }

  /**
   * 获取所有活跃订阅
   */
  getActiveSubscriptions(): StreamSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  /**
   * 检查是否已订阅指定流
   */
  isSubscribed(symbol: string, interval: string): boolean {
    const subscriptionKey = `${symbol}_${interval}`;
    const subscription = this.subscriptions.get(subscriptionKey);
    return subscription?.isActive || false;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * 手动重连
   */
  reconnect(): void {
    this.logger.log('Manual reconnection requested');
    this.cleanup();
    this.initializeWebSocket();
    this.resubscribeAll();
  }

  /**
   * 处理WebSocket连接打开
   */
  private handleOpen(): void {
    this.logger.log('WebSocket connection opened');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.emit('connected');
  }

  /**
   * 处理WebSocket连接关闭
   */
  private handleClose(): void {
    this.logger.warn('WebSocket connection closed');
    this.isConnected = false;
    this.emit('disconnected');
    
    // 自动重连
    this.attemptReconnect();
  }

  /**
   * 处理WebSocket消息
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as BinanceWsKlineData;
      
      if (message.e === 'kline') {
        const klineData = this.transformWebSocketKlineData(message);
        const subscriptionKey = `${message.s}_${message.k.i}`;
        const subscription = this.subscriptions.get(subscriptionKey);
        
        if (subscription && subscription.isActive) {
          this.emit('klineData', klineData);
          this.emit(`klineData:${message.s}:${message.k.i}`, klineData);
        }
      }
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * 处理WebSocket错误
   */
  private handleError(error: Error): void {
    this.logger.error('WebSocket error:', error);
    this.emit('error', error);
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));
    
    this.logger.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.initializeWebSocket();
      this.resubscribeAll();
    }, delay);
  }

  /**
   * 重新订阅所有流
   */
  private resubscribeAll(): void {
    const activeSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.isActive);

    if (activeSubscriptions.length > 0) {
      this.logger.log(`Resubscribing to ${activeSubscriptions.length} streams`);
      
      activeSubscriptions.forEach(subscription => {
        try {
          this.wsClient.kline(subscription.symbol, subscription.interval);
        } catch (error) {
          this.logger.error(`Failed to resubscribe to ${subscription.streamName}:`, error);
        }
      });
    }
  }

  /**
   * 转换WebSocket K线数据格式
   */
  private transformWebSocketKlineData(wsData: BinanceWsKlineData): KlineData {
    const kline = wsData.k;
    
    return {
      symbol: kline.s,
      interval: kline.i,
      openTime: kline.t,
      closeTime: kline.T,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v),
      quoteVolume: parseFloat(kline.q),
      trades: kline.n,
      takerBuyBaseVolume: parseFloat(kline.V),
      takerBuyQuoteVolume: parseFloat(kline.Q),
      isClosed: kline.x, // 是否为完整的K线
    };
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.wsClient) {
      try {
        this.wsClient.disconnect();
      } catch (error) {
        this.logger.error('Error during WebSocket cleanup:', error);
      }
    }

    this.isConnected = false;
    this.subscriptions.clear();
  }
}