import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import {
  AccountRepository,
  KlineDataRepository,
  PositionRepository,
  StrategyRepository,
  TradeOrderRepository,
} from '../index';

import { Account, AccountSchema } from '../../schemas/account.schema';
import { KlineData, KlineDataSchema } from '../../schemas/kline-data.schema';
import { Position, PositionSchema, PositionSide, MarginType } from '../../schemas/position.schema';
import { Strategy, StrategySchema } from '../../schemas/strategy.schema';
import { TradeOrder, TradeOrderSchema, OrderSide, OrderType, OrderStatus } from '../../schemas/trade-order.schema';

describe('Repositories Unit Tests', () => {
  let module: TestingModule;

  let accountRepository: AccountRepository;
  let klineDataRepository: KlineDataRepository;
  let positionRepository: PositionRepository;
  let strategyRepository: StrategyRepository;
  let tradeOrderRepository: TradeOrderRepository;

  beforeAll(async () => {
    // Skip actual database connection for unit tests
    // This would be replaced with proper test database setup in real environment
    console.log('Repository unit tests - database connection skipped for demo');
  });

  afterAll(async () => {
    console.log('Repository unit tests completed');
  });

  describe('AccountRepository', () => {
    it('should create and find account', async () => {
      const accountData = {
        accountId: 'test-account',
        name: 'Test Account',
        balances: [
          { asset: 'USDT', free: 1000, locked: 0 },
          { asset: 'BTC', free: 0.1, locked: 0 },
        ],
        totalEquity: 1000,
        availableMargin: 1000,
        usedMargin: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isActive: true,
      };

      const account = await accountRepository.create(accountData as any);
      expect(account).toBeDefined();
      expect(account.accountId).toBe('test-account');

      const foundAccount = await accountRepository.findByAccountId('test-account');
      expect(foundAccount).toBeDefined();
      expect(foundAccount!.name).toBe('Test Account');
    });

    it('should update account balance', async () => {
      const account = await accountRepository.create({
        accountId: 'test-account',
        name: 'Test Account',
        balances: [{ asset: 'USDT', free: 1000, locked: 0 }],
        totalEquity: 1000,
        availableMargin: 1000,
        usedMargin: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isActive: true,
      } as any);

      const updatedAccount = await accountRepository.updateAccountBalance(
        'test-account',
        'USDT',
        -100,
        50
      );

      expect(updatedAccount).toBeDefined();
      const balance = updatedAccount!.balances.find(b => b.asset === 'USDT');
      expect(balance!.free).toBe(900);
      expect(balance!.locked).toBe(50);
    });
  });

  describe('KlineDataRepository', () => {
    it('should create and query kline data', async () => {
      const klineData = {
        symbol: 'BTCUSDT',
        interval: '1h',
        openTime: 1640995200000,
        closeTime: 1640998800000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
        quoteVolume: 5000000,
        trades: 1000,
        takerBuyBaseVolume: 60,
        takerBuyQuoteVolume: 3000000,
      };

      const created = await klineDataRepository.create(klineData as any);
      expect(created).toBeDefined();

      const found = await klineDataRepository.findBySymbolAndInterval(
        'BTCUSDT',
        '1h',
        1640995200000,
        1640998800000
      );

      expect(found).toHaveLength(1);
      expect(found[0].symbol).toBe('BTCUSDT');
      expect(found[0].close).toBe(50500);
    });

    it('should handle bulk upsert', async () => {
      const klineDataArray = [
        {
          symbol: 'BTCUSDT',
          interval: '1h',
          openTime: 1640995200000,
          closeTime: 1640998800000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          quoteVolume: 5000000,
          trades: 1000,
          takerBuyBaseVolume: 60,
          takerBuyQuoteVolume: 3000000,
        },
        {
          symbol: 'BTCUSDT',
          interval: '1h',
          openTime: 1640998800000,
          closeTime: 1641002400000,
          open: 50500,
          high: 52000,
          low: 50000,
          close: 51500,
          volume: 120,
          quoteVolume: 6000000,
          trades: 1200,
          takerBuyBaseVolume: 70,
          takerBuyQuoteVolume: 3500000,
        },
      ];

      const result = await klineDataRepository.bulkUpsert(klineDataArray as any);
      expect(result).toBeDefined();

      const count = await klineDataRepository.count({ symbol: 'BTCUSDT' });
      expect(count).toBe(2);
    });
  });

  describe('TradeOrderRepository', () => {
    it('should create and query trade orders', async () => {
      const orderData = {
        id: 'order-1',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        timestamp: Date.now(),
        status: OrderStatus.PENDING,
      };

      const order = await tradeOrderRepository.create(orderData as any);
      expect(order).toBeDefined();

      const orders = await tradeOrderRepository.findByAccountId('test-account');
      expect(orders).toHaveLength(1);
      expect(orders[0].symbol).toBe('BTCUSDT');
    });

    it('should update order status', async () => {
      const order = await tradeOrderRepository.create({
        id: 'order-1',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        timestamp: Date.now(),
        status: OrderStatus.PENDING,
      } as any);

      const updated = await tradeOrderRepository.updateOrderStatus(
        order.id,
        OrderStatus.FILLED,
        0.1,
        50000,
        5,
        'USDT'
      );

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(OrderStatus.FILLED);
      expect(updated!.filledQuantity).toBe(0.1);
      expect(updated!.filledPrice).toBe(50000);
    });
  });

  describe('PositionRepository', () => {
    it('should create and manage positions', async () => {
      const positionData = {
        id: 'position-1',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        size: 0.1,
        entryPrice: 50000,
        markPrice: 50000,
        leverage: 1,
        margin: 5000,
        unrealizedPnl: 0,
        marginType: MarginType.CROSS,
        openTime: Date.now(),
        isClosed: false,
        totalCommission: 0,
        totalFundingFee: 0,
      };

      const position = await positionRepository.create(positionData as any);
      expect(position).toBeDefined();

      const positions = await positionRepository.findByAccountId('test-account');
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('BTCUSDT');
    });

    it('should close position', async () => {
      const position = await positionRepository.create({
        id: 'position-1',
        accountId: 'test-account',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        size: 0.1,
        entryPrice: 50000,
        markPrice: 50000,
        leverage: 1,
        margin: 5000,
        unrealizedPnl: 0,
        marginType: MarginType.CROSS,
        openTime: Date.now(),
        isClosed: false,
        totalCommission: 0,
        totalFundingFee: 0,
      } as any);

      const closed = await positionRepository.closePosition(
        position.id,
        51000,
        Date.now()
      );

      expect(closed).toBeDefined();
      expect(closed!.isClosed).toBe(true);
      expect(closed!.closePrice).toBe(51000);
      expect(closed!.realizedPnl).toBeGreaterThan(0);
    });
  });

  describe('StrategyRepository', () => {
    it('should create and manage strategies', async () => {
      const strategyData = {
        id: 'strategy-1',
        accountId: 'test-account',
        name: 'Test Strategy',
        type: 'DCA',
        version: '1.0.0',
        parameters: {
          investmentAmount: 100,
          frequency: 'daily',
        },
        symbols: ['BTCUSDT'],
        timeframe: '1h',
        enabled: true,
      };

      const strategy = await strategyRepository.create(strategyData as any);
      expect(strategy).toBeDefined();

      const strategies = await strategyRepository.findByAccountId('test-account');
      expect(strategies).toHaveLength(1);
      expect(strategies[0].name).toBe('Test Strategy');
    });

    it('should update strategy stats', async () => {
      const strategy = await strategyRepository.create({
        id: 'strategy-1',
        accountId: 'test-account',
        name: 'Test Strategy',
        type: 'DCA',
        version: '1.0.0',
        parameters: { investmentAmount: 100 },
        symbols: ['BTCUSDT'],
        timeframe: '1h',
        enabled: true,
      } as any);

      const updated = await strategyRepository.incrementStrategyStats(
        strategy.id,
        { pnl: 50, isWin: true }
      );

      expect(updated).toBeDefined();
      expect(updated!.state!.totalTrades).toBe(1);
      expect(updated!.state!.winningTrades).toBe(1);
      expect(updated!.state!.totalPnl).toBe(50);
    });
  });

  describe('Repository Integration', () => {
    it('should handle complex queries across repositories', async () => {
      // 创建账户
      const account = await accountRepository.create({
        accountId: 'integration-test',
        name: 'Integration Test Account',
        balances: [{ asset: 'USDT', free: 10000, locked: 0 }],
        totalEquity: 10000,
        availableMargin: 10000,
        usedMargin: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isActive: true,
      } as any);

      // 创建策略
      const strategy = await strategyRepository.create({
        id: 'integration-strategy',
        accountId: 'integration-test',
        name: 'Integration Strategy',
        type: 'TEST',
        version: '1.0.0',
        parameters: { testParam: 'value' },
        symbols: ['BTCUSDT'],
        timeframe: '1h',
        enabled: true,
      } as any);

      // 创建订单
      const order = await tradeOrderRepository.create({
        id: 'integration-order',
        accountId: 'integration-test',
        symbol: 'BTCUSDT',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: 0.1,
        timestamp: Date.now(),
        status: OrderStatus.FILLED,
        filledQuantity: 0.1,
        filledPrice: 50000,
      } as any);

      // 创建持仓
      const position = await positionRepository.create({
        id: 'integration-position',
        accountId: 'integration-test',
        symbol: 'BTCUSDT',
        side: PositionSide.LONG,
        size: 0.1,
        entryPrice: 50000,
        markPrice: 50000,
        leverage: 1,
        margin: 5000,
        unrealizedPnl: 0,
        marginType: MarginType.CROSS,
        openTime: Date.now(),
        isClosed: false,
        totalCommission: 0,
        totalFundingFee: 0,
      } as any);

      // 验证数据关联
      const accountOrders = await tradeOrderRepository.findByAccountId('integration-test');
      const accountPositions = await positionRepository.findByAccountId('integration-test');
      const accountStrategies = await strategyRepository.findByAccountId('integration-test');

      expect(accountOrders).toHaveLength(1);
      expect(accountPositions).toHaveLength(1);
      expect(accountStrategies).toHaveLength(1);

      // 验证统计功能
      const orderStats = await tradeOrderRepository.getAccountTradingStats('integration-test');
      expect(orderStats.totalOrders).toBe(1);
      expect(orderStats.filledOrders).toBe(1);

      const positionStats = await positionRepository.getAccountPositionStats('integration-test');
      expect(positionStats.totalPositions).toBe(1);
      expect(positionStats.activePositions).toBe(1);
    });
  });
});