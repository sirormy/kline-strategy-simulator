import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  Query,
  HttpStatus,
  HttpException,
  Logger,
  UseGuards,
} from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PluginService } from '../services/plugin.service';
import { PluginInfo, PluginLoaderConfig } from '../extensions/plugin-loader';

// DTO类型定义
export interface PluginUploadDto {
  name: string;
  content: string; // Base64编码的插件内容
  trusted?: boolean;
}

export interface PluginConfigDto {
  pluginDirectories?: string[];
  enableHotReload?: boolean;
  allowedFileExtensions?: string[];
  securityPolicy?: {
    allowFileSystemAccess?: boolean;
    allowNetworkAccess?: boolean;
    allowNativeModules?: boolean;
    allowedModules?: string[];
    blockedModules?: string[];
    maxExecutionTime?: number;
    maxMemoryUsage?: number;
    enableSandbox?: boolean;
    trustedPlugins?: string[];
  };
}

export interface PluginStatsResponse {
  totalPlugins: number;
  totalStrategies: number;
  totalIndicators: number;
  pluginsByAuthor: { [author: string]: number };
  securityReport: {
    totalPlugins: number;
    trustedPlugins: number;
    sandboxedPlugins: number;
    securityViolations: Array<{
      plugin: string;
      violation: string;
      timestamp: Date;
    }>;
  };
}

@Controller('api/plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

  constructor(private readonly pluginService: PluginService) {}

  @Get()
  async getPlugins(
    @Query('category') category?: string,
    @Query('author') author?: string,
    @Query('trusted') trusted?: string,
  ): Promise<PluginInfo[]> {
    try {
      let plugins = await this.pluginService.getLoadedPlugins();

      // 应用筛选条件
      if (category) {
        plugins = plugins.filter(plugin => 
          plugin.strategies?.some(s => s.includes(category)) ||
          plugin.indicators?.some(i => i.includes(category))
        );
      }

      if (author) {
        plugins = plugins.filter(plugin => 
          plugin.author.toLowerCase().includes(author.toLowerCase())
        );
      }

      if (trusted !== undefined) {
        const isTrusted = trusted.toLowerCase() === 'true';
        plugins = plugins.filter(plugin => plugin.trusted === isTrusted);
      }

      return plugins;
    } catch (error) {
      this.logger.error('Failed to get plugins:', error);
      throw new HttpException(
        'Failed to retrieve plugins',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':pluginPath/info')
  async getPluginInfo(@Param('pluginPath') encodedPath: string): Promise<PluginInfo> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      const pluginInfo = await this.pluginService.getPluginInfo(pluginPath);
      
      if (!pluginInfo) {
        throw new HttpException('Plugin not found', HttpStatus.NOT_FOUND);
      }

      return pluginInfo;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to get plugin info:', error);
      throw new HttpException(
        'Failed to retrieve plugin information',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('load')
  async loadPlugin(@Body('pluginPath') pluginPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const success = await this.pluginService.loadPlugin(pluginPath);
      
      if (success) {
        return {
          success: true,
          message: `Plugin loaded successfully: ${pluginPath}`,
        };
      } else {
        throw new HttpException('Failed to load plugin', HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      this.logger.error('Failed to load plugin:', error);
      throw new HttpException(
        `Failed to load plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('upload')
  async uploadPlugin(@Body() uploadDto: PluginUploadDto): Promise<{ success: boolean; pluginPath: string; message: string }> {
    try {
      const result = await this.pluginService.uploadPlugin(
        uploadDto.name,
        uploadDto.content,
        uploadDto.trusted || false,
      );

      return {
        success: true,
        pluginPath: result.pluginPath,
        message: `Plugin uploaded and loaded successfully: ${uploadDto.name}`,
      };
    } catch (error) {
      this.logger.error('Failed to upload plugin:', error);
      throw new HttpException(
        `Failed to upload plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Put(':pluginPath/reload')
  async reloadPlugin(@Param('pluginPath') encodedPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      const success = await this.pluginService.reloadPlugin(pluginPath);
      
      if (success) {
        return {
          success: true,
          message: `Plugin reloaded successfully: ${pluginPath}`,
        };
      } else {
        throw new HttpException('Failed to reload plugin', HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      this.logger.error('Failed to reload plugin:', error);
      throw new HttpException(
        `Failed to reload plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':pluginPath')
  async unloadPlugin(@Param('pluginPath') encodedPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      const success = await this.pluginService.unloadPlugin(pluginPath);
      
      if (success) {
        return {
          success: true,
          message: `Plugin unloaded successfully: ${pluginPath}`,
        };
      } else {
        throw new HttpException('Failed to unload plugin', HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      this.logger.error('Failed to unload plugin:', error);
      throw new HttpException(
        `Failed to unload plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('stats')
  async getPluginStats(): Promise<PluginStatsResponse> {
    try {
      const stats = await this.pluginService.getStats();
      const securityReport = await this.pluginService.getSecurityReport();

      return {
        ...stats,
        securityReport,
      };
    } catch (error) {
      this.logger.error('Failed to get plugin stats:', error);
      throw new HttpException(
        'Failed to retrieve plugin statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('config')
  async getPluginConfig(): Promise<Partial<PluginLoaderConfig>> {
    try {
      return await this.pluginService.getConfig();
    } catch (error) {
      this.logger.error('Failed to get plugin config:', error);
      throw new HttpException(
        'Failed to retrieve plugin configuration',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('config')
  async updatePluginConfig(@Body() configDto: PluginConfigDto): Promise<{ success: boolean; message: string }> {
    try {
      await this.pluginService.updateConfig(configDto);
      
      return {
        success: true,
        message: 'Plugin configuration updated successfully',
      };
    } catch (error) {
      this.logger.error('Failed to update plugin config:', error);
      throw new HttpException(
        `Failed to update plugin configuration: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':pluginPath/trust')
  async trustPlugin(@Param('pluginPath') encodedPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      await this.pluginService.addTrustedPlugin(pluginPath);
      
      return {
        success: true,
        message: `Plugin marked as trusted: ${pluginPath}`,
      };
    } catch (error) {
      this.logger.error('Failed to trust plugin:', error);
      throw new HttpException(
        `Failed to trust plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':pluginPath/trust')
  async untrustPlugin(@Param('pluginPath') encodedPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      await this.pluginService.removeTrustedPlugin(pluginPath);
      
      return {
        success: true,
        message: `Plugin trust status removed: ${pluginPath}`,
      };
    } catch (error) {
      this.logger.error('Failed to untrust plugin:', error);
      throw new HttpException(
        `Failed to remove plugin trust: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':pluginPath/validate')
  async validatePlugin(@Param('pluginPath') encodedPath: string): Promise<{ valid: boolean; message: string }> {
    try {
      const pluginPath = Buffer.from(encodedPath, 'base64').toString('utf-8');
      const isValid = await this.pluginService.validatePluginIntegrity(pluginPath);
      
      return {
        valid: isValid,
        message: isValid ? 'Plugin integrity verified' : 'Plugin integrity check failed',
      };
    } catch (error) {
      this.logger.error('Failed to validate plugin:', error);
      throw new HttpException(
        `Failed to validate plugin: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('security/report')
  async getSecurityReport() {
    try {
      return await this.pluginService.getSecurityReport();
    } catch (error) {
      this.logger.error('Failed to get security report:', error);
      throw new HttpException(
        'Failed to retrieve security report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reload-all')
  async reloadAllPlugins(): Promise<{ success: boolean; message: string; results: Array<{ plugin: string; success: boolean; error?: string }> }> {
    try {
      const results = await this.pluginService.reloadAllPlugins();
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: true,
        message: `Reloaded ${successCount}/${results.length} plugins successfully`,
        results,
      };
    } catch (error) {
      this.logger.error('Failed to reload all plugins:', error);
      throw new HttpException(
        `Failed to reload plugins: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates')
  async getPluginTemplates(): Promise<{ templates: Array<{ name: string; description: string; content: string }> }> {
    try {
      const templates = await this.pluginService.getPluginTemplates();
      return { templates };
    } catch (error) {
      this.logger.error('Failed to get plugin templates:', error);
      throw new HttpException(
        'Failed to retrieve plugin templates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async getPluginHealth(): Promise<{
    healthy: boolean;
    pluginLoader: boolean;
    hotReload: boolean;
    securitySandbox: boolean;
    issues: string[];
  }> {
    try {
      return await this.pluginService.getHealthStatus();
    } catch (error) {
      this.logger.error('Failed to get plugin health:', error);
      throw new HttpException(
        'Failed to retrieve plugin health status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}