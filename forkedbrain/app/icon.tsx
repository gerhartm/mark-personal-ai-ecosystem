import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#07111b",
          border: "1px solid #203340",
          borderRadius: 16,
          display: "flex",
          height: "64px",
          justifyContent: "center",
          position: "relative",
          width: "64px",
        }}
      >
        <div
          style={{
            border: "3px solid #edf5fb",
            borderRadius: "14px 5px 9px 16px",
            height: "38px",
            left: "14px",
            position: "absolute",
            top: "13px",
            width: "15px",
          }}
        />
        <div
          style={{
            border: "3px solid #edf5fb",
            borderRadius: "5px 14px 16px 9px",
            height: "38px",
            position: "absolute",
            right: "14px",
            top: "13px",
            width: "15px",
          }}
        />
        <div
          style={{
            background: "#34bad2",
            borderRadius: 999,
            height: "3px",
            position: "absolute",
            right: "4px",
            top: "23px",
            width: "15px",
          }}
        />
        <div
          style={{
            background: "#34bad2",
            borderRadius: 999,
            height: "7px",
            position: "absolute",
            right: "2px",
            top: "21px",
            width: "7px",
          }}
        />
      </div>
    ),
    size,
  );
}
