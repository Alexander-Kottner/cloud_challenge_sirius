import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { StorageProvider, FileUploadResult, FileDownloadResult } from './interfaces/storage.interface';
import { AwsS3Provider } from './providers/aws-s3.provider';
import { GcpStorageProvider } from './providers/gcp-storage.provider';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly providers: StorageProvider[];

  constructor(
    private readonly awsProvider: AwsS3Provider,
    private readonly gcpProvider: GcpStorageProvider,
  ) {
    // Order of providers determines the failover sequence
    this.providers = [awsProvider, gcpProvider];
  }

  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    for (const provider of this.providers) {
      try {
        const isAvailable = await provider.isAvailable();
        
        if (isAvailable) {
          this.logger.log(`Uploading file ${key} using provider ${provider.constructor.name}`);
          return await provider.uploadFile(file, key, mimetype);
        } else {
          this.logger.warn(`Provider ${provider.constructor.name} is not available, trying next one`);
        }
      } catch (error) {
        this.logger.error(`Error uploading file with provider ${provider.constructor.name}:`, error);
      }
    }

    // If we get here, all providers have failed
    throw new ServiceUnavailableException('All storage providers are unavailable');
  }

  async downloadFile(key: string, provider: string): Promise<FileDownloadResult> {
    // First attempt to use the provider that was used for upload
    const selectedProvider = this.getProviderByName(provider);
    
    if (selectedProvider) {
      try {
        const isAvailable = await selectedProvider.isAvailable();
        
        if (isAvailable) {
          return await selectedProvider.downloadFile(key);
        }
      } catch (error) {
        this.logger.error(`Error downloading file with provider ${provider}:`, error);
      }
    }
    
    // If the selected provider is unavailable, throw a service unavailable exception
    // with a message that we'll send the file via email when the service is back up
    throw new ServiceUnavailableException(
      'Storage provider is currently unavailable. The file will be sent to your registered email once service is restored.'
    );
  }

  async deleteFile(key: string, provider: string): Promise<boolean> {
    const selectedProvider = this.getProviderByName(provider);
    
    if (!selectedProvider) {
      throw new Error(`Provider ${provider} not found`);
    }
    
    return await selectedProvider.deleteFile(key);
  }

  private getProviderByName(name: string): StorageProvider | undefined {
    switch (name.toLowerCase()) {
      case 'aws':
        return this.awsProvider;
      case 'gcp':
        return this.gcpProvider;
      default:
        return undefined;
    }
  }

  private getProviderName(provider: StorageProvider): string {
    if (provider instanceof AwsS3Provider) {
      return 'aws';
    } else if (provider instanceof GcpStorageProvider) {
      return 'gcp';
    }
    return 'unknown';
  }
}