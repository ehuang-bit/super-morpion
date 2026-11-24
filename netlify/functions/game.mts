import type { Config } from '@netlify/functions';
import { handleGameRequest } from '../../server/gameHandler.js';

export const config: Config = {
  path: '/api/game/*',
};

export default async (req: Request): Promise<Response> => {
  return handleGameRequest(req);
};
