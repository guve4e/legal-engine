import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Extract token from Authorization header
      ignoreExpiration: false, // Reject expired tokens
      secretOrKey: process.env['JWT_SECRET'] || 'yourSecretKey', // Replace 'yourSecretKey' with your actual secret
    });
  }

  async validate(payload: any) {
    // Attach the payload (decoded token) to the request object
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
