import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { StorageModule } from './storage/storage.module';
import { StatsModule } from './stats/stats.module';
import { PrismaService } from './database/prisma.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UsersModule,
    FilesModule,
    StorageModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
