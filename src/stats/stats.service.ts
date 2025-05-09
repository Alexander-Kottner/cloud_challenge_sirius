import { Injectable, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { log } from 'console';

@Injectable()
export class StatsService {
  constructor(private readonly usersService: UsersService) {}

  async getDailyUsageStats(userId: string) {
    const isAdmin = await this.usersService.isAdmin(userId);

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    const stats = await this.usersService.getDailyUsageStats();
    
    // Format data for the response
    return stats.map(stat => ({
      username: stat.user.username,
      usageBytes: Number(stat.usageBytes),
      usageMB: Number(stat.usageBytes) / (1024 * 1024),
    }));
  }
}