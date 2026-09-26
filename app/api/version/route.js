export const dynamic = "force-dynamic";

export async function GET() {
  const id = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "";
  return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
