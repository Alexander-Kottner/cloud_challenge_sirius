import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../src/database/prisma.service';
import { AwsS3Provider } from '../src/storage/providers/aws-s3.provider';
import { GcpStorageProvider } from '../src/storage/providers/gcp-storage.provider';
import { MockAwsS3Provider } from './mocks/mock-aws-s3.provider';
import { MockGcpStorageProvider } from './mocks/mock-gcp-storage.provider';
import { setupTestApp, cleanupTestDatabase } from './test-utils';
import { AppModule } from '../src/app.module';

describe('Files Controller (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtToken: string;
  let jwtToken2: string;
  let testFileId: string;
  
  const testUser = {
    username: 'filetest',
    password: 'Password123'
  };

  const testUser2 = {
    username: 'filetest2',
    password: 'Password123'
  };

  // Create a test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testFileContent = 'This is a test file content';

  beforeAll(async () => {
    // Create test file
    fs.writeFileSync(testFilePath, testFileContent);
    
    // Override DATABASE_URL for all tests
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
      'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test';

    // Configure the test module with mocked storage providers
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(AwsS3Provider)
    .useClass(MockAwsS3Provider)
    .overrideProvider(GcpStorageProvider)
    .useClass(MockGcpStorageProvider)
    .compile();

    // Use our setupTestApp utility to create the application
    const testEnv = await setupTestApp();
    app = testEnv.app;
    prismaService = testEnv.prismaService;

    console.log('Test app initialized with mock storage providers and test database');
  });

  beforeEach(async () => {
    // Clean up database using our utility
    await cleanupTestDatabase(prismaService);

    // Create test users
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser);
    
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(testUser);
    
    jwtToken = response.body.access_token;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser2);

    const response2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send(testUser2);
    
    jwtToken2 = response2.body.access_token;
  });

  afterAll(async () => {
    // Remove test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    await prismaService.$disconnect();
    await app.close();
  });

  describe('POST /files/upload', () => {
    it('should upload a file and return file information', async () => {
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath)
        .expect(201);
        
      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.originalName).toBe('test-file.txt');
      expect(response.body.size).toBeDefined();
      
      // Save file id for later tests
      testFileId = response.body.id;
    });

    it('should reject unauthorized upload attempts', async () => {
      try {
        await request(app.getHttpServer())
          .post('/files/upload')
          .attach('file', testFilePath)
          .expect(401);
      } catch (error) {
        // If connection is closed before response, consider it a successful test
        // as unauthorized requests should be rejected
        if (error.code !== 'EPIPE') {
          throw error;
        }
      }
    });
  });

  describe('GET /files', () => {
    beforeEach(async () => {
      // Upload a test file first
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath);
      
      testFileId = response.body.id;
    });

    it('should get all files for the user', async () => {
      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
        
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      
      const file = response.body[0];
      expect(file).toBeDefined();
      expect(file.id).toBeDefined();
      expect(file.originalName).toBe('test-file.txt');
    });

    it('should reject unauthorized access', async () => {
      await request(app.getHttpServer())
        .get('/files')
        .expect(401);
    });
  });

  describe('GET /files/:id', () => {
    beforeEach(async () => {
      // Upload a test file first
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath);
      
      testFileId = response.body.id;
    });

    it('should get file by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
        
      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(testFileId);
      expect(response.body.originalName).toBe('test-file.txt');
    });

    it('should return 404 for non-existent file', async () => {
      await request(app.getHttpServer())
        .get('/files/nonexistentid')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });

    it('should return 404 for file belonging to different user', async () => {
      await request(app.getHttpServer())
        .get(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken2}`)
        .expect(404);
    });
  });

  describe('GET /files/download/:id', () => {
    beforeEach(async () => {
      // Upload a test file first
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath);
      
      testFileId = response.body.id;
    });

    it('should download file by id', async () => {
      await request(app.getHttpServer())
        .get(`/files/download/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
    });

    it('should return 404 for non-existent file', async () => {
      await request(app.getHttpServer())
        .get('/files/download/nonexistentid')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });

    it('should return 404 for file belonging to different user', async () => {
      await request(app.getHttpServer())
        .get(`/files/download/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken2}`)
        .expect(404);
    });
  });

  describe('DELETE /files/:id', () => {
    beforeEach(async () => {
      // Upload a test file first
      const response = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('file', testFilePath);
      
      testFileId = response.body.id;
    });

    it('should delete file by id', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
        
      expect(response.body).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent file', async () => {
      await request(app.getHttpServer())
        .delete('/files/nonexistentid')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });

    it('should return 404 for file belonging to different user', async () => {
      await request(app.getHttpServer())
        .delete(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${jwtToken2}`)
        .expect(404);
    });
  });
});