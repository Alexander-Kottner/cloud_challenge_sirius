import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { setupTestApp, cleanupTestDatabase, createTestUser } from './test-utils';

describe('Stats Controller (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let adminJwtToken: string;
  let regularJwtToken: string;
  
  const adminUser = {
    username: 'adminuser',
    password: 'AdminPass123',
    isAdmin: true
  };

  const regularUser = {
    username: 'regularuser',
    password: 'RegularPass123',
    isAdmin: false
  };

  beforeAll(async () => {
    // Use our test setup utility with test database
    const testEnv = await setupTestApp();
    app = testEnv.app;
    prismaService = testEnv.prismaService;
  });

  beforeEach(async () => {
    // Clean up database using our utility
    await cleanupTestDatabase(prismaService);

    // Create an admin user using our utility function
    await createTestUser(prismaService, adminUser);
    
    // Create a regular user
    await createTestUser(prismaService, regularUser);

    // Login as admin user
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: adminUser.username,
        password: adminUser.password
      });
    
    adminJwtToken = adminLoginResponse.body.access_token;

    // Login as regular user
    const regularLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: regularUser.username,
        password: regularUser.password
      });
    
    regularJwtToken = regularLoginResponse.body.access_token;
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  describe('GET /stats', () => {
    it('should allow admin to access stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/stats')
        .set('Authorization', `Bearer ${adminJwtToken}`)
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should forbid regular user from accessing stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/stats')
        .set('Authorization', `Bearer ${regularJwtToken}`)
        .expect(403);
      
      expect(response.body.message).toBe('Admin access required');
    });

    it('should reject unauthorized access', async () => {
      await request(app.getHttpServer())
        .get('/stats')
        .expect(401);
    });
  });
});