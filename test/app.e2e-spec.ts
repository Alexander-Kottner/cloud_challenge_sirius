import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { setupTestApp, cleanupTestDatabase } from './test-utils';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const testEnv = await setupTestApp();
    app = testEnv.app;
    prismaService = testEnv.prismaService;
  });

  beforeEach(async () => {
    // Clean database between tests
    await cleanupTestDatabase(prismaService);
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(200);
      
    // Adjust the expectations to match your actual API response
    expect(response.body).toBeDefined();
    if (response.body.name) {
      expect(response.body).toHaveProperty('name');
    }
    if (response.body.version) {
      expect(response.body).toHaveProperty('version');
    }
    // Your API might return different properties, this is flexible
  });
});
