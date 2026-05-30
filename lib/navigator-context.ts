import type {NavigatorContext} from '@coveo/headless-react/ssr';
import {cookies, headers} from 'next/headers';

// Cookie that stores a stable Coveo client (visitor) id across requests.
// It is set by middleware.ts so analytics events correlate per visitor.
export const CLIENT_ID_COOKIE = 'coveo_visitorId';

type RequestHeaders = ReturnType<typeof headers>;

// Builds the navigator context from the incoming Next.js request so that
// referrer, user agent, IP, and client id are forwarded to the Coveo APIs
// during server-side rendering.
export class NextJsNavigatorContext implements NavigatorContext {
  constructor(private readonly requestHeaders: RequestHeaders) {}

  get referrer(): string | null {
    return (
      this.requestHeaders.get('referer') ??
      this.requestHeaders.get('referrer')
    );
  }

  get userAgent(): string | null {
    return this.requestHeaders.get('user-agent');
  }

  get location(): string | null {
    return this.referrer;
  }

  get forwardedFor(): string | undefined {
    return this.requestHeaders.get('x-forwarded-for') ?? undefined;
  }

  get clientId(): string {
    return cookies().get(CLIENT_ID_COOKIE)?.value ?? '';
  }
}
