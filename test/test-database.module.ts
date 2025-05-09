import { Module } from '@nestjs/common';
import { TestPrismaService } from './test-prisma.service';
import { PrismaService } from '../src/database/prisma.service';

@Module({
  providers: [
    TestPrismaService,
    {
      provide: PrismaService,
      useClass: TestPrismaService,
    },
  ],
  exports: [PrismaService, TestPrismaService],
})
export class TestDatabaseModule {}