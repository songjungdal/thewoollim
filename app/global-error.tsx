"use client";

/**
 * Root layout 에서 발생한 예외 fallback.
 *  - layout.tsx / template.tsx 자체 에러를 캐치
 *  - app/error.tsx 보다 상위 — 자체 <html>/<body> 정의 필수
 */

import { useEffect } from "react";
import { isChunkLoadError, reloadOnceForChunkError } from "./lib/chunkReload";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // 배포 전에 열어 둔 탭이 옛 스크립트 파일을 못 찾은 경우 — 새로고침이 필요 (app/lib/chunkReload.ts)
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[woollim] global error:", error);
    if (chunkError) reloadOnceForChunkError();
  }, [error, chunkError]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily:
            "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#f4f4f5",
          color: "#111",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "1.5rem",
            boxShadow: "0 20px 50px rgba(0,0,0,.08)",
            padding: "2rem 1.75rem",
            maxWidth: 480,
            width: "100%",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              letterSpacing: "-0.025em",
              marginBottom: "0.75rem",
            }}
          >
            일시적인 오류가 발생했습니다
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#6b7280",
              fontWeight: 500,
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            페이지를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          {error?.digest && (
            <p
              style={{
                fontSize: "0.6875rem",
                color: "#9ca3af",
                fontFamily: "ui-monospace, monospace",
                marginBottom: "1.25rem",
              }}
            >
              digest: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => (chunkError ? window.location.reload() : unstable_retry())}
            style={{
              width: "100%",
              background: "#111",
              color: "#fff",
              padding: "0.875rem",
              borderRadius: "0.75rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
