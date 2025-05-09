import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, FileUploadResult, FileDownloadResult } from '../interfaces/storage.interface';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

@Injectable()
export class AwsS3Provider implements StorageProvider {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME') || '';
    
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: mimetype,
    };

    await this.s3Client.send(new PutObjectCommand(params));

    const location = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    
    return {
      provider: 'aws',
      location,
      key,
      size: file.length,
    };
  }

  async downloadFile(key: string): Promise<FileDownloadResult> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    const response = await this.s3Client.send(new GetObjectCommand(params));
    
    return {
      stream: response.Body,
      mimetype: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || 0,
      fileName: key.split('/').pop() || 'download',
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3Client.send(new DeleteObjectCommand(params));
      return true;
    } catch (error) {
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      return true;
    } catch (error) {
      return false;
    }
  }
}