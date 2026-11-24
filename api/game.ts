import { metric } from '@vercel/functions';
import { handleGameRequest } from '../server/gameHandler.js';

function classifyRoute(req: Request): string {
  const url = new URL(req.url);
  let subPath = url.pathname.replace(/^\/api\/game/, '') || '/';
  const rewritten = url.searchParams.get('__subpath');
  if ((subPath === '/' || subPath === '') && rewritten !== null) {
    subPath = rewritten.startsWith('/') ? rewritten : `/${rewritten}`;
  }
  if (subPath === '/health') return 'health';
  if (subPath === '/lobby') return 'lobby';
  if (subPath === '/leaderboard') return 'leaderboard';
  if (subPath === '/profile' || subPath === '/stats') return 'profile';
  if (subPath.startsWith('/auth/')) return 'auth';
  if (subPath.startsWith('/rooms')) return 'rooms';
  if (subPath.startsWith('/tournaments')) return 'tournaments';
  if (subPath.startsWith('/matchmaking')) return 'matchmaking';
  return 'other';
}

async function dispatch(req: Request): Promise<Response> {
  const route = classifyRoute(req);
  const startedAt = performance.now();

  try {
    const res = await handleGameRequest(req);
    if (route !== 'health') {
      const outcome =
        res.status >= 500
          ? 'server_error'
          : res.status >= 400
            ? 'client_error'
            : 'ok';
      metric('game_api.requests', 1, { route, outcome });
      metric('game_api.duration_ms', performance.now() - startedAt, { route });
    }
    return res;
  } catch (err) {
    console.error('Vercel game API fatal error:', err);
    if (route !== 'health') {
      metric('game_api.requests', 1, { route, outcome: 'server_error' });
      metric('game_api.duration_ms', performance.now() - startedAt, { route });
    }
    return Response.json(
      { ok: false, error: 'Erreur serveur temporaire.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function PUT(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}
