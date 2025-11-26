import { Router } from 'express';

export const statusRoutes = Router();

const startTime = Date.now();

statusRoutes.get('/', (_req, res) => {
  const uptime = Date.now() - startTime;
  const uptimeSeconds = Math.floor(uptime / 1000);

  res.json({
    status: 'healthy',
    uptime: uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    service: 'lunark-ai',
    astreus: true,
  });
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
