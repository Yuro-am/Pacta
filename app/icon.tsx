import { CircleDollarSign } from "lucide-react";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{
      display: "flex",
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 19,
      background: "#6c46d9",
      color: "#fff",
    }}>
      <CircleDollarSign size={43} strokeWidth={2.3} color="#fff" />
    </div>,
    size,
  );
}
