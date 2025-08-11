import { Injectable, Logger } from '@nestjs/common';
import { StrategyRegistry } from './strategy-registry';
import { IndicatorRegistry } from './indicator-registry';
import { StrategyImplementation } from './base-strategy';
import { IndicatorImplementation } from './base-indicator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';
import { VM } from 'vm2';

// 插件信息接口
export interface PluginInfo {
  name: string;
  path: string;
  version: string;
  author: string;
  description: string;
  loadedAt: Date;
  strategies?: string[];
  indicators?: string[];
  hash: string; // 插件文件哈希
  permissions: PluginPermissions;
  trusted: boolean;
  sandboxed: boolean;
  executionStats: {
    loadTime: number;
    memoryUsage: number;
    lastExecutionTime: number;
  };
}

// 插件导出接口
export interface PluginExports {
  strategies?: { [key: string]: StrategyImplementation };
  indicators?: { [key: string]: any }; // 将在后续任务中定义指标接口
  metadata?: {
    name: string;
    version: string;
    author: string;
    description: string;
  };
}

// 插件安全策略
export interface SecurityPolicy {
  allowFileSystemAccess: boolean;
  allowNetworkAccess: boolean;
  allowNativeModules: boolean;
  allowedModules: string[];
  blockedModules: string[];
  maxExecutionTime: number; // 毫秒
  maxMemoryUsage: number; // 字节
  enableSandbox: boolean;
  trustedPlugins: string[]; // 受信任的插件路径或哈希
}

// 插件权限
export interface PluginPermissions {
  canAccessFileSystem: boolean;
  canAccessNetwork: boolean;
  canUseNativeModules: boolean;
  allowedAPIs: string[];
  maxExecutionTime: number;
  maxMemoryUsage: number;
}

// 插件加载配置
export interface PluginLoaderConfig {
  pluginDirectories: string[];
  enableHotReload: boolean;
  allowedFileExtensions: string[];
  securityPolicy: SecurityPolicy;
  defaultPermissions: PluginPermissions;
}

@Injectable()
export class PluginLoader {
  private readonly logger = new Logger(PluginLoader.name);
  private readonly loadedPlugins = new Map<string, PluginInfo>();
  private readonly moduleCache = new Map<string, any>();
  private readonly sandboxes = new Map<string, any>(); // VM>();
  private readonly pluginHashes = new Map<string, string>();
  private watchers: any[] = []; // FSWatcher[] = [];
  private config: PluginLoaderConfig;

  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly indicatorRegistry?: IndicatorRegistry
  ) {
    this.config = this.getDefaultConfig();
  }

  /**
   * 初始化插件加载器
   */
  async initialize(config?: Partial<PluginLoaderConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.logger.log('Initializing plugin loader...');

    // 确保插件目录存在
    for (const dir of this.config.pluginDirectories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        this.logger.log(`Created plugin directory: ${dir}`);
      }
    }

    // 加载所有插件
    await this.loadAllPlugins();

    // 启用热重载
    if (this.config.enableHotReload) {
      this.setupHotReload();
    }

    this.logger.log(`Plugin loader initialized with ${this.loadedPlugins.size} plugins`);
  }

  /**
   * 加载所有插件目录中的插件
   */
  async loadAllPlugins(): Promise<void> {
    for (const directory of this.config.pluginDirectories) {
      await this.loadPluginsFromDirectory(directory);
    }
  }

  /**
   * 从指定目录加载插件
   */
  async loadPluginsFromDirectory(directory: string): Promise<void> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isFile() && this.isPluginFile(entry.name)) {
          await this.loadPlugin(fullPath);
        } else if (entry.isDirectory()) {
          // 递归加载子目录
          await this.loadPluginsFromDirectory(fullPath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load plugins from directory ${directory}:`, error);
    }
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(pluginPath: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Loading plugin: ${pluginPath}`);

      // 计算插件文件哈希
      const pluginHash = await this.calculateFileHash(pluginPath);
      const isTrusted = this.isPluginTrusted(pluginPath, pluginHash);

      // 检查安全策略
      if (!this.checkSecurityPolicy(pluginPath)) {
        this.logger.warn(`Plugin ${pluginPath} blocked by security policy`);
        return false;
      }

      // 确定插件权限
      const permissions = this.determinePluginPermissions(pluginPath, isTrusted);

      // 清除模块缓存以支持热重载
      this.clearModuleCache(pluginPath);

      // 动态导入插件（使用沙箱或直接导入）
      const pluginModule = await this.importPluginSecurely(pluginPath, permissions);
      const pluginExports = pluginModule as PluginExports;

      // 验证插件导出
      if (!this.validatePluginExports(pluginExports)) {
        this.logger.error(`Invalid plugin exports in ${pluginPath}`);
        return false;
      }

      // 注册策略
      const registeredStrategies: string[] = [];
      if (pluginExports.strategies) {
        for (const [type, strategyClass] of Object.entries(pluginExports.strategies)) {
          try {
            this.strategyRegistry.register(type, strategyClass);
            registeredStrategies.push(type);
            this.logger.debug(`Registered strategy: ${type}`);
          } catch (error) {
            this.logger.error(`Failed to register strategy ${type}:`, error);
          }
        }
      }

      // 注册指标（如果有指标注册器）
      const registeredIndicators: string[] = [];
      if (pluginExports.indicators && this.indicatorRegistry) {
        for (const [type, indicatorClass] of Object.entries(pluginExports.indicators)) {
          try {
            this.indicatorRegistry.register(type, indicatorClass);
            registeredIndicators.push(type);
            this.logger.debug(`Registered indicator: ${type}`);
          } catch (error) {
            this.logger.error(`Failed to register indicator ${type}:`, error);
          }
        }
      }

      const loadTime = Date.now() - startTime;

      // 创建插件信息
      const pluginInfo: PluginInfo = {
        name: pluginExports.metadata?.name || path.basename(pluginPath, path.extname(pluginPath)),
        path: pluginPath,
        version: pluginExports.metadata?.version || '1.0.0',
        author: pluginExports.metadata?.author || 'Unknown',
        description: pluginExports.metadata?.description || 'No description',
        loadedAt: new Date(),
        strategies: registeredStrategies,
        indicators: registeredIndicators,
        hash: pluginHash,
        permissions,
        trusted: isTrusted,
        sandboxed: permissions.canAccessFileSystem === false || permissions.canAccessNetwork === false,
        executionStats: {
          loadTime,
          memoryUsage: process.memoryUsage().heapUsed,
          lastExecutionTime: loadTime,
        },
      };

      this.loadedPlugins.set(pluginPath, pluginInfo);
      this.pluginHashes.set(pluginPath, pluginHash);
      
      this.logger.log(`Plugin loaded successfully: ${pluginInfo.name} v${pluginInfo.version} (${isTrusted ? 'trusted' : 'sandboxed'})`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginPath}:`, error);
      return false;
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginPath: string): Promise<boolean> {
    const pluginInfo = this.loadedPlugins.get(pluginPath);
    if (!pluginInfo) {
      this.logger.warn(`Plugin not found: ${pluginPath}`);
      return false;
    }

    try {
      // 取消注册策略
      if (pluginInfo.strategies) {
        for (const strategyType of pluginInfo.strategies) {
          this.strategyRegistry.unregister(strategyType);
          this.logger.debug(`Unregistered strategy: ${strategyType}`);
        }
      }

      // 取消注册指标
      if (pluginInfo.indicators && this.indicatorRegistry) {
        for (const indicatorType of pluginInfo.indicators) {
          this.indicatorRegistry.unregister(indicatorType);
          this.logger.debug(`Unregistered indicator: ${indicatorType}`);
        }
      }

      // 销毁沙箱
      const sandbox = this.sandboxes.get(pluginPath);
      if (sandbox) {
        // VM2 沙箱会自动清理
        this.sandboxes.delete(pluginPath);
      }

      // 清除模块缓存
      this.clearModuleCache(pluginPath);

      // 移除插件信息
      this.loadedPlugins.delete(pluginPath);
      this.pluginHashes.delete(pluginPath);

      this.logger.log(`Plugin unloaded: ${pluginInfo.name}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginPath}:`, error);
      return false;
    }
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(pluginPath: string): Promise<boolean> {
    this.logger.debug(`Reloading plugin: ${pluginPath}`);
    
    await this.unloadPlugin(pluginPath);
    return await this.loadPlugin(pluginPath);
  }

  /**
   * 获取已加载的插件列表
   */
  getLoadedPlugins(): PluginInfo[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * 获取插件信息
   */
  getPluginInfo(pluginPath: string): PluginInfo | null {
    return this.loadedPlugins.get(pluginPath) || null;
  }

  /**
   * 获取插件统计信息
   */
  getStats(): {
    totalPlugins: number;
    totalStrategies: number;
    totalIndicators: number;
    pluginsByAuthor: { [author: string]: number };
  } {
    const plugins = this.getLoadedPlugins();
    const pluginsByAuthor: { [author: string]: number } = {};

    let totalStrategies = 0;
    let totalIndicators = 0;

    plugins.forEach(plugin => {
      pluginsByAuthor[plugin.author] = (pluginsByAuthor[plugin.author] || 0) + 1;
      totalStrategies += plugin.strategies?.length || 0;
      totalIndicators += plugin.indicators?.length || 0;
    });

    return {
      totalPlugins: plugins.length,
      totalStrategies,
      totalIndicators,
      pluginsByAuthor,
    };
  }

  /**
   * 销毁插件加载器
   */
  async destroy(): Promise<void> {
    this.logger.log('Destroying plugin loader...');

    // 停止文件监听
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];

    // 卸载所有插件
    const pluginPaths = Array.from(this.loadedPlugins.keys());
    for (const pluginPath of pluginPaths) {
      await this.unloadPlugin(pluginPath);
    }

    // 清除缓存
    this.moduleCache.clear();

    this.logger.log('Plugin loader destroyed');
  }

  /**
   * 设置热重载
   */
  private setupHotReload(): void {
    this.logger.log('Setting up hot reload...');

    for (const directory of this.config.pluginDirectories) {
      const watcher = watch(directory, {
        ignored: /node_modules/,
        persistent: true,
        ignoreInitial: true,
      });

      watcher
        .on('add', (filePath) => {
          if (this.isPluginFile(filePath)) {
            this.logger.debug(`New plugin file detected: ${filePath}`);
            this.loadPlugin(filePath);
          }
        })
        .on('change', (filePath) => {
          if (this.isPluginFile(filePath)) {
            this.logger.debug(`Plugin file changed: ${filePath}`);
            this.reloadPlugin(filePath);
          }
        })
        .on('unlink', (filePath) => {
          if (this.isPluginFile(filePath)) {
            this.logger.debug(`Plugin file removed: ${filePath}`);
            this.unloadPlugin(filePath);
          }
        });

      this.watchers.push(watcher);
    }
  }

  /**
   * 检查是否为插件文件
   */
  private isPluginFile(filename: string): boolean {
    return this.config.allowedFileExtensions.some(ext => 
      filename.endsWith(ext) && filename.includes('.plugin.')
    );
  }

  /**
   * 安全地导入插件
   */
  private async importPluginSecurely(pluginPath: string, permissions: PluginPermissions): Promise<any> {
    const absolutePath = path.resolve(pluginPath);
    
    if (pluginPath.endsWith('.ts')) {
      throw new Error('TypeScript plugin files are not supported in runtime. Please compile to JavaScript first.');
    }

    // 如果插件受信任且不需要沙箱，直接导入
    if (permissions.canAccessFileSystem && permissions.canAccessNetwork && permissions.canUseNativeModules) {
      return await import(absolutePath);
    }

    // 使用沙箱导入
    return await this.importPluginInSandbox(absolutePath, permissions);
  }

  /**
   * 在沙箱中导入插件
   */
  private async importPluginInSandbox(pluginPath: string, permissions: PluginPermissions): Promise<any> {
    try {
      // 读取插件文件内容
      const pluginCode = await fs.readFile(pluginPath, 'utf8');

      // 创建沙箱环境
      const sandbox = this.createSandbox(permissions);
      this.sandboxes.set(pluginPath, sandbox);

      // 在沙箱中执行插件代码
      const result = sandbox.run(`
        const module = { exports: {} };
        const exports = module.exports;
        const require = this.require;
        const console = this.console;
        const process = this.process;
        
        ${pluginCode}
        
        module.exports;
      `);

      return result;
    } catch (error) {
      this.logger.error(`Failed to import plugin in sandbox: ${pluginPath}`, error);
      throw error;
    }
  }

  /**
   * 创建安全沙箱
   */
  private createSandbox(permissions: PluginPermissions): VM {
    const allowedModules = this.config.securityPolicy.allowedModules;
    const blockedModules = this.config.securityPolicy.blockedModules;

    const sandbox = new VM({
      timeout: permissions.maxExecutionTime,
      sandbox: {
        console: {
          log: (...args: any[]) => this.logger.debug('[Plugin]', ...args),
          error: (...args: any[]) => this.logger.error('[Plugin]', ...args),
          warn: (...args: any[]) => this.logger.warn('[Plugin]', ...args),
          info: (...args: any[]) => this.logger.log('[Plugin]', ...args),
        },
        process: {
          env: {}, // 空环境变量
          version: process.version,
          platform: process.platform,
        },
        require: (moduleName: string) => {
          // 检查模块是否被阻止
          if (blockedModules.includes(moduleName)) {
            throw new Error(`Module '${moduleName}' is blocked by security policy`);
          }

          // 检查模块是否在允许列表中
          if (allowedModules.length > 0 && !allowedModules.includes(moduleName)) {
            throw new Error(`Module '${moduleName}' is not in allowed modules list`);
          }

          // 阻止文件系统访问
          if (!permissions.canAccessFileSystem && ['fs', 'path', 'os'].includes(moduleName)) {
            throw new Error(`File system access denied for module '${moduleName}'`);
          }

          // 阻止网络访问
          if (!permissions.canAccessNetwork && ['http', 'https', 'net', 'dgram'].includes(moduleName)) {
            throw new Error(`Network access denied for module '${moduleName}'`);
          }

          // 阻止原生模块
          if (!permissions.canUseNativeModules && this.isNativeModule(moduleName)) {
            throw new Error(`Native module access denied for '${moduleName}'`);
          }

          return require(moduleName);
        },
      },
    });

    return sandbox;
  }

  /**
   * 检查是否为原生模块
   */
  private isNativeModule(moduleName: string): boolean {
    const nativeModules = [
      'child_process', 'cluster', 'crypto', 'dns', 'domain', 'events',
      'fs', 'http', 'https', 'net', 'os', 'path', 'querystring', 'readline',
      'repl', 'stream', 'string_decoder', 'tls', 'tty', 'dgram', 'url',
      'util', 'v8', 'vm', 'zlib', 'buffer', 'timers', 'console'
    ];
    return nativeModules.includes(moduleName);
  }

  /**
   * 计算文件哈希
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      this.logger.error(`Failed to calculate hash for ${filePath}:`, error);
      return '';
    }
  }

  /**
   * 检查插件是否受信任
   */
  private isPluginTrusted(pluginPath: string, pluginHash: string): boolean {
    const trustedPlugins = this.config.securityPolicy.trustedPlugins;
    
    // 检查路径是否在受信任列表中
    if (trustedPlugins.includes(pluginPath)) {
      return true;
    }

    // 检查哈希是否在受信任列表中
    if (trustedPlugins.includes(pluginHash)) {
      return true;
    }

    return false;
  }

  /**
   * 确定插件权限
   */
  private determinePluginPermissions(pluginPath: string, isTrusted: boolean): PluginPermissions {
    if (isTrusted) {
      // 受信任的插件获得完整权限
      return {
        canAccessFileSystem: true,
        canAccessNetwork: true,
        canUseNativeModules: true,
        allowedAPIs: ['*'],
        maxExecutionTime: 30000, // 30秒
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      };
    }

    // 不受信任的插件使用默认权限
    return { ...this.config.defaultPermissions };
  }

  /**
   * 清除模块缓存
   */
  private clearModuleCache(pluginPath: string): void {
    const absolutePath = path.resolve(pluginPath);
    
    // 清除Node.js模块缓存
    delete require.cache[absolutePath];
    
    // 清除内部缓存
    this.moduleCache.delete(absolutePath);
  }

  /**
   * 验证插件导出
   */
  private validatePluginExports(exports: PluginExports): boolean {
    if (!exports || typeof exports !== 'object') {
      return false;
    }

    // 至少要有策略或指标导出
    if (!exports.strategies && !exports.indicators) {
      return false;
    }

    // 验证策略导出
    if (exports.strategies) {
      if (typeof exports.strategies !== 'object') {
        return false;
      }

      for (const [type, strategyClass] of Object.entries(exports.strategies)) {
        if (typeof strategyClass !== 'function') {
          this.logger.error(`Strategy '${type}' is not a constructor function`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 检查安全策略
   */
  private checkSecurityPolicy(pluginPath: string): boolean {
    // 基本的安全检查
    const normalizedPath = path.normalize(pluginPath);
    
    // 防止路径遍历攻击
    if (normalizedPath.includes('..')) {
      this.logger.warn(`Path traversal attempt detected: ${pluginPath}`);
      return false;
    }

    // 检查文件是否在允许的目录中
    const isInAllowedDirectory = this.config.pluginDirectories.some(dir => 
      normalizedPath.startsWith(path.resolve(dir))
    );

    if (!isInAllowedDirectory) {
      this.logger.warn(`Plugin outside allowed directories: ${pluginPath}`);
      return false;
    }

    // 检查文件扩展名
    const ext = path.extname(pluginPath);
    if (!this.config.allowedFileExtensions.includes(ext)) {
      this.logger.warn(`Plugin file extension not allowed: ${ext}`);
      return false;
    }

    // 检查文件大小（防止过大的插件文件）
    try {
      const stats = require('fs').statSync(pluginPath);
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (stats.size > maxSize) {
        this.logger.warn(`Plugin file too large: ${stats.size} bytes`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to check plugin file stats: ${pluginPath}`, error);
      return false;
    }

    return true;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): PluginLoaderConfig {
    return {
      pluginDirectories: [
        path.join(process.cwd(), 'plugins'),
        path.join(process.cwd(), 'src', 'plugins'),
      ],
      enableHotReload: process.env.NODE_ENV === 'development',
      allowedFileExtensions: ['.js', '.mjs'],
      securityPolicy: {
        allowFileSystemAccess: false,
        allowNetworkAccess: false,
        allowNativeModules: false,
        allowedModules: [
          // 基础模块
          'util', 'events', 'buffer', 'string_decoder',
          // 数学和加密（安全的）
          'crypto',
          // 插件开发需要的模块
          '../src/extensions/base-strategy',
          '../src/extensions/base-indicator',
        ],
        blockedModules: [
          'child_process', 'cluster', 'fs', 'net', 'http', 'https',
          'dgram', 'dns', 'os', 'repl', 'vm', 'v8'
        ],
        maxExecutionTime: 5000, // 5秒
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        enableSandbox: true,
        trustedPlugins: [], // 默认没有受信任的插件
      },
      defaultPermissions: {
        canAccessFileSystem: false,
        canAccessNetwork: false,
        canUseNativeModules: false,
        allowedAPIs: ['console', 'Math', 'Date', 'JSON'],
        maxExecutionTime: 5000, // 5秒
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      },
    };
  }

  /**
   * 添加受信任的插件
   */
  addTrustedPlugin(pluginPathOrHash: string): void {
    if (!this.config.securityPolicy.trustedPlugins.includes(pluginPathOrHash)) {
      this.config.securityPolicy.trustedPlugins.push(pluginPathOrHash);
      this.logger.log(`Added trusted plugin: ${pluginPathOrHash}`);
    }
  }

  /**
   * 移除受信任的插件
   */
  removeTrustedPlugin(pluginPathOrHash: string): void {
    const index = this.config.securityPolicy.trustedPlugins.indexOf(pluginPathOrHash);
    if (index > -1) {
      this.config.securityPolicy.trustedPlugins.splice(index, 1);
      this.logger.log(`Removed trusted plugin: ${pluginPathOrHash}`);
    }
  }

  /**
   * 获取插件安全报告
   */
  getSecurityReport(): {
    totalPlugins: number;
    trustedPlugins: number;
    sandboxedPlugins: number;
    securityViolations: Array<{
      plugin: string;
      violation: string;
      timestamp: Date;
    }>;
  } {
    const plugins = this.getLoadedPlugins();
    const trustedCount = plugins.filter(p => p.trusted).length;
    const sandboxedCount = plugins.filter(p => p.sandboxed).length;

    return {
      totalPlugins: plugins.length,
      trustedPlugins: trustedCount,
      sandboxedPlugins: sandboxedCount,
      securityViolations: [], // 可以在后续版本中实现违规记录
    };
  }

  /**
   * 验证插件完整性
   */
  async validatePluginIntegrity(pluginPath: string): Promise<boolean> {
    const pluginInfo = this.loadedPlugins.get(pluginPath);
    if (!pluginInfo) {
      return false;
    }

    try {
      const currentHash = await this.calculateFileHash(pluginPath);
      return currentHash === pluginInfo.hash;
    } catch (error) {
      this.logger.error(`Failed to validate plugin integrity: ${pluginPath}`, error);
      return false;
    }
  }
}