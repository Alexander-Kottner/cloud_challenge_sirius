import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { FilesController } from './files/files.controller';
import { StatsController } from './stats/stats.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth/auth.service';
import { FilesService } from './files/files.service';
import { StatsService } from './stats/stats.service';
import { StorageService } from './storage/storage.service';

/**
 * Specialized module for Swagger documentation without database dependencies
 */
@Module({
  imports: [
    JwtModule.register({
      secret: 'swagger-docs-secret-key',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    FilesController,
    StatsController,
  ],
  providers: [
    AppService,
    // Mock actual services with minimal implementations
    {
      provide: AuthService,
      useValue: {
        register: () => ({}),
        login: () => ({}),
      },
    },
    {
      provide: FilesService,
      useValue: {
        uploadFile: () => ({}),
        getUserFiles: () => ([]),
        getFile: () => ({}),
        getFileForDownload: () => ({
          mimetype: 'application/octet-stream',
          filename: 'example.txt',
          size: 0,
          stream: {
            pipe: () => {},
          },
        }),
        deleteFile: () => true,
      },
    },
    {
      provide: StatsService,
      useValue: {
        getDailyUsageStats: () => ([{
          username: 'example-user',
          usageBytes: 1048576,
          usageMB: 1
        }]),
      },
    },
    {
      provide: StorageService,
      useValue: {
        upload: () => ({}),
        download: () => ({}),
        delete: () => ({}),
      },
    },
  ],
})
export class SwaggerModule {}