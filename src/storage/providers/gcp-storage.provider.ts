import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { StorageProvider, FileUploadResult, FileDownloadResult } from '../interfaces/storage.interface';

@Injectable()
export class GcpStorageProvider implements StorageProvider {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly logger = new Logger(GcpStorageProvider.name);

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('GCP_STORAGE_BUCKET_NAME') || '';
    
    this.storage = new Storage({
      projectId: this.configService.get<string>('GCP_PROJECT_ID'),
      keyFilename: this.configService.get<string>('GCP_KEY_FILE'),
    });
  }

  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const fileObject = bucket.file(key);
      
      const options = {
        metadata: {
          contentType: mimetype,
        },
      };
      
      await fileObject.save(file, options);
      
      // Generate a URL for the uploaded file (will be private)
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${key}`;
      
      return {
        provider: 'gcp',
        location: publicUrl,
        key,
        size: file.length,
      };
    } catch (error) {
      this.logger.error(`Error uploading file to GCP: ${error.message}`, error.stack);
      throw error;
    }
  }

  async downloadFile(key: string): Promise<FileDownloadResult> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const fileObject = bucket.file(key);
      
      const [metadata] = await fileObject.getMetadata();
      const stream = fileObject.createReadStream();
      
      const sizeValue = typeof metadata.size === 'string' 
        ? parseInt(metadata.size, 10) 
        : typeof metadata.size === 'number'
          ? metadata.size
          : 0;
      
      return {
        stream,
        mimetype: metadata.contentType || 'application/octet-stream',
        size: sizeValue,
        fileName: key.split('/').pop() || 'download',
      };
    } catch (error) {
      this.logger.error(`Error downloading file from GCP: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const fileObject = bucket.file(key);
      
      await fileObject.delete();
      return true;
    } catch (error) {
      this.logger.error(`Error deleting file from GCP: ${error.message}`, error.stack);
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const [exists] = await this.storage.bucket(this.bucketName).exists();
      return exists;
    } catch (error) {
      this.logger.error(`Error checking GCP availability: ${error.message}`, error.stack);
      return false;
    }
  }
}