import { registerAs } from '@nestjs/config';

export default registerAs('binance', () => ({
  apiKey: process.env.BINANCE_API_KEY,
  secretKey: process.env.BINANCE_SECRET_KEY,
  baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  wsBaseUrl: process.env.BINANCE_WS_BASE_URL || 'wss://stream.binance.com:9443',
  testnet: process.env.BINANCE_TESTNET === 'true',
  timeout: parseInt(process.env.BINANCE_TIMEOUT || '10000'),
  retryAttempts: parseInt(process.env.BINANCE_RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.BINANCE_RETRY_DELAY || '1000'),
}));