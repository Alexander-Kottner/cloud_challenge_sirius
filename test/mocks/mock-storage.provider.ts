import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { FileDownloadResult, FileUploadResult, StorageProvider } from '../../src/storage/interfaces/storage.interface';

@Injectable()
export class MockStorageProvider implements StorageProvider {
  protected readonly logger = new Logger(MockStorageProvider.name);
  
  // In-memory storage for test files
  private files: Map<string, Buffer> = new Map();
  private mimetypes: Map<string, string> = new Map();
  
  constructor() {
    this.logger.log('MockStorageProvider initialized');
  }
  
  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    this.logger.debug(`Uploading mock file: ${key}, size: ${file.length}, mimetype: ${mimetype}`);
    
    // Store file in memory
    this.files.set(key, file);
    this.mimetypes.set(key, mimetype);
    
    return {
      provider: 'mock',
      location: `mock://storage/${key}`,
      key,
      size: file.length,
    };
  }

  async downloadFile(key: string): Promise<FileDownloadResult> {
    this.logger.debug(`Downloading mock file: ${key}`);
    
    const file = this.files.get(key);
    if (!file) {
      this.logger.error(`File not found: ${key}`);
      throw new Error(`File not found: ${key}`);
    }
    
    const mimetype = this.mimetypes.get(key) || 'application/octet-stream';
    const stream = Readable.from(file);
    
    return {
      stream,
      mimetype,
      size: file.length,
      fileName: key.split('/').pop() || 'download',
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    this.logger.debug(`Deleting mock file: ${key}`);
    
    if (!this.files.has(key)) {
      this.logger.warn(`File not found for deletion: ${key}`);
      return false;
    }
    
    this.files.delete(key);
    this.mimetypes.delete(key);
    return true;
  }

  async isAvailable(): Promise<boolean> {
    this.logger.debug('Mock storage provider availability check: true');
    return true; // Mock provider is always available
  }
}