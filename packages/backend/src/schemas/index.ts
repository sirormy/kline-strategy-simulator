// Export all schemas and types
export * from './account.schema';
export * from './kline-data.schema';
export * from './strategy.schema';

// Export position schema with renamed MarginType
export { 
  Position, 
  PositionDocument, 
  PositionSchema, 
  PositionSide,
  MarginType as PositionMarginType 
} from './position.schema';

// Export trade order schema with renamed MarginType
export { 
  TradeOrder, 
  TradeOrderDocument, 
  TradeOrderSchema, 
  OrderSide, 
  OrderType, 
  OrderStatus,
  MarginType as OrderMarginType 
} from './trade-order.schema';