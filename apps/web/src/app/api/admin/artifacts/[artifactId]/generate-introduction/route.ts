import { NextRequest } from 'next/server';
import { proxyAdminRequest } from '../../../createProxyRoute';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await params;
  return proxyAdminRequest(
    req,
    `/admin/artifacts/${artifactId}/generate-introduction`,
    'artifact introduction generation'
  );
}
