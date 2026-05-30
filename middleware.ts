import {NextResponse, type NextRequest} from 'next/server';
import {CLIENT_ID_COOKIE} from './lib/navigator-context';

// Assigns a stable Coveo client (visitor) id cookie on first visit so that
// server-rendered and client-side analytics events share the same identity.
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(CLIENT_ID_COOKIE)) {
    response.cookies.set(CLIENT_ID_COOKIE, crypto.randomUUID(), {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
