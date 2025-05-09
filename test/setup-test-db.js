#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Configuration for test database
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/cloud_challenge_test';

/**
 * Run database migrations on the test database
 */
async function setupTestDatabase() {
  console.log('Setting up test database...');
  
  try {
    // Set environment variable for Prisma to use test database
    process.env.DATABASE_URL = TEST_DB_URL;
    
    console.log('Running migrations on test database...');
    // Run Prisma migrations on the test database
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    console.log('Test database setup completed successfully!');
  } catch (error) {
    console.error('Failed to set up test database:', error);
    process.exit(1);
  }
}

// Execute setup
setupTestDatabase();