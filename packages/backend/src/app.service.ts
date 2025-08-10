import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'K线策略模拟器后端服务正在运行！';
  }
}