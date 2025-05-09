import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { AwsS3Provider } from './providers/aws-s3.provider';
import { GcpStorageProvider } from './providers/gcp-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [StorageService, AwsS3Provider, GcpStorageProvider],
  exports: [StorageService],
})
export class StorageModule {}