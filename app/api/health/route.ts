import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'proofmesh',
    integrations: {
      calleMode: process.env.CALLE_MODE ?? 'mock',
      calleApiKeyConfigured: Boolean(process.env.CALLE_API_KEY?.trim()),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    },
  });
}
