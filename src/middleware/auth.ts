import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthRequest extends Request {
  userAddress?: string;
  user?: {
    id: string;
    address: string;
  };
}

export const generateToken = (user: { id: string; address: string }) => {
  return jwt.sign({ id: user.id, address: user.address }, JWT_SECRET, { expiresIn: '30d' });
};

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { address: string; id: string };
    req.userAddress = decoded.address;
    req.user = {
      id: decoded.id,
      address: decoded.address,
    };
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};
