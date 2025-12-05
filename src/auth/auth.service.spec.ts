import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { AuthUser } from '@gm-be/shared';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@gm-be/shared/roles/user.roles';
import { CreateAuthUserDto } from '@gm-be/shared/dto/create-auth-user.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userModel: jest.Mocked<Model<AuthUser>>;
  let jwtService: JwtService;

  const mockUser: Partial<AuthUser> = {
    username: 'testuser',
    password: 'hashed_password',
    role: UserRole.Staff,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(AuthUser.name),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(), // Mock create method
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userModel = module.get(getModelToken(AuthUser.name));
    jwtService = module.get<JwtService>(JwtService);

    jest.restoreAllMocks(); // Reset all mocks between tests
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('register', () => {
    it('should hash the password, save the auth user, and return the userId with JWT', async () => {
      const registerDto: CreateAuthUserDto = {
        userId: "23234",
        username: 'testuser',
        password: 'password123',
        role: UserRole.Staff,
      };
      const hashedPassword = 'hashed_password';

      const mockAuthUser = {
        _id: 'user123',
        username: registerDto.username,
        password: hashedPassword,
        role: registerDto.role,
        toObject: jest.fn().mockReturnValue({
          username: registerDto.username,
          role: registerDto.role,
        }),
      };

      const mockJwt = 'mock-jwt-token';

      jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce(hashedPassword);
      userModel.create.mockResolvedValueOnce(mockAuthUser as any);
      jest.spyOn(jwtService, 'sign').mockReturnValueOnce(mockJwt);

      const result = await authService.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(userModel.create).toHaveBeenCalledWith({
        username: registerDto.username,
        password: hashedPassword,
        role: registerDto.role,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockAuthUser._id,
        role: registerDto.role,
      });
      expect(result).toEqual(
        expect.objectContaining({
          userId: mockAuthUser._id.toString(),
          jwt: mockJwt,
        })
      );
    });
  });

  describe('validateUser', () => {
    it('should return the user if username and password match', async () => {
      const authUser = {
        username: 'testuser',
        password: 'hashed_password',
        role: 'staff',
        _id: 'user123', // Mock the unique identifier
        toObject: jest.fn().mockReturnValue({
          username: 'testuser',
          role: 'staff',
        }),
      };

      userModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(authUser),
      } as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);

      const result = await authService.validateUser('testuser', 'password123');

      // Assert the userModel is queried with the correct username
      expect(userModel.findOne).toHaveBeenCalledWith({ username: 'testuser' });

      // Ensure bcrypt.compare was called with the correct arguments
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');

      // Ensure the result matches the mocked `toObject` return value
      expect(result).toEqual(authUser.toObject());
    });

    it('should throw an UnauthorizedException if username or password is incorrect', async () => {
      userModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        authService.validateUser('testuser', 'wrongpassword')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return an access token', async () => {
      const token = 'jwt_token';
      jest.spyOn(jwtService, 'sign').mockReturnValueOnce(token);

      const result = await authService.login(mockUser as AuthUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        username: mockUser.username,
        sub: undefined,
        role: mockUser.role,
      });
      expect(result).toEqual({ access_token: token });
    });
  });
});
