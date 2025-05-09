import { Injectable, Logger } from '@nestjs/common';
import { FileUploadResult } from '../../src/storage/interfaces/storage.interface';
import { MockStorageProvider } from './mock-storage.provider';

@Injectable()
export class MockGcpStorageProvider extends MockStorageProvider {
  // Change to protected instead of private to avoid conflict with parent class
  protected override readonly logger = new Logger(MockGcpStorageProvider.name);
  
  constructor() {
    super();
    this.logger.log('MockGcpStorageProvider initialized');
  }
  
  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    this.logger.debug(`GCP Storage mock uploading file: ${key}`);
    const result = await super.uploadFile(file, key, mimetype);
    // Override the provider name to match the real provider
    return {
      ...result,
      provider: 'gcp',
    };
  }
}