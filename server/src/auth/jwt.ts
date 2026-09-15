import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { Principal } from './principal.js';

export function signToken(principal: Principal): string {
  // `expiresIn` accepts a number of seconds or an ms-style string (e.g. "12h");
  // @types/jsonwebtoken brands the string type, so cast the options object.
  const options = { expiresIn: config.jwtExpiresIn } as jwt.SignOptions;
  return jwt.sign(principal, config.jwtSecret, options);
}

export function verifyToken(token: string): Principal {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & Principal;
  return {
    sub: decoded.sub as string,
    kind: decoded.kind,
    role: decoded.role,
    email: decoded.email,
    name: decoded.name,
  };
}
