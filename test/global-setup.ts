import { PrismaClient } from '@prisma/client'


// This file provides global setup and teardown for Jest tests
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test',
    },
  },
});

// Global setup - run once before all tests
export async function setup() {
  // Clear the entire test database before starting
  await prisma.file.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
}

// Global teardown - run once after all tests
export async function teardown() {
  // Make sure all connections are closed
  await prisma.$disconnect();
}