// Server-side Google OAuth code→token exchange (ported from handle_oauth_callback
// in streamlit_app/modules/auth.py). Runs on the server so the client secret is
// never exposed to the browser. Works as a Vercel serverless function.

import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

/** Decode a JWT payload (no verification needed: token came directly from Google over HTTPS). */
function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const part = idToken.split('.')[1];
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

export async function POST(req: NextRequest) {
  try {
    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return NextResponse.json({ error: 'missing code or redirect_uri' }, { status: 400 });
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await resp.json();

    if (tokens.error) {
      return NextResponse.json(
        { error: `${tokens.error}: ${tokens.error_description ?? ''}` },
        { status: 400 }
      );
    }

    const info = decodeJwtPayload(tokens.id_token as string);
    return NextResponse.json({
      email: (info.email as string) ?? '',
      name: (info.name as string) || (info.email as string) || '',
      picture: (info.picture as string) ?? '',
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
