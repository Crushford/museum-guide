import { NextRequest } from 'next/server';
import { proxyAdminRequest } from '../../createProxyRoute';

export async function GET(req: NextRequest) {
  return proxyAdminRequest(req, '/admin/openai-usage/daily', 'daily openai usage');
}

