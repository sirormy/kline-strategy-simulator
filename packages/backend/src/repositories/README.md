# Data Access Layer (Repository Pattern)

This directory contains the implementation of the Repository pattern for data access in the K-line Strategy Simulator backend. The repositories provide a clean abstraction layer over MongoDB operations and include advanced querying, pagination, and data management features.

## Architecture Overview

The data access layer follows the Repository pattern with the following structure:

```
repositories/
├── base.repository.ts          # Base repository with common CRUD operations
├── account.repository.ts       # Account management operations
├── kline-data.repository.ts    # K-line data operations
├── position.repository.ts      # Trading position operations
├── strategy.repository.ts      # Strategy configuration operations
├── trade-order.repository.ts   # Trade order operations
├── index.ts                    # Exports all repositories
└── __tests__/                  # Integration tests
```

## Base Repository

The `BaseRepository` class provides common CRUD operations that all specific repositories inherit:

### Core Operations
- `create(data)` - Create a single document
- `createMany(data[])` - Create multiple documents
- `findById(id)` - Find by document ID
- `findOne(filter)` - Find single document by filter
- `find(filter)` - Find multiple documents
- `update(id, data)` - Update by ID
- `updateOne(filter, data)` - Update single document by filter
- `updateMany(filter, data)` - Update multiple documents
- `delete(id)` - Delete by ID
- `deleteOne(filter)` - Delete single document
- `deleteMany(filter)` - Delete multiple documents

### Advanced Features
- **Pagination**: `findWithPagination(filter, options)`
- **Aggregation**: `aggregate(pipeline)`
- **Bulk Operations**: `bulkWrite(operations)`
- **Index Management**: `createIndex(index, options)`
- **Statistics**: `count(filter)`, `exists(filter)`, `getStats()`

## Repository Implementations

### AccountRepository

Manages user accounts, balances, and equity calculations.

**Key Features:**
- Balance management with asset-specific operations
- Equity calculation with real-time price updates
- Account statistics and performance tracking
- Risk management and margin calculations

**Example Usage:**
```typescript
// Update account balance
await accountRepository.updateAccountBalance('account-1', 'USDT', -100, 50);

// Calculate total equity
await accountRepository.calculateAndUpdateTotalEquity('account-1', { BTC: 50000, ETH: 3000 });

// Get account statistics
const stats = await accountRepository.getAccountOverviewStats();
```

### KlineDataRepository

Handles K-line (candlestick) data storage and retrieval with time-series optimizations.

**Key Features:**
- Time-range queries with efficient indexing
- Bulk upsert operations for data synchronization
- Data integrity validation and gap detection
- Symbol and interval-based filtering
- Statistical analysis and data completeness checks

**Example Usage:**
```typescript
// Query K-line data by time range
const klines = await klineDataRepository.findBySymbolAndInterval(
  'BTCUSDT', '1h', startTime, endTime, 1000
);

// Bulk insert/update K-line data
await klineDataRepository.bulkUpsert(klineDataArray);

// Check for missing data
const missingTimes = await klineDataRepository.findMissingKlines(
  'BTCUSDT', '1h', startTime, endTime, 3600000
);
```

### TradeOrderRepository

Manages trading orders with status tracking and execution history.

**Key Features:**
- Order lifecycle management (pending → filled/cancelled/rejected)
- Account and symbol-based filtering
- Trading statistics and performance metrics
- Batch operations for order processing
- Expiration handling for pending orders

**Example Usage:**
```typescript
// Update order status
await tradeOrderRepository.updateOrderStatus(
  'order-1', OrderStatus.FILLED, 0.1, 50000, 5, 'USDT'
);

// Get trading statistics
const stats = await tradeOrderRepository.getAccountTradingStats('account-1');

// Cancel expired orders
await tradeOrderRepository.cancelExpiredOrders(Date.now() - 86400000);
```

### PositionRepository

Handles trading positions with PnL calculations and risk management.

**Key Features:**
- Position lifecycle management (open → closed)
- Real-time PnL calculations (realized and unrealized)
- Margin and leverage management
- Position statistics and performance tracking
- Commission and funding fee tracking

**Example Usage:**
```typescript
// Update position mark price and PnL
await positionRepository.updateMarkPriceAndPnl('position-1', 51000, 100);

// Close position
await positionRepository.closePosition('position-1', 51000, Date.now());

// Get position statistics
const stats = await positionRepository.getAccountPositionStats('account-1');
```

### StrategyRepository

Manages trading strategies with configuration and performance tracking.

**Key Features:**
- Strategy configuration management
- Performance statistics and backtesting results
- Parameter validation and metadata handling
- Strategy type and symbol-based filtering
- Batch operations for strategy management

**Example Usage:**
```typescript
// Update strategy statistics
await strategyRepository.incrementStrategyStats('strategy-1', { pnl: 50, isWin: true });

// Get strategy performance ranking
const ranking = await strategyRepository.getStrategyPerformanceRanking('account-1', 10);

// Find strategies by symbol
const strategies = await strategyRepository.findStrategiesBySymbol('BTCUSDT');
```

## Data Validation and Integrity

All repositories implement comprehensive data validation:

### Schema-Level Validation
- MongoDB schema validation with Mongoose
- Type checking and constraint validation
- Business logic validation in pre-save hooks

### Repository-Level Validation
- Parameter validation using class-validator
- Business rule enforcement
- Data consistency checks

### Example Validation Rules
```typescript
// Price data validation
if (high < low) {
  throw new Error('High price cannot be lower than low price');
}

// Balance validation
if (balance.free < 0) {
  throw new Error('Balance cannot be negative');
}

// Leverage validation
if (leverage < 1 || leverage > 125) {
  throw new Error('Leverage must be between 1 and 125');
}
```

## Indexing Strategy

Optimized indexes for query performance:

### KlineData Indexes
```typescript
{ symbol: 1, interval: 1, openTime: 1 }    // Unique compound index
{ symbol: 1, interval: 1, openTime: -1 }   // Reverse time queries
{ openTime: 1 }                            // Time-based queries
```

### TradeOrder Indexes
```typescript
{ accountId: 1, timestamp: -1 }            // Account order history
{ symbol: 1, timestamp: -1 }               // Symbol-based queries
{ status: 1, timestamp: -1 }               // Status filtering
```

### Position Indexes
```typescript
{ accountId: 1, symbol: 1 }                // Unique active positions
{ accountId: 1, openTime: -1 }             // Account position history
{ isClosed: 1, closeTime: -1 }             // Closed position queries
```

## Pagination and Performance

All repositories support efficient pagination:

```typescript
interface PaginationOptions {
  page: number;
  limit: number;
  sort?: { [key: string]: 1 | -1 };
}

interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**Performance Optimizations:**
- Cursor-based pagination for large datasets
- Index-optimized sorting
- Aggregation pipeline optimization
- Connection pooling and query caching

## Error Handling

Comprehensive error handling with specific error types:

```typescript
// Insufficient balance error
if (balance.free < required) {
  throw new BadRequestException('Insufficient balance');
}

// Data integrity error
if (position.size <= 0) {
  throw new BadRequestException('Position size must be positive');
}

// Validation error
if (!validateSymbol(symbol)) {
  throw new BadRequestException('Invalid symbol format');
}
```

## Testing

Comprehensive test coverage with integration tests:

- **Unit Tests**: Individual repository method testing
- **Integration Tests**: Cross-repository operations
- **Performance Tests**: Query optimization validation
- **Data Integrity Tests**: Validation rule testing

Run tests:
```bash
npm test repositories
```

## Usage Examples

### Complete Trading Flow
```typescript
// 1. Create account
const account = await accountRepository.create({
  accountId: 'trader-1',
  name: 'Trader Account',
  balances: [{ asset: 'USDT', free: 10000, locked: 0 }],
  // ... other fields
});

// 2. Create strategy
const strategy = await strategyRepository.create({
  accountId: 'trader-1',
  name: 'DCA Strategy',
  type: 'DCA',
  parameters: { investmentAmount: 100, frequency: 'daily' },
  symbols: ['BTCUSDT'],
  timeframe: '1h',
  enabled: true,
});

// 3. Place order
const order = await tradeOrderRepository.create({
  accountId: 'trader-1',
  symbol: 'BTCUSDT',
  side: OrderSide.BUY,
  type: OrderType.MARKET,
  quantity: 0.002,
  timestamp: Date.now(),
});

// 4. Create position
const position = await positionRepository.create({
  accountId: 'trader-1',
  symbol: 'BTCUSDT',
  side: PositionSide.LONG,
  size: 0.002,
  entryPrice: 50000,
  leverage: 1,
  margin: 100,
  // ... other fields
});

// 5. Update account balance
await accountRepository.updateAccountBalance('trader-1', 'USDT', -100);
```

## Best Practices

1. **Always use transactions** for multi-document operations
2. **Validate input data** before database operations
3. **Use pagination** for large result sets
4. **Implement proper error handling** with specific error types
5. **Monitor query performance** and optimize indexes
6. **Use bulk operations** for batch processing
7. **Implement data cleanup** for expired records
8. **Test data integrity** regularly

## Configuration

Repository configuration through environment variables:

```env
MONGODB_URI=mongodb://localhost:27017/kline_simulator
MONGODB_MAX_POOL_SIZE=10
MONGODB_TIMEOUT=30000
```

## Monitoring and Maintenance

Regular maintenance tasks:

- **Index optimization**: Monitor and update indexes based on query patterns
- **Data cleanup**: Remove expired orders and old closed positions
- **Performance monitoring**: Track query execution times
- **Data integrity checks**: Validate data consistency
- **Backup and recovery**: Regular database backups

For more detailed information, refer to the individual repository files and their comprehensive JSDoc documentation.