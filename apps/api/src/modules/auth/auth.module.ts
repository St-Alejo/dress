import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Res, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '@vestirse/shared-types';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { AUTH_COOKIE, CurrentRequester, type JwtPayload, type Requester } from '../../common/requester';

class CredentialsDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

/** Cuenta opcional: todo el probador funciona sin iniciar sesión (sección 9). */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: CredentialsDto, requester: Requester) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('ese correo ya tiene cuenta');
    const user = await this.prisma.user.create({ data: { email, passwordHash: await argon2.hash(dto.password) } });
    await this.claimAnonymousSessions(user.id, requester.sid);
    return user;
  }

  async login(dto: CredentialsDto, requester: Requester) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) throw new UnauthorizedException('credenciales inválidas');
    await this.claimAnonymousSessions(user.id, requester.sid);
    return user;
  }

  async me(userId: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? { id: u.id, email: u.email, role: u.role, retrainingConsent: u.retrainingConsent } : null;
  }

  token(user: { id: string; role: 'user' | 'admin' }) {
    return this.jwt.sign({ sub: user.id, role: user.role } satisfies JwtPayload);
  }

  /** Las pruebas hechas como invitado pasan a la cuenta al iniciar sesión. */
  private async claimAnonymousSessions(userId: string, sid: string) {
    await this.prisma.tryOnSession.updateMany({ where: { ownerSid: sid, userId: null }, data: { userId } });
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: CredentialsDto, @CurrentRequester() r: Requester, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto, r);
    this.setCookie(res, this.auth.token(user));
    return this.auth.me(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: CredentialsDto, @CurrentRequester() r: Requester, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(dto, r);
    this.setCookie(res, this.auth.token(user));
    return this.auth.me(user.id);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE);
  }

  @Get('me')
  async me(@CurrentRequester() r: Requester) {
    return r.userId ? await this.auth.me(r.userId) : null;
  }

  private setCookie(res: Response, token: string) {
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
