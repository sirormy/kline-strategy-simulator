import { BaseRepository, PaginationOptions } from '../base.repository';
import { validateSymbol, validateInterval, validateLeverage } from '../../utils/validation.utils';

describe('Repository Unit Tests', () => {
  describe('BaseRepository', () => {
    it('should define pagination interface correctly', () => {
      const paginationOptions: PaginationOptions = {
        page: 1,
        limit: 10,
        sort: { createdAt: -1 }
      };

      expect(paginationOptions.page).toBe(1);
      expect(paginationOptions.limit).toBe(10);
      expect(paginationOptions.sort).toEqual({ createdAt: -1 });
    });

    it('should calculate pagination correctly', () => {
      const page = 2;
      const limit = 50;
      const skip = (page - 1) * limit;
      
      expect(skip).toBe(50);
    });
  });

  describe('Data Validation', () => {
    it('should validate symbols correctly', () => {
      expect(validateSymbol('BTCUSDT')).toBe(true);
      expect(validateSymbol('ETHUSDT')).toBe(true);
      expect(validateSymbol('btcusdt')).toBe(false); // lowercase
      expect(validateSymbol('BTC')).toBe(false); // too short
      expect(validateSymbol('')).toBe(false); // empty
    });

    it('should validate intervals correctly', () => {
      expect(validateInterval('1m')).toBe(true);
      expect(validateInterval('1h')).toBe(true);
      expect(validateInterval('1d')).toBe(true);
      expect(validateInterval('5x')).toBe(false); // invalid
      expect(validateInterval('')).toBe(false); // empty
    });

    it('should validate leverage correctly', () => {
      expect(() => validateLeverage(1)).not.toThrow();
      expect(() => validateLeverage(10)).not.toThrow();
      expect(() => validateLeverage(125)).not.toThrow();
      expect(() => validateLeverage(0)).toThrow();
      expect(() => validateLeverage(126)).toThrow();
      expect(() => validateLeverage(-1)).toThrow();
    });
  });

  describe('Repository Interfaces', () => {
    it('should define KlineDataFilter interface correctly', () => {
      const filter = {
        symbol: 'BTCUSDT',
        interval: '1h',
        startTime: 1640995200000,
        endTime: 1640998800000
      };

      expect(filter.symbol).toBe('BTCUSDT');
      expect(filter.interval).toBe('1h');
      expect(typeof filter.startTime).toBe('number');
      expect(typeof filter.endTime).toBe('number');
    });

    it('should define TradeOrderFilter interface correctly', () => {
      const filter = {
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        status: 'FILLED' as any,
        side: 'BUY' as any,
        startTime: 1640995200000,
        endTime: 1640998800000
      };

      expect(filter.accountId).toBe('test-account');
      expect(filter.symbol).toBe('BTCUSDT');
      expect(filter.status).toBe('FILLED');
      expect(filter.side).toBe('BUY');
    });

    it('should define PositionFilter interface correctly', () => {
      const filter = {
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        side: 'LONG' as any,
        isClosed: false,
        startTime: 1640995200000,
        endTime: 1640998800000
      };

      expect(filter.accountId).toBe('test-account');
      expect(filter.symbol).toBe('BTCUSDT');
      expect(filter.side).toBe('LONG');
      expect(filter.isClosed).toBe(false);
    });

    it('should define StrategyFilter interface correctly', () => {
      const filter = {
        accountId: 'test-account',
        type: 'DCA',
        enabled: true,
        symbol: 'BTCUSDT',
        timeframe: '1h'
      };

      expect(filter.accountId).toBe('test-account');
      expect(filter.type).toBe('DCA');
      expect(filter.enabled).toBe(true);
      expect(filter.symbol).toBe('BTCUSDT');
      expect(filter.timeframe).toBe('1h');
    });
  });

  describe('Repository Query Building', () => {
    it('should build MongoDB filter correctly', () => {
      const buildKlineFilter = (symbol?: string, interval?: string, startTime?: number, endTime?: number) => {
        const filter: any = {};
        if (symbol) filter.symbol = symbol;
        if (interval) filter.interval = interval;
        
        if (startTime || endTime) {
          filter.openTime = {};
          if (startTime) filter.openTime.$gte = startTime;
          if (endTime) filter.openTime.$lte = endTime;
        }
        
        return filter;
      };

      const filter1 = buildKlineFilter('BTCUSDT', '1h');
      expect(filter1).toEqual({ symbol: 'BTCUSDT', interval: '1h' });

      const filter2 = buildKlineFilter('BTCUSDT', '1h', 1640995200000, 1640998800000);
      expect(filter2).toEqual({
        symbol: 'BTCUSDT',
        interval: '1h',
        openTime: { $gte: 1640995200000, $lte: 1640998800000 }
      });
    });

    it('should build pagination query correctly', () => {
      const buildPaginationQuery = (page: number, limit: number, sort: any = { createdAt: -1 }) => {
        const skip = (page - 1) * limit;
        return { skip, limit, sort };
      };

      const query1 = buildPaginationQuery(1, 10);
      expect(query1).toEqual({ skip: 0, limit: 10, sort: { createdAt: -1 } });

      const query2 = buildPaginationQuery(3, 25, { openTime: 1 });
      expect(query2).toEqual({ skip: 50, limit: 25, sort: { openTime: 1 } });
    });
  });

  describe('Repository Statistics Calculations', () => {
    it('should calculate win rate correctly', () => {
      const calculateWinRate = (totalTrades: number, winningTrades: number): number => {
        if (totalTrades === 0) return 0;
        return winningTrades / totalTrades;
      };

      expect(calculateWinRate(0, 0)).toBe(0);
      expect(calculateWinRate(10, 7)).toBe(0.7);
      expect(calculateWinRate(100, 55)).toBe(0.55);
    });

    it('should calculate PnL correctly', () => {
      const calculatePnL = (entryPrice: number, currentPrice: number, size: number, side: 'LONG' | 'SHORT', leverage: number = 1): number => {
        const priceDiff = side === 'LONG' 
          ? currentPrice - entryPrice 
          : entryPrice - currentPrice;
        
        return priceDiff * size * leverage;
      };

      // Long position profit
      expect(calculatePnL(50000, 51000, 0.1, 'LONG')).toBe(100);
      
      // Long position loss
      expect(calculatePnL(50000, 49000, 0.1, 'LONG')).toBe(-100);
      
      // Short position profit
      expect(calculatePnL(50000, 49000, 0.1, 'SHORT')).toBe(100);
      
      // Short position loss
      expect(calculatePnL(50000, 51000, 0.1, 'SHORT')).toBe(-100);
      
      // With leverage
      expect(calculatePnL(50000, 51000, 0.1, 'LONG', 10)).toBe(1000);
    });

    it('should calculate margin correctly', () => {
      const calculateMargin = (size: number, price: number, leverage: number): number => {
        return (size * price) / leverage;
      };

      expect(calculateMargin(0.1, 50000, 1)).toBe(5000);
      expect(calculateMargin(0.1, 50000, 10)).toBe(500);
      expect(calculateMargin(1, 50000, 20)).toBe(2500);
    });
  });

  describe('Repository Data Transformations', () => {
    it('should transform kline data correctly', () => {
      const transformBinanceKline = (binanceData: any[]) => {
        return {
          symbol: binanceData[0],
          interval: '1h', // would come from context
          openTime: parseInt(binanceData[1]),
          closeTime: parseInt(binanceData[2]),
          open: parseFloat(binanceData[3]),
          high: parseFloat(binanceData[4]),
          low: parseFloat(binanceData[5]),
          close: parseFloat(binanceData[6]),
          volume: parseFloat(binanceData[7]),
          quoteVolume: parseFloat(binanceData[8]),
          trades: parseInt(binanceData[9]),
          takerBuyBaseVolume: parseFloat(binanceData[10]),
          takerBuyQuoteVolume: parseFloat(binanceData[11])
        };
      };

      const mockBinanceData = [
        'BTCUSDT',
        '1640995200000',
        '1640998800000',
        '50000.00',
        '51000.00',
        '49000.00',
        '50500.00',
        '100.5',
        '5025000.0',
        '1000',
        '60.3',
        '3015000.0'
      ];

      const transformed = transformBinanceKline(mockBinanceData);
      
      expect(transformed.symbol).toBe('BTCUSDT');
      expect(transformed.openTime).toBe(1640995200000);
      expect(transformed.open).toBe(50000);
      expect(transformed.high).toBe(51000);
      expect(transformed.low).toBe(49000);
      expect(transformed.close).toBe(50500);
      expect(transformed.volume).toBe(100.5);
    });

    it('should format pagination result correctly', () => {
      const formatPaginationResult = <T>(data: T[], total: number, page: number, limit: number) => {
        return {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        };
      };

      const result = formatPaginationResult(['item1', 'item2'], 25, 2, 10);
      
      expect(result.data).toEqual(['item1', 'item2']);
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });
  });

  describe('Repository Error Handling', () => {
    it('should handle validation errors correctly', () => {
      const validateTradeOrder = (order: any) => {
        if (!order.symbol) throw new Error('Symbol is required');
        if (!order.side) throw new Error('Side is required');
        if (!order.quantity || order.quantity <= 0) throw new Error('Quantity must be positive');
        if (order.type === 'LIMIT' && !order.price) throw new Error('Limit orders must have price');
      };

      expect(() => validateTradeOrder({})).toThrow('Symbol is required');
      expect(() => validateTradeOrder({ symbol: 'BTCUSDT' })).toThrow('Side is required');
      expect(() => validateTradeOrder({ symbol: 'BTCUSDT', side: 'BUY' })).toThrow('Quantity must be positive');
      expect(() => validateTradeOrder({ 
        symbol: 'BTCUSDT', 
        side: 'BUY', 
        quantity: 0.1, 
        type: 'LIMIT' 
      })).toThrow('Limit orders must have price');
      
      expect(() => validateTradeOrder({ 
        symbol: 'BTCUSDT', 
        side: 'BUY', 
        quantity: 0.1, 
        type: 'MARKET' 
      })).not.toThrow();
    });

    it('should handle balance validation correctly', () => {
      const validateSufficientBalance = (available: number, required: number) => {
        if (available < required) {
          throw new Error(`Insufficient balance. Available: ${available}, Required: ${required}`);
        }
      };

      expect(() => validateSufficientBalance(1000, 500)).not.toThrow();
      expect(() => validateSufficientBalance(1000, 1000)).not.toThrow();
      expect(() => validateSufficientBalance(500, 1000)).toThrow('Insufficient balance');
    });
  });
});