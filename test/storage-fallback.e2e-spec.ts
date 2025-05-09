// filepath: /Users/alexanderkottner/Desktop/SIRIUS/CloudChallenge/test/storage-fallback.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../src/database/prisma.service';
import { AwsS3Provider } from '../src/storage/providers/aws-s3.provider';
import { GcpStorageProvider } from '../src/storage/providers/gcp-storage.provider';
import { StorageProvider } from '../src/storage/interfaces/storage.interface';
import { MockAwsS3Provider } from './mocks/mock-aws-s3.provider';
import { MockGcpStorageProvider } from './mocks/mock-gcp-storage.provider';
import { setupTestApp, cleanupTestDatabase } from './test-utils';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

// Create a shared file storage for tests
const sharedFileStorage = new Map<string, Buffer>();
const sharedMimetypes = new Map<string, string>();

/**
 * Mock AWS Provider that fails on upload
 */
class FailingAwsS3Provider extends MockAwsS3Provider {
  async isAvailable(): Promise<boolean> {
    return false; // Always report as unavailable
  }
}

/**
 * Mock AWS Provider that fails on download
 */
class AwsDownloadFailProvider extends MockAwsS3Provider {
  async downloadFile(): Promise<any> {
    throw new Error('AWS download failed');
  }
}

/**
 * Enhanced Mock AWS Provider with shared storage
 */
class SharedStorageAwsProvider extends MockAwsS3Provider {
  async uploadFile(file: Buffer, key: string, mimetype: string): Promise<any> {
    // Store in shared storage for test continuity
    sharedFileStorage.set(key, file);
    sharedMimetypes.set(key, mimetype);
    
    return super.uploadFile(file, key, mimetype);
  }
}

/**
 * Enhanced Mock GCP Provider with shared storage access
 */
class SharedStorageGcpProvider extends MockGcpStorageProvider {
  async downloadFile(key: string): Promise<any> {
    // Check shared storage first
    if (sharedFileStorage.has(key)) {
      const file = sharedFileStorage.get(key);
      const mimetype = sharedMimetypes.get(key) || 'application/octet-stream';
      const stream = require('stream').Readable.from(file);
      
      return {
        stream,
        mimetype,
        size: file?.length || 0,
        fileName: key.split('/').pop() || 'download',
      };
    }
    
    // Fallback to original implementation
    return super.downloadFile(key);
  }
}

describe('Storage Service Fallback (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let storageService: StorageService;
  let jwtToken: string;
  let testFileId: string;
  
  const testUser = {
    username: 'storagetester',
    password: 'Password123'
  };

  // Create a test file
  const testFilePath = path.join(__dirname, 'test-fallback-file.txt');
  const testFileContent = 'This is a test file for testing storage fallback';

  describe('Upload fallback tests', () => {
    beforeAll(async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);
      
      // Override DATABASE_URL for tests
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
        'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test';
  
      // Configure the test module with failing AWS provider and working GCP provider
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
      .overrideProvider(AwsS3Provider)
      .useClass(FailingAwsS3Provider)
      .overrideProvider(GcpStorageProvider)
      .useClass(MockGcpStorageProvider)
      .compile();
  
      // Create and initialize the app from the test module fixture
      app = moduleFixture.createNestApplication();
      await app.init();
      
      // Get services from the test module
      prismaService = moduleFixture.get<PrismaService>(PrismaService);
      storageService = moduleFixture.get<StorageService>(StorageService);
    });
  
    beforeEach(async () => {
      // Clean up database
      await cleanupTestDatabase(prismaService);
  
      // Create test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(testUser);
      
      jwtToken = response.body.access_token;
    });
  
    afterAll(async () => {
      // Remove test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
  
      await prismaService.$disconnect();
      await app.close();
    });

    it('should fallback to GCP provider when AWS is unavailable', async () => {
      // Upload file - should use GCP since AWS is unavailable
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath)
        .expect(201);
      
      // Verify the file was uploaded
      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.originalName).toBe('test-fallback-file.txt');
      
      // Save the file ID for verification
      testFileId = response.body.id;
      
      // Verify in the database that GCP was used as provider
      const fileRecord = await prismaService.file.findUnique({
        where: { id: testFileId }
      });
      
      expect(fileRecord).toBeDefined();
      expect(fileRecord).not.toBeNull();
      expect(fileRecord?.cloudProvider).toBe('gcp'); // Should use GCP as fallback
    });
  });

  describe('Download fallback tests', () => {
    let uploadedFileId: string;
    
    beforeAll(async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);
      
      // Override DATABASE_URL for tests
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
        'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test';
  
      // For this test we need:
      // 1. Normal upload with AWS provider
      // 2. Download attempt where AWS fails and GCP is used as fallback
      const uploadModuleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
      .overrideProvider(AwsS3Provider)
      .useClass(SharedStorageAwsProvider) // Use provider with shared storage
      .overrideProvider(GcpStorageProvider)
      .useClass(MockGcpStorageProvider)
      .compile();
  
      // Create and initialize the app from the test module fixture
      app = uploadModuleFixture.createNestApplication();
      await app.init();
      
      // Get services from the test module
      prismaService = uploadModuleFixture.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
      // Clean up database
      await cleanupTestDatabase(prismaService);
  
      // Create test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(testUser);
      
      jwtToken = response.body.access_token;
      
      // Upload a file using the AWS provider first
      const uploadResponse = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath);
        
      uploadedFileId = uploadResponse.body.id;
      
      // Verify it was uploaded with AWS provider
      const fileRecord = await prismaService.file.findUnique({
        where: { id: uploadedFileId }
      });
      
      expect(fileRecord).toBeDefined();
      expect(fileRecord).not.toBeNull();
      expect(fileRecord?.cloudProvider).toBe('aws');
      
      // Now replace AWS provider with failing download version
      await app.close();
      
      const downloadModuleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
      .overrideProvider(AwsS3Provider)
      .useClass(AwsDownloadFailProvider)
      .overrideProvider(GcpStorageProvider)
      .useClass(SharedStorageGcpProvider) // Use provider with shared storage access
      .compile();
      
      app = downloadModuleFixture.createNestApplication();
      await app.init();
    });
  
    afterAll(async () => {
      // Remove test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
  
      await prismaService.$disconnect();
      await app.close();
    });

    it('should return service unavailable when AWS download fails', async () => {
      // Attempt download - AWS will fail and should return service unavailable
      const downloadResponse = await request(app.getHttpServer())
        .get(`/files/download/${uploadedFileId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(503); // Service Unavailable status code
        
      // Verify error message mentions email delivery
      expect(downloadResponse.body.message).toContain('sent to your registered email');
    });
  });
});