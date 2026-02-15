import { NextRequest } from 'next/server';
import { proxyAdminRequest } from '../../../createProxyRoute';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  return proxyAdminRequest(req, `/admin/users/${userId}/role`, 'user role');
}
