import { NextResponse } from 'next/server';

/**
 * Next.js API route handler that proxies to Express admin endpoint
 */
export async function GET() {
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${baseUrl}/admin/content/museums`, {
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Error proxying to Express API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch museums' },
      { status: 500 }
    );
  }
}
