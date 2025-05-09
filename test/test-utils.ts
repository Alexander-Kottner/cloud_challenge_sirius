import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TestPrismaService } from './test-prisma.service';

/**
 * Interface for creating test users
 */
export interface TestUser {
  username: string;
  password: string;
  isAdmin?: boolean;
}

/**
 * Setup a NestJS test application
 * @returns The configured NestJS application instance
 */
export async function setupTestApp(): Promise<{
  app: INestApplication;
  prismaService: PrismaService;
}> {
  // Override DATABASE_URL for all tests
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
    'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
  .overrideProvider(PrismaService)
  .useClass(TestPrismaService)
  .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const prismaService = moduleFixture.get<PrismaService>(PrismaService);
  await app.init();

  return { app, prismaService };
}

/**
 * Create a test user in the database with the specified role
 * @param prismaService The PrismaService instance
 * @param userData The user data (username, password, isAdmin)
 * @returns The created user object
 */
export async function createTestUser(
  prismaService: PrismaService,
  userData: TestUser,
): Promise<any> {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  return prismaService.user.create({
    data: {
      username: userData.username,
      password: hashedPassword,
      isAdmin: userData.isAdmin || false,
      nextQuotaResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  });
}

/**
 * Clean up the test database by removing all test data
 * @param prismaService The PrismaService instance
 */
export async function cleanupTestDatabase(prismaService: PrismaService): Promise<void> {
  await prismaService.file.deleteMany({});
  await prismaService.user.deleteMany({});
}

/**
 * Get a JWT token for a user by logging in
 * @param app The NestJS application instance
 * @param userData The user credentials to log in with
 * @returns The JWT token string
 */
export async function getJwtToken(
  app: INestApplication,
  userData: { username: string; password: string },
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send(userData);
  
  return response.body.access_token;
}

/**
 * Generate a mock file of specified size
 * @param filename The name of the file
 * @param size The size of the file in bytes
 * @returns Buffer containing the file data
 */
export function generateMockFile(filename: string, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.fill('A'); // Fill with letter 'A' for simplicity
  return buffer;
}

/**
 * Helper function for handling file uploads in tests
 * @param app The NestJS application instance
 * @param token JWT token for authorization
 * @param filePath Path to the file to upload
 * @returns The response from the server
 */
export async function uploadTestFile(
  app: INestApplication,
  token: string,
  filePath: string,
): Promise<{body: any, statusCode: number}> {
  const response = await request(app.getHttpServer())
    .post('/files/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', filePath);
  
  return {
    body: response.body,
    statusCode: response.statusCode
  };
}

/**
 * Compare expected API response with actual response
 * @param actual The actual API response
 * @param expected The expected API response pattern
 * @returns Whether the response matches the expected pattern
 */
export function matchesResponsePattern(actual: any, expected: any): boolean {
  if (expected === null || expected === undefined) {
    return actual === expected;
  }
  
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return false;
    }
    return expected.every((item, index) => matchesResponsePattern(actual[index], item));
  }
  
  if (typeof expected === 'object') {
    return Object.keys(expected).every(key => {
      return Object.prototype.hasOwnProperty.call(actual, key) && 
        matchesResponsePattern(actual[key], expected[key]);
    });
  }
  
  return actual === expected;
}