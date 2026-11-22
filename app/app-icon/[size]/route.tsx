import { ImageResponse } from "next/og";
import { PactaIconArt } from "../../pacta-icon-art";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return ["192", "512", "180"].map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const pixels = Number((await params).size);
  return new ImageResponse(<PactaIconArt />, { width: pixels, height: pixels });
}
