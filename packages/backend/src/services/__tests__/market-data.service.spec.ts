import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MarketDataService } from '../market-data.service';
import { BinanceApiService } from '../binance-api.service';
import { BinanceWebSocketService } from '../binance-websocket.service';
import { KlineDataRepository } from '../../repositories/kline-data.repository';
import { KlineData, KlineDataDocument } from '../../schemas/kline-data.schema';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let binanceApiService: jest.Mocked<BinanceApiService>;
  let binanceWebSocketService: jest.Mocked<BinanceWebSocketService>;
  let klineDataRepository: jest.Mocked<KlineDataRepository>;
  let configService: jest.Mocked<ConfigService>;

  const mockKlineData: KlineData[] = [
    {
      symbol: 'BTCUSDT',
      interval: '1h',
      openTime: 1640995200000,
      closeTime: 1640998799999,
      open: 47000,
      high: 47500,
      low: 46800,
      close: 47200,
      volume: 100.5,
      quoteVolume: 4740000,
      trades: 1500,
      takerBuyBaseVolume: 60.3,
      takerBuyQuoteVolume: 2844000,
    },
    {
      symbol: 'BTCUSDT',
      interval: '1h',
      openTime: 1640998800000,
      closeTime: 1641002399999,
      open: 47200,
      high: 47800,
      low: 47000,
      close: 47600,
      volume: 120.8,
      quoteVolume: 5750000,
      trades: 1800,
      takerBuyBaseVolume: 72.5,
      takerBuyQuoteVolume: 3450000,
    },
  ];

  const mockKlineDocuments = mockKlineData as any as KlineDataDocument[];

  beforeEach(async () => {
    const mockBinanceApiService = {
      getHistoricalKlines: jest.fn(),
      getSupportedSymbols: jest.fn(),
      getSymbolInfo: jest.fn(),
      get24hrTicker: jest.fn(),
      getTickerPrice: jest.fn(),
      ping: jest.fn(),
    };

    const mockBinanceWebSocketService = {
      subscribeKlineStream: jest.fn(),
      unsubscribeKlineStream: jest.fn(),
      isSubscribed: jest.fn(),
      getConnectionStatus: jest.fn(),
      getActiveSubscriptions: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };

    const mockKlineDataRepository = {
      findByQuery: jest.fn(),
      insertMany: jest.fn(),
      upsert: jest.fn(),
      findBySymbolAndInterval: jest.fn(),
      createMany: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        { provide: BinanceApiService, useValue: mockBinanceApiService },
        { provide: BinanceWebSocketService, useValue: mockBinanceWebSocketService },
        { provide: KlineDataRepository, useValue: mockKlineDataRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
    binanceApiService = module.get(BinanceApiService);
    binanceWebSocketService = module.get(BinanceWebSocketService);
    klineDataRepository = module.get(KlineDataRepository);
    configService = module.get(ConfigService);

    // 设置默认配置
    configService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        'MARKET_DATA_CACHE_ENABLED': 'true',
        'MARKET_DATA_CACHE_TTL': '300',
        'MARKET_DATA_CACHE_MAX_SIZE': '1000',
        'REAL_TIME_DATA_ENABLED': 'true',
        'PERSIST_REAL_TIME_DATA': 'true',
        'MAX_HISTORICAL_DATA_POINTS': '10000',
      };
      return config[key] || defaultValue;
    });

    // 初始化服务
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearCache();
  });

  describe('getHistoricalKlines', () => {
    beforeEach(() => {
      // 重置配置以启用缓存
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'MARKET_DATA_CACHE_ENABLED': 'true',
          'MARKET_DATA_CACHE_TTL': '300',
          'MARKET_DATA_CACHE_MAX_SIZE': '1000',
          'REAL_TIME_DATA_ENABLED': 'true',
          'PERSIST_REAL_TIME_DATA': 'true',
          'MAX_HISTORICAL_DATA_POINTS': '10000',
        };
        return config[key] || defaultValue;
      });

      // 重新创建服务实例
      service = new MarketDataService(
        configService,
        binanceApiService,
        binanceWebSocketService,
        klineDataRepository
      );
    });

    it('should return cached data when available', async () => {
      // 先设置缓存
      const query = { symbol: 'BTCUSDT', interval: '1h' };

      // 模拟数据库返回空数据
      klineDataRepository.findByQuery.mockResolvedValue([]);
      // 模拟API返回数据
      binanceApiService.getHistoricalKlines.mockResolvedValue(mockKlineData);
      klineDataRepository.insertMany.mockResolvedValue(undefined);

      // 第一次调用，应该从API获取并缓存
      const result1 = await service.getHistoricalKlines(query);
      expect(result1).toEqual(mockKlineData);
      expect(binanceApiService.getHistoricalKlines).toHaveBeenCalledTimes(1);

      // 第二次调用，应该从缓存获取
      const result2 = await service.getHistoricalKlines(query);
      expect(result2).toEqual(mockKlineData);
      expect(binanceApiService.getHistoricalKlines).toHaveBeenCalledTimes(1); // 没有再次调用API
    });

    it('should fetch from database first, then API for missing data', async () => {
      const query = { symbol: 'BTCUSDT', interval: '1h', startTime: 1640995200000, endTime: 1641002399999 };
      const dbData = [mockKlineDocuments[0]]; // 数据库只有第一条数据
      const apiData = [mockKlineData[1]]; // API返回第二条数据

      klineDataRepository.findByQuery.mockResolvedValue(dbData);
      binanceApiService.getHistoricalKlines.mockResolvedValue(apiData);
      klineDataRepository.insertMany.mockResolvedValue(undefined);

      const result = await service.getHistoricalKlines(query, false); // 不使用缓存

      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(mockKlineData));
      expect(klineDataRepository.findByQuery).toHaveBeenCalledWith(query);
      expect(klineDataRepository.insertMany).toHaveBeenCalledWith(apiData);
    });

    it('should validate query parameters', async () => {
      // 设置默认的mock返回值
      klineDataRepository.findByQuery.mockResolvedValue([]);
      binanceApiService.getHistoricalKlines.mockResolvedValue([]);
      klineDataRepository.insertMany.mockResolvedValue(undefined);

      await expect(
        service.getHistoricalKlines({ symbol: '', interval: '1h' })
      ).rejects.toThrow('Invalid symbol');

      await expect(
        service.getHistoricalKlines({ symbol: 'BTCUSDT', interval: 'invalid' })
      ).rejects.toThrow('Invalid interval');

      await expect(
        service.getHistoricalKlines({ symbol: 'BTCUSDT', interval: '1h', limit: 0 })
      ).rejects.toThrow('Invalid limit');
    });

    it('should handle API errors gracefully', async () => {
      const query = { symbol: 'BTCUSDT', interval: '1h' };
      const error = new Error('API Error');

      klineDataRepository.findByQuery.mockResolvedValue([]);
      binanceApiService.getHistoricalKlines.mockRejectedValue(error);

      await expect(service.getHistoricalKlines(query, false)).rejects.toThrow('API Error');
    });
  });

  describe('subscribeKlineStream', () => {
    beforeEach(() => {
      // 确保实时数据启用
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'MARKET_DATA_CACHE_ENABLED': 'true',
          'MARKET_DATA_CACHE_TTL': '300',
          'MARKET_DATA_CACHE_MAX_SIZE': '1000',
          'REAL_TIME_DATA_ENABLED': 'true',
          'PERSIST_REAL_TIME_DATA': 'true',
          'MAX_HISTORICAL_DATA_POINTS': '10000',
        };
        return config[key] || defaultValue;
      });

      // 重新创建服务实例
      service = new MarketDataService(
        configService,
        binanceApiService,
        binanceWebSocketService,
        klineDataRepository
      );
    });

    it('should subscribe to kline stream successfully', () => {
      binanceWebSocketService.isSubscribed.mockReturnValue(false);

      service.subscribeKlineStream('BTCUSDT', '1h');

      expect(binanceWebSocketService.subscribeKlineStream).toHaveBeenCalledWith('BTCUSDT', '1h');
    });

    it('should not subscribe if already subscribed', () => {
      binanceWebSocketService.isSubscribed.mockReturnValue(true);

      service.subscribeKlineStream('BTCUSDT', '1h');

      expect(binanceWebSocketService.subscribeKlineStream).not.toHaveBeenCalled();
    });

    it('should validate symbol and interval', () => {
      expect(() => service.subscribeKlineStream('', '1h')).toThrow('Invalid symbol');
      expect(() => service.subscribeKlineStream('BTCUSDT', 'invalid')).toThrow('Invalid interval');
    });

    it('should throw error when real-time data is disabled', () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REAL_TIME_DATA_ENABLED') return 'false';
        const config = {
          'MARKET_DATA_CACHE_ENABLED': 'true',
          'MARKET_DATA_CACHE_TTL': '300',
          'MARKET_DATA_CACHE_MAX_SIZE': '1000',
          'PERSIST_REAL_TIME_DATA': 'true',
          'MAX_HISTORICAL_DATA_POINTS': '10000',
        };
        return config[key] || defaultValue;
      });

      // 重新创建服务实例以应用新配置
      const newService = new MarketDataService(
        configService,
        binanceApiService,
        binanceWebSocketService,
        klineDataRepository
      );

      expect(() => newService.subscribeKlineStream('BTCUSDT', '1h')).toThrow('Real-time data is disabled');
    });
  });

  describe('unsubscribeKlineStream', () => {
    it('should unsubscribe from kline stream', () => {
      service.unsubscribeKlineStream('BTCUSDT', '1h');

      expect(binanceWebSocketService.unsubscribeKlineStream).toHaveBeenCalledWith('BTCUSDT', '1h');
    });
  });

  describe('getSupportedSymbols', () => {
    beforeEach(() => {
      // 确保缓存启用
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'MARKET_DATA_CACHE_ENABLED': 'true',
          'MARKET_DATA_CACHE_TTL': '300',
          'MARKET_DATA_CACHE_MAX_SIZE': '1000',
          'REAL_TIME_DATA_ENABLED': 'true',
          'PERSIST_REAL_TIME_DATA': 'true',
          'MAX_HISTORICAL_DATA_POINTS': '10000',
        };
        return config[key] || defaultValue;
      });

      // 重新创建服务实例
      service = new MarketDataService(
        configService,
        binanceApiService,
        binanceWebSocketService,
        klineDataRepository
      );
    });

    it('should return supported symbols from API', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];
      binanceApiService.getSupportedSymbols.mockResolvedValue(symbols);

      const result = await service.getSupportedSymbols();

      expect(result).toEqual(symbols);
      expect(binanceApiService.getSupportedSymbols).toHaveBeenCalled();
    });

    it('should cache supported symbols', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      binanceApiService.getSupportedSymbols.mockResolvedValue(symbols);

      // 第一次调用
      const result1 = await service.getSupportedSymbols();
      expect(result1).toEqual(symbols);

      // 第二次调用应该使用缓存
      const result2 = await service.getSupportedSymbols();
      expect(result2).toEqual(symbols);
      expect(binanceApiService.getSupportedSymbols).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSupportedIntervals', () => {
    it('should return supported intervals', () => {
      const intervals = service.getSupportedIntervals();

      expect(intervals).toContain('1m');
      expect(intervals).toContain('1h');
      expect(intervals).toContain('1d');
      expect(intervals.length).toBeGreaterThan(0);
    });
  });

  describe('getSymbolInfo', () => {
    it('should return symbol info from API', async () => {
      const symbolInfo = { symbol: 'BTCUSDT', status: 'TRADING' };
      binanceApiService.getSymbolInfo.mockResolvedValue(symbolInfo as any);

      const result = await service.getSymbolInfo('BTCUSDT');

      expect(result).toEqual(symbolInfo);
      expect(binanceApiService.getSymbolInfo).toHaveBeenCalledWith('BTCUSDT');
    });
  });

  describe('get24hrTicker', () => {
    it('should return 24hr ticker data', async () => {
      const tickerData = { symbol: 'BTCUSDT', priceChange: '1000' };
      binanceApiService.get24hrTicker.mockResolvedValue(tickerData);

      const result = await service.get24hrTicker('BTCUSDT');

      expect(result).toEqual(tickerData);
      expect(binanceApiService.get24hrTicker).toHaveBeenCalledWith('BTCUSDT');
    });
  });

  describe('getTickerPrice', () => {
    it('should return ticker price', async () => {
      const priceData = { symbol: 'BTCUSDT', price: '47000' };
      binanceApiService.getTickerPrice.mockResolvedValue(priceData);

      const result = await service.getTickerPrice('BTCUSDT');

      expect(result).toEqual(priceData);
      expect(binanceApiService.getTickerPrice).toHaveBeenCalledWith('BTCUSDT');
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(() => {
      // 确保缓存启用
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'MARKET_DATA_CACHE_ENABLED': 'true',
          'MARKET_DATA_CACHE_TTL': '300',
          'MARKET_DATA_CACHE_MAX_SIZE': '1000',
          'REAL_TIME_DATA_ENABLED': 'true',
          'PERSIST_REAL_TIME_DATA': 'true',
          'MAX_HISTORICAL_DATA_POINTS': '10000',
        };
        return config[key] || defaultValue;
      });

      // 重新创建服务实例
      service = new MarketDataService(
        configService,
        binanceApiService,
        binanceWebSocketService,
        klineDataRepository
      );
    });

    it('should return health status', async () => {
      binanceApiService.ping.mockResolvedValue(true);
      binanceWebSocketService.getConnectionStatus.mockReturnValue(true);
      binanceWebSocketService.getActiveSubscriptions.mockReturnValue([]);

      const result = await service.getHealthStatus();

      expect(result).toEqual({
        api: true,
        websocket: true,
        cache: {
          enabled: true,
          size: 0,
          maxSize: 1000,
        },
        subscriptions: [],
      });
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      service.clearCache();
      // 验证缓存已清空（通过后续操作验证）
      expect(service.getCacheStats().size).toBe(0);
    });

    it('should return cache stats', () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('ttl');
    });
  });

  describe('real-time data handling', () => {
    it('should handle real-time kline data', async () => {
      const realTimeData = mockKlineData[0];

      // 模拟WebSocket事件
      const eventCallback = jest.fn();
      service.on('klineData', eventCallback);

      // 模拟接收到实时数据
      klineDataRepository.upsert.mockResolvedValue(undefined);

      // 手动触发事件（模拟WebSocket数据接收）
      service.emit('klineData', realTimeData);

      expect(eventCallback).toHaveBeenCalledWith(realTimeData);
    });
  });
});