/**
 * 배포 뒤 옛 스크립트 파일(_next/static/chunks)을 못 찾는 오류(ChunkLoadError) 자동 복구.
 *
 * 배포 전에 열어 둔 탭은 옛 빌드의 파일 목록을 기억하고 있어서, 배포로 그 파일이 바뀌거나 지워진 뒤
 * 화면을 이동하면 파일을 못 찾아 에러 화면이 뜬다. 새로고침 한 번이면 새 빌드로 정상 표시되므로
 * app/error.tsx · app/global-error.tsx 에서 이 오류일 때 자동으로 한 번 새로고침한다.
 * 같은 주소에서 30초 안에 또 실패하면(새로고침해도 안 되는 경우) 반복하지 않고 에러 화면을 그대로 보여준다.
 */
const STORAGE_KEY = "woollim_chunk_reload";
const RETRY_WINDOW_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.name === "ChunkLoadError") return true;
  return typeof e.message === "string" && /Failed to load chunk|Loading chunk .+ failed|dynamically imported module/i.test(e.message);
}

/** 새로고침을 시작했으면 true. 방금 같은 주소에서 이미 새로고침했거나 sessionStorage 를 못 쓰면 false */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as { path?: string; at?: number } | null;
    if (last?.path === window.location.pathname && Date.now() - (last.at ?? 0) < RETRY_WINDOW_MS) return false;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path: window.location.pathname, at: Date.now() }));
  } catch {
    return false; // 기록을 못 남기면 무한 새로고침을 막을 수 없으므로 자동 새로고침은 하지 않는다
  }
  window.location.reload();
  return true;
}
