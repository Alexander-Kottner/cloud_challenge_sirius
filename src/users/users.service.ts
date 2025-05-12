import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { log } from 'console';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        monthlyUsage: true,
        nextQuotaResetDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true,
        username: true,
      },
    });
     if (!user) {
      throw new BadRequestException('User not found');
    }

    return user.isAdmin;
  }

  async checkUserStorageQuota(userId: string, fileSize: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { 
        monthlyUsage: true,
        nextQuotaResetDate: true,
        maxStorageCapacity: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if we should reset the quota based on reset date
    await this.checkAndResetQuotaIfNeeded(userId, user.nextQuotaResetDate);

    // Get fresh user data after potential reset
    const freshUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { monthlyUsage: true },
    });

    if (!freshUser) {
      throw new BadRequestException('User not found after quota reset check');
    }
    const usageInBytes = Number(freshUser.monthlyUsage);
    const maxStorageInBytes = Number(user.maxStorageCapacity)
    
    return (usageInBytes + fileSize) <= maxStorageInBytes;
  }

  async updateUserStorageUsage(userId: string, fileSize: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { 
        nextQuotaResetDate: true
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if we should reset the quota based on reset date
    await this.checkAndResetQuotaIfNeeded(userId, user.nextQuotaResetDate);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        monthlyUsage: {
          increment: fileSize,
        },
      },
    });

    // Also record in usage history
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingRecord = await this.prisma.usageHistory.findFirst({
      where: {
        userId,
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    if (existingRecord) {
      await this.prisma.usageHistory.update({
        where: { id: existingRecord.id },
        data: {
          usageBytes: {
            increment: fileSize,
          },
        },
      });
    } else {
      await this.prisma.usageHistory.create({
        data: {
          userId,
          date: today,
          usageBytes: BigInt(fileSize),
        },
      });
    }
  }

  // Helper method to check if quota reset is needed and reset if so
  private async checkAndResetQuotaIfNeeded(userId: string, nextResetDate: Date): Promise<void> {
    const now = new Date();

    // If nextResetDate is null or in the past, we need to reset and calculate a new date
    if (!nextResetDate || nextResetDate <= now) {
      let newResetDate = nextResetDate || new Date();
      
      // Calculate proper next reset date by iteratively adding months
      // until we find a date in the future
      while (newResetDate <= now) {
        newResetDate = this.addOneMonth(newResetDate);
      }

      // Reset the usage and update the next reset date
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          monthlyUsage: BigInt(0),
          nextQuotaResetDate: newResetDate,
        },
      });
    }
  }

  async resetMonthlyUsage(): Promise<void> {
    // This method is no longer needed for scheduled global reset
    // as each user now has their own reset schedule.
    // It can be kept for admin purposes to manually reset all users if needed.
    
    const now = new Date();
    const users = await this.prisma.user.findMany();
    
    for (const user of users) {
      await this.checkAndResetQuotaIfNeeded(user.id, user.nextQuotaResetDate);
    }
  }

  async getDailyUsageStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.prisma.usageHistory.findMany({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
        usageBytes: {
          gt: BigInt(0),
        },
      },
      select: {
        user: {
          select: {
            username: true,
          },
        },
        usageBytes: true,
      },
      orderBy: {
        usageBytes: 'desc',
      },
    });
  }

  // Helper functions for date calculations
  private daysInMonth(year: number, month: number): number {
    // month is 0-based (0 = January). The 0th day of the next month is the last
    // day of the desired month.
    return new Date(year, month + 1, 0).getDate();
  }

  private addOneMonth(orig: Date): Date {
    const year = orig.getFullYear();
    const month = orig.getMonth();
    const day = orig.getDate();

    // advance month by one, rolling over year if needed
    const newMonthIndex = month + 1;
    const newYear = year + Math.floor(newMonthIndex / 12);
    const newMonth = newMonthIndex % 12;

    // clamp the day to the max in the new month
    const newDay = Math.min(day, this.daysInMonth(newYear, newMonth));

    return new Date(
      newYear,
      newMonth,
      newDay,
      orig.getHours(),
      orig.getMinutes(),
      orig.getSeconds(),
      orig.getMilliseconds()
    );
  }
}