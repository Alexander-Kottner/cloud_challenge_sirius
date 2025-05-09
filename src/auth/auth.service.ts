import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';
import { log } from 'console';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { username, password } = registerDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new UnauthorizedException('Username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Calculate initial quota reset date (one month from now)
    const currentDate = new Date();
    const initialResetDate = this.addOneMonth(currentDate);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nextQuotaResetDate: initialResetDate,
      },
    });

    return {
      id: user.id,
      username: user.username,
    };
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT
    const payload = { sub: user.id, username: user.username, isAdmin: user.isAdmin };
    
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // Helper function to calculate next reset date
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