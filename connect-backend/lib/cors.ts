import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "./env";

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const { appOrigin } = getEnv();
    const a = new URL(appOrigin);
    const o = new URL(origin);
    if (o.origin === a.origin) return o.origin;
  } catch {
    /* env may be missing during build */
  }
  return null;
}

export function corsHeaders(req: NextRequest): HeadersInit {
  const origin = allowedOrigin(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const extra = corsHeaders(req);
  for (const [k, v] of Object.entries(extra)) {
    res.headers.set(k, v);
  }
  return res;
}

export function corsPreflight(req: NextRequest): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export function jsonCors(
  req: NextRequest,
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  return withCors(
    req,
    NextResponse.json(body, { status: init.status ?? 200 }),
  );
}
