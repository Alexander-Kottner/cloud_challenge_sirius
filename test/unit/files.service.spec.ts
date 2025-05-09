import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FilesService } from '../../src/files/files.service';
import { PrismaService } from '../../src/database/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { UsersService } from '../../src/users/users.service';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

// Mock uuid to have predictable values in tests
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mocked-uuid'),
}));

describe('FilesService', () => {
  let filesService: FilesService;
  let prismaService: PrismaService;
  let storageService: StorageService;
  let usersService: UsersService;

  // Sample test file
  const mockFile = {
    buffer: Buffer.from('test file content'),
    originalname: 'test-file.txt',
    mimetype: 'text/plain',
    size: 1024,
  } as Express.Multer.File;

  // Sample user
  const mockUserId = 'user-1';

  // Mock services
  const mockPrismaService = {
    file: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStorageService = {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockUsersService = {
    checkUserStorageQuota: jest.fn(),
    updateUserStorageUsage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    filesService = module.get<FilesService>(FilesService);
    prismaService = module.get<PrismaService>(PrismaService);
    storageService = module.get<StorageService>(StorageService);
    usersService = module.get<UsersService>(UsersService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    beforeEach(() => {
      // Set default behavior for mocks used in uploadFile
      mockUsersService.checkUserStorageQuota.mockResolvedValue(true);
      mockStorageService.uploadFile.mockResolvedValue({
        provider: 'aws',
        location: 'https://example.com/file',
        key: 'uploads/user-1/mocked-uuid.txt',
        size: mockFile.size,
      });
      mockPrismaService.file.create.mockResolvedValue({
        id: 'file-1',
        name: 'mocked-uuid.txt',
        originalName: mockFile.originalname,
        size: BigInt(mockFile.size),
        mimeType: mockFile.mimetype,
        cloudProvider: 'aws',
        cloudPath: 'uploads/user-1/mocked-uuid.txt',
        userId: mockUserId,
        uploadedAt: new Date(),
      });
    });

    it('should upload a file successfully', async () => {
      const result = await filesService.uploadFile(mockFile, mockUserId);
      
      // Check that storage quota was verified
      expect(usersService.checkUserStorageQuota).toHaveBeenCalledWith(mockUserId, mockFile.size);
      
      // Check that file was uploaded to storage
      expect(storageService.uploadFile).toHaveBeenCalledWith(
        mockFile.buffer,
        expect.stringContaining(`uploads/${mockUserId}/`),
        mockFile.mimetype,
      );
      
      // Check that file record was created in database
      expect(prismaService.file.create).toHaveBeenCalledWith({
        data: {
          name: expect.stringContaining('mocked-uuid'),
          originalName: mockFile.originalname,
          size: BigInt(mockFile.size),
          mimeType: mockFile.mimetype,
          cloudProvider: 'aws',
          cloudPath: expect.stringContaining(`uploads/${mockUserId}/`),
          userId: mockUserId,
        },
      });
      
      // Check that user storage usage was updated
      expect(usersService.updateUserStorageUsage).toHaveBeenCalledWith(mockUserId, mockFile.size);
      
      // Check the returned result
      expect(result).toEqual({
        id: 'file-1',
        name: 'mocked-uuid.txt',
        originalName: mockFile.originalname,
        size: mockFile.size, // Should be converted from BigInt to Number
        uploadedAt: expect.any(Date),
        url: 'https://example.com/file',
      });
    });

    it('should throw BadRequestException when user exceeds storage quota', async () => {
      mockUsersService.checkUserStorageQuota.mockResolvedValue(false);
      
      await expect(filesService.uploadFile(mockFile, mockUserId))
        .rejects.toThrow(BadRequestException);
      
      // Verify that no further operations were performed
      expect(storageService.uploadFile).not.toHaveBeenCalled();
      expect(prismaService.file.create).not.toHaveBeenCalled();
      expect(usersService.updateUserStorageUsage).not.toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    const mockFileId = 'file-1';
    const mockFileRecord = {
      id: mockFileId,
      name: 'test-file.txt',
      originalName: 'original-test-file.txt',
      size: BigInt(1024),
      mimeType: 'text/plain',
      cloudProvider: 'aws',
      cloudPath: 'uploads/user-1/test-file.txt',
      userId: mockUserId,
      uploadedAt: new Date(),
    };

    beforeEach(() => {
      process.env.API_URL = 'http://localhost:3000';
      mockPrismaService.file.findUnique.mockResolvedValue(mockFileRecord);
    });

    it('should return file information when file exists and belongs to user', async () => {
      const result = await filesService.getFile(mockFileId, mockUserId);
      
      expect(prismaService.file.findUnique).toHaveBeenCalledWith({
        where: { id: mockFileId },
      });
      
      expect(result).toEqual({
        id: mockFileId,
        name: mockFileRecord.name,
        originalName: mockFileRecord.originalName,
        size: Number(mockFileRecord.size),
        uploadedAt: mockFileRecord.uploadedAt,
        url: `${process.env.API_URL}/files/download/${mockFileId}`,
      });
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockPrismaService.file.findUnique.mockResolvedValue(null);
      
      await expect(filesService.getFile(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when file belongs to different user', async () => {
      const differentUserFileRecord = {
        ...mockFileRecord,
        userId: 'different-user',
      };
      
      mockPrismaService.file.findUnique.mockResolvedValue(differentUserFileRecord);
      
      await expect(filesService.getFile(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getFileForDownload', () => {
    const mockFileId = 'file-1';
    const mockFileRecord = {
      id: mockFileId,
      name: 'test-file.txt',
      originalName: 'original-test-file.txt',
      size: BigInt(1024),
      mimeType: 'text/plain',
      cloudProvider: 'aws',
      cloudPath: 'uploads/user-1/test-file.txt',
      userId: mockUserId,
      uploadedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.file.findUnique.mockResolvedValue(mockFileRecord);
      mockStorageService.downloadFile.mockResolvedValue({
        stream: Readable.from(['mock file content']),
        mimetype: mockFileRecord.mimeType,
        size: Number(mockFileRecord.size),
        fileName: mockFileRecord.originalName,
      });
    });

    it('should return file stream for download when file exists and belongs to user', async () => {
      const result = await filesService.getFileForDownload(mockFileId, mockUserId);
      
      expect(prismaService.file.findUnique).toHaveBeenCalledWith({
        where: { id: mockFileId },
      });
      
      expect(storageService.downloadFile).toHaveBeenCalledWith(
        mockFileRecord.cloudPath,
        mockFileRecord.cloudProvider,
      );
      
      expect(result).toEqual({
        stream: expect.any(Readable),
        mimetype: mockFileRecord.mimeType,
        size: Number(mockFileRecord.size),
        filename: mockFileRecord.originalName,
      });
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockPrismaService.file.findUnique.mockResolvedValue(null);
      
      await expect(filesService.getFileForDownload(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when file belongs to different user', async () => {
      const differentUserFileRecord = {
        ...mockFileRecord,
        userId: 'different-user',
      };
      
      mockPrismaService.file.findUnique.mockResolvedValue(differentUserFileRecord);
      
      await expect(filesService.getFileForDownload(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserFiles', () => {
    const mockFileRecords = [
      {
        id: 'file-1',
        name: 'test-file-1.txt',
        originalName: 'original-test-file-1.txt',
        size: BigInt(1024),
        mimeType: 'text/plain',
        cloudProvider: 'aws',
        cloudPath: 'uploads/user-1/test-file-1.txt',
        userId: mockUserId,
        uploadedAt: new Date('2025-01-01'),
      },
      {
        id: 'file-2',
        name: 'test-file-2.txt',
        originalName: 'original-test-file-2.txt',
        size: BigInt(2048),
        mimeType: 'text/plain',
        cloudProvider: 'aws',
        cloudPath: 'uploads/user-1/test-file-2.txt',
        userId: mockUserId,
        uploadedAt: new Date('2025-01-02'),
      },
    ];

    beforeEach(() => {
      process.env.API_URL = 'http://localhost:3000';
      mockPrismaService.file.findMany.mockResolvedValue(mockFileRecords);
    });

    it('should return all files belonging to a user', async () => {
      const result = await filesService.getUserFiles(mockUserId);
      
      expect(prismaService.file.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { uploadedAt: 'desc' },
      });
      
      expect(result).toEqual([
        {
          id: mockFileRecords[0].id,
          name: mockFileRecords[0].name,
          originalName: mockFileRecords[0].originalName,
          size: Number(mockFileRecords[0].size),
          uploadedAt: mockFileRecords[0].uploadedAt,
          url: `${process.env.API_URL}/files/download/${mockFileRecords[0].id}`,
        },
        {
          id: mockFileRecords[1].id,
          name: mockFileRecords[1].name,
          originalName: mockFileRecords[1].originalName,
          size: Number(mockFileRecords[1].size),
          uploadedAt: mockFileRecords[1].uploadedAt,
          url: `${process.env.API_URL}/files/download/${mockFileRecords[1].id}`,
        },
      ]);
    });
    
    it('should return empty array when user has no files', async () => {
      mockPrismaService.file.findMany.mockResolvedValue([]);
      
      const result = await filesService.getUserFiles(mockUserId);
      
      expect(result).toEqual([]);
    });
  });

  describe('deleteFile', () => {
    const mockFileId = 'file-1';
    const mockFileRecord = {
      id: mockFileId,
      name: 'test-file.txt',
      originalName: 'original-test-file.txt',
      size: BigInt(1024),
      mimeType: 'text/plain',
      cloudProvider: 'aws',
      cloudPath: 'uploads/user-1/test-file.txt',
      userId: mockUserId,
      uploadedAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.file.findUnique.mockResolvedValue(mockFileRecord);
      mockStorageService.deleteFile.mockResolvedValue(true);
      mockPrismaService.file.delete.mockResolvedValue(mockFileRecord);
    });

    it('should delete file successfully when file exists and belongs to user', async () => {
      const result = await filesService.deleteFile(mockFileId, mockUserId);
      
      expect(prismaService.file.findUnique).toHaveBeenCalledWith({
        where: { id: mockFileId },
      });
      
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        mockFileRecord.cloudPath,
        mockFileRecord.cloudProvider,
      );
      
      expect(prismaService.file.delete).toHaveBeenCalledWith({
        where: { id: mockFileId },
      });
      
      expect(usersService.updateUserStorageUsage).toHaveBeenCalledWith(
        mockUserId,
        Number(mockFileRecord.size) * -1,
      );
      
      expect(result).toBe(true);
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockPrismaService.file.findUnique.mockResolvedValue(null);
      
      await expect(filesService.deleteFile(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
      
      expect(storageService.deleteFile).not.toHaveBeenCalled();
      expect(prismaService.file.delete).not.toHaveBeenCalled();
      expect(usersService.updateUserStorageUsage).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when file belongs to different user', async () => {
      const differentUserFileRecord = {
        ...mockFileRecord,
        userId: 'different-user',
      };
      
      mockPrismaService.file.findUnique.mockResolvedValue(differentUserFileRecord);
      
      await expect(filesService.deleteFile(mockFileId, mockUserId))
        .rejects.toThrow(NotFoundException);
      
      expect(storageService.deleteFile).not.toHaveBeenCalled();
      expect(prismaService.file.delete).not.toHaveBeenCalled();
      expect(usersService.updateUserStorageUsage).not.toHaveBeenCalled();
    });
  });
});