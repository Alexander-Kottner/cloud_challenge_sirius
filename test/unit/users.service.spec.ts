import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from '../../src/users/users.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prismaService: PrismaService;

  // Mock data
  const mockUser = {
    id: 'user-id-1',
    username: 'testuser',
    isAdmin: false,
    monthlyUsage: BigInt(1000000), // 1MB
    nextQuotaResetDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    usageHistory: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      
      const result = await usersService.findOne('user-id-1');
      
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
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
      expect(result).toEqual(mockUser);
    });
  });

  describe('isAdmin', () => {
    it('should return true when user is admin', async () => {
      const adminUser = { ...mockUser, isAdmin: true };
      mockPrismaService.user.findUnique.mockResolvedValue(adminUser);
      
      const result = await usersService.isAdmin('user-id-1');
      
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        select: { isAdmin: true, username: true },
      });
      expect(result).toBe(true);
    });

    it('should return false when user is not admin', async () => {
      const regularUser = { ...mockUser, isAdmin: false };
      mockPrismaService.user.findUnique.mockResolvedValue(regularUser);
      
      const result = await usersService.isAdmin('user-id-1');
      
      expect(result).toBe(false);
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      
      await expect(usersService.isAdmin('user-id-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkUserStorageQuota', () => {
    it('should return true when user has enough quota', async () => {
      // First call for initial user check
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(1000000), // 1MB
        nextQuotaResetDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      // Second call for fresh user data after potential reset
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(1000000), // 1MB
      });
      
      const fileSize = 1000000; // 1MB
      const result = await usersService.checkUserStorageQuota('user-id-1', fileSize);
      
      // Total would be 2MB, which is less than the 5GB quota
      expect(result).toBe(true);
    });

    it('should return false when user exceeds quota', async () => {
      const maxStorageInBytes = 5 * 1024 * 1024 * 1024; // 5GB in bytes
      
      // First call for initial user check
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(maxStorageInBytes - 1000), // Almost at quota
        nextQuotaResetDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      // Second call for fresh user data after potential reset
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(maxStorageInBytes - 1000), // Almost at quota
      });
      
      const fileSize = 2000; // Exceeds remaining quota
      const result = await usersService.checkUserStorageQuota('user-id-1', fileSize);
      
      expect(result).toBe(false);
    });
    
    it('should check and reset quota if needed', async () => {
      // Mock a user with past reset date
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday
      
      // First call for initial user check - note the past reset date
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(1000000), // 1MB
        nextQuotaResetDate: pastDate,
      });

      // Mock the update call that would happen during reset
      mockPrismaService.user.update.mockResolvedValueOnce({});
      
      // Second call for fresh user data after reset
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        monthlyUsage: BigInt(0), // Should be reset to 0
      });
      
      const fileSize = 1000000; // 1MB
      const result = await usersService.checkUserStorageQuota('user-id-1', fileSize);
      
      // Verify the reset happened
      expect(prismaService.user.update).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      
      await expect(usersService.checkUserStorageQuota('user-id-1', 1000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateUserStorageUsage', () => {
    it('should update user storage usage correctly', async () => {
      // Mock for the initial check
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        nextQuotaResetDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      // Mock for the usageHistory check
      mockPrismaService.usageHistory.findFirst.mockResolvedValueOnce(null);
      
      // Mock the user update and usageHistory create calls
      mockPrismaService.user.update.mockResolvedValueOnce({});
      mockPrismaService.usageHistory.create.mockResolvedValueOnce({});
      
      const fileSize = 1000000; // 1MB
      await usersService.updateUserStorageUsage('user-id-1', fileSize);
      
      // Verify user.update was called to increment storage usage
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: {
          monthlyUsage: {
            increment: fileSize,
          },
        },
      });
      
      // Verify usageHistory was created
      expect(prismaService.usageHistory.create).toHaveBeenCalled();
    });
    
    it('should update existing usage history record if one exists for today', async () => {
      // Mock for the initial check
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        nextQuotaResetDate: new Date(Date.now() + 86400000), // Tomorrow
      });

      // Mock for the usageHistory check - existing record found
      mockPrismaService.usageHistory.findFirst.mockResolvedValueOnce({
        id: 'usage-history-id',
        userId: 'user-id-1',
        date: new Date(),
        usageBytes: BigInt(500000),
      });
      
      // Mock the update calls
      mockPrismaService.user.update.mockResolvedValueOnce({});
      mockPrismaService.usageHistory.update.mockResolvedValueOnce({});
      
      const fileSize = 1000000; // 1MB
      await usersService.updateUserStorageUsage('user-id-1', fileSize);
      
      // Verify usageHistory was updated not created
      expect(prismaService.usageHistory.update).toHaveBeenCalledWith({
        where: { id: 'usage-history-id' },
        data: {
          usageBytes: {
            increment: fileSize,
          },
        },
      });
      expect(prismaService.usageHistory.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      
      await expect(usersService.updateUserStorageUsage('user-id-1', 1000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getDailyUsageStats', () => {
    it('should return daily usage stats', async () => {
      const mockStats = [
        {
          user: { username: 'user1' },
          usageBytes: BigInt(2000000),
        },
        {
          user: { username: 'user2' },
          usageBytes: BigInt(1000000),
        },
      ];
      
      mockPrismaService.usageHistory.findMany.mockResolvedValueOnce(mockStats);
      
      const result = await usersService.getDailyUsageStats();
      
      expect(prismaService.usageHistory.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('resetMonthlyUsage', () => {
    it('should reset monthly usage for all users', async () => {
      const mockUsers = [
        { id: 'user1', nextQuotaResetDate: new Date() },
        { id: 'user2', nextQuotaResetDate: new Date() },
      ];
      
      mockPrismaService.user.findMany.mockResolvedValueOnce(mockUsers);
      mockPrismaService.user.update.mockResolvedValue({});
      
      await usersService.resetMonthlyUsage();
      
      expect(prismaService.user.findMany).toHaveBeenCalled();
      expect(prismaService.user.update).toHaveBeenCalledTimes(2);
    });
  });
});