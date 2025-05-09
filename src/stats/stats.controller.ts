import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { log } from 'console';

@ApiTags('stats')
@Controller('stats')
@UseGuards(JwtAuthGuard, AdminGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get daily usage statistics',
    description: 'Retrieves daily usage statistics for all users. Accessible only by admins.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Daily usage statistics retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'Username of the user'
          },
          usageBytes: {
            type: 'number',
            description: 'Storage usage in bytes'
          },
          usageMB: {
            type: 'number',
            description: 'Storage usage in megabytes'
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not an admin' })
  async getDailyUsageStats(
    @CurrentUser() user: { sub: string },
  ) {
    return this.statsService.getDailyUsageStats(user.sub);
  }
}