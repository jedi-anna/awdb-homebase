import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken } from "@/lib/buffer";

// Photos are uploaded straight from the browser to Vercel Blob so Buffer gets
// a public link it can attach. Only signed-in users can upload, only images,
// and files expire on their own after the post has had time to go out.

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        if (!(await getAccessToken())) throw new Error("Connect Buffer before uploading a photo.");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
          ttlDays: 60,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
