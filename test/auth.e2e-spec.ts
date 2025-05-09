import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { RegisterDto, LoginDto } from '../src/auth/dto/auth.dto';
import { setupTestApp, cleanupTestDatabase } from './test-utils';

describe('Auth Controller (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtToken: string;
  
  const testUser = {
    username: 'testuser',
    password: 'Password123'
  };

  beforeAll(async () => {
    // Use our test setup utility
    const testEnv = await setupTestApp();
    app = testEnv.app;
    prismaService = testEnv.prismaService;
  });

  beforeEach(async () => {
    // Clean up database using our utility
    await cleanupTestDatabase(prismaService);
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const registerDto: RegisterDto = testUser;
      
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);
        
      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.username).toBe(testUser.username);
      // Password should not be returned
      expect(response.body.password).toBeUndefined();
    });

    it('should fail if username is already taken', async () => {
      // Register the user first
      const registerDto: RegisterDto = testUser;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);

      // Try to register again with the same username
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(401); // Unauthorized - username already exists
        
      expect(response.body.message).toBe('Username already exists');
    });

    it('should fail with invalid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'a', // too short (min length is 3)
          password: 'pwd', // too short (min length is 8)
        })
        .expect(400);
        
      expect(response.body.message).toBeDefined();
      expect(Array.isArray(response.body.message)).toBeTruthy();
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Register a test user before each login test
      const registerDto: RegisterDto = testUser;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);
    });

    it('should login successfully and return JWT token', async () => {
      const loginDto: LoginDto = testUser;
      
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);
        
      expect(response.body).toBeDefined();
      expect(response.body.access_token).toBeDefined();
      // Store the token for subsequent tests
      jwtToken = response.body.access_token;
    });

    it('should fail with invalid username', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'invaliduser',
          password: testUser.password,
        })
        .expect(401);
        
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should fail with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword',
        })
        .expect(401);
        
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('Protected Routes with JWT Authentication', () => {
    beforeEach(async () => {
      // Register and login a user to get JWT token
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
      
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(testUser);
      
      jwtToken = response.body.access_token;
    });

    it('should access protected route with valid JWT', async () => {
      await request(app.getHttpServer())
        .get('/files')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
    });

    it('should reject access without JWT', async () => {
      await request(app.getHttpServer())
        .get('/files')
        .expect(401);
    });

    it('should reject access with invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/files')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});