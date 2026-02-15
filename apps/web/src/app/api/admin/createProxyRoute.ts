import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (user.role !== 'ADMIN') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true as const, user };
}

function buildTargetUrl(baseUrl: string, endpoint: string, req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return `${baseUrl}${endpoint}${qs ? `?${qs}` : ''}`;
}

export async function proxyAdminRequest(
  req: NextRequest,
  endpoint: string,
  entityName: string
) {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const token = process.env.API_INTERNAL_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Server missing API_INTERNAL_TOKEN' },
      { status: 500 }
    );
  }

  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  try {
    const targetUrl = buildTargetUrl(baseUrl, endpoint, req);
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await req.text();

    const res = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-token': token,
        'x-actor-user-id': auth.user.id,
      },
      body,
      cache: 'no-store',
    });

    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const normalized =
      isJson && text.trim().length > 0 ? JSON.stringify(JSON.parse(text)) : text;
    return new NextResponse(normalized, {
      status: res.status,
      headers: {
        'Content-Type': isJson ? 'application/json' : contentType || 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error proxying to Express API:', error);
    return NextResponse.json(
      { error: `Failed to fetch ${entityName}` },
      { status: 500 }
    );
  }
}

export function createProxyRoute(endpoint: string, entityName: string) {
  return async function GET(req: NextRequest) {
    return proxyAdminRequest(req, endpoint, entityName);
  };
}
