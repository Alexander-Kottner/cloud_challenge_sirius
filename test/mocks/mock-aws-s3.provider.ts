import { Injectable, Logger } from '@nestjs/common';
import { FileUploadResult } from '../../src/storage/interfaces/storage.interface';
import { MockStorageProvider } from './mock-storage.provider';

@Injectable()
export class MockAwsS3Provider extends MockStorageProvider {
  // Change to protected instead of private to avoid conflict with parent class
  protected override readonly logger = new Logger(MockAwsS3Provider.name);
  
  constructor() {
    super();
    this.logger.log('MockAwsS3Provider initialized');
  }
  
  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    this.logger.debug(`AWS S3 mock uploading file: ${key}`);
    const result = await super.uploadFile(file, key, mimetype);
    // Override the provider name to match the real provider
    return {
      ...result,
      provider: 'aws',
    };
  }
}