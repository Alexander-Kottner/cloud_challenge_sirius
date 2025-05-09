import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Param, 
  UseGuards, 
  UseInterceptors, 
  UploadedFile,
  StreamableFile,
  Res
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FilesService } from './files.service';
import { FileResponseDto } from './dto/file.dto';
import { 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse, 
  ApiTags, 
  ApiParam,
  ApiConsumes,
  ApiBody
} from '@nestjs/swagger';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file to storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File successfully uploaded', type: FileResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { sub: string },
  ): Promise<FileResponseDto> {
    return this.filesService.uploadFile(file, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Get all files for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of user files', type: [FileResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserFiles(@CurrentUser() user: { sub: string }): Promise<FileResponseDto[]> {
    return this.filesService.getUserFiles(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file information by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'Returns file information', type: FileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<FileResponseDto> {
    return this.filesService.getFile(id, user.sub);
  }

  @Get('download/:id')
  @ApiOperation({ summary: 'Download a file by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File download stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.filesService.getFileForDownload(id, user.sub);
    
    response.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': file.size,
    });
    
    file.stream.pipe(response);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiResponse({ status: 200, description: 'File successfully deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<{ success: boolean }> {
    const success = await this.filesService.deleteFile(id, user.sub);
    return { success };
  }
}