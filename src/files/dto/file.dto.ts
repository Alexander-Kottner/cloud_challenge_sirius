import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({
    description: 'Optional description of the file',
    required: false,
    example: 'My vacation photo'
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class FileResponseDto {
  @ApiProperty({
    description: 'Unique file identifier',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  id: string;

  @ApiProperty({
    description: 'Name of the file in storage',
    example: '550e8400-e29b-41d4-a716-446655440000.jpg'
  })
  name: string;

  @ApiProperty({
    description: 'Original name of the file',
    example: 'vacation.jpg'
  })
  originalName: string;

  @ApiProperty({
    description: 'Size of file in bytes',
    example: 1024000
  })
  size: number;

  @ApiProperty({
    description: 'Date and time when the file was uploaded',
    example: '2025-05-05T12:00:00Z'
  })
  uploadedAt: Date;

  @ApiProperty({
    description: 'URL to access the file',
    example: 'https://storage.example.com/files/550e8400-e29b-41d4-a716-446655440000.jpg'
  })
  url: string;
}