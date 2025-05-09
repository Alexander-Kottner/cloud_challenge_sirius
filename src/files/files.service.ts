import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { FileResponseDto } from './dto/file.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly usersService: UsersService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<FileResponseDto> {

    const fileSize = file.size;
    const hasQuota = await this.usersService.checkUserStorageQuota(userId, fileSize);

    if (!hasQuota) {
      throw new BadRequestException('Storage quota exceeded (5GB limit)');
    }

    const fileExtension = file.originalname.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const cloudPath = `uploads/${userId}/${uniqueFilename}`;

    const uploadResult = await this.storageService.uploadFile(
      file.buffer,
      cloudPath,
      file.mimetype,
    );

    const fileRecord = await this.prisma.file.create({
      data: {
        name: uniqueFilename,
        originalName: file.originalname,
        size: BigInt(file.size),
        mimeType: file.mimetype,
        cloudProvider: uploadResult.provider,
        cloudPath: uploadResult.key,
        userId,
      },
    });

    await this.usersService.updateUserStorageUsage(userId, file.size);

    return {
      id: fileRecord.id,
      name: fileRecord.name,
      originalName: fileRecord.originalName,
      size: Number(fileRecord.size),
      uploadedAt: fileRecord.uploadedAt,
      url: uploadResult.location,
    };
  }

  async getFile(fileId: string, userId: string): Promise<FileResponseDto> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.userId !== userId) {
      throw new NotFoundException('File not found');
    }

    return {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      size: Number(file.size),
      uploadedAt: file.uploadedAt,
      url: `${process.env.API_URL}/files/download/${file.id}`,
    };
  }

  async getFileForDownload(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.userId !== userId) {
      throw new NotFoundException('File not found');
    }

    const downloadResult = await this.storageService.downloadFile(
      file.cloudPath,
      file.cloudProvider,
    );

    return {
      stream: downloadResult.stream,
      mimetype: downloadResult.mimetype,
      size: downloadResult.size,
      filename: file.originalName,
    };
  }

  async getUserFiles(userId: string): Promise<FileResponseDto[]> {
    const files = await this.prisma.file.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
    });

    return files.map(file => ({
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      size: Number(file.size),
      uploadedAt: file.uploadedAt,
      url: `${process.env.API_URL}/files/download/${file.id}`,
    }));
  }

  async deleteFile(fileId: string, userId: string): Promise<boolean> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check if the file belongs to the requesting user
    if (file.userId !== userId) {
      throw new NotFoundException('File not found');
    }

    // Delete from cloud storage
    await this.storageService.deleteFile(file.cloudPath, file.cloudProvider);

    // Delete from database
    await this.prisma.file.delete({
      where: { id: fileId },
    });

    // Update user's storage usage (decrement by file size)
    const fileSize = Number(file.size) * -1; // Negative to decrement
    await this.usersService.updateUserStorageUsage(userId, fileSize);

    return true;
  }
}