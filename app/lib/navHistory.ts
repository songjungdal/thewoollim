/**
 * 사이트 안 이동 기록 — 파티 상세 [이전으로 돌아가기]와 메인 화면 되살리기(app/HomeClient.tsx)에 쓴다.
 *
 *  - app/components/NavigationTracker.tsx 가 주소(pathname)가 바뀔 때마다 noteNavigation 을 부른다.
 *  - 브라우저 뒤로/앞으로(popstate)로 바뀐 이동은 "pop"(돌아옴), 링크·router.push 는 "push"로 기록한다.
 *  - 모듈 변수라 새로고침·직접 접속하면 처음부터 다시 센다.
 */

let lastPath: string | null = null;
let inAppMoves = 0;
/** 방금 popstate 로 바뀐 주소 — 다음 noteNavigation 이 같은 주소면 "pop" */
let popTarget: string | null = null;
let lastMove: "initial" | "push" | "pop" = "initial";

/** trailingSlash 설정 때문에 "/party/57/" 와 "/party/57" 가 섞이지 않게 끝 "/" 를 뗀다 */
const normalize = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { popTarget = normalize(window.location.pathname); });
}

export function noteNavigation(pathname: string) {
  const p = normalize(pathname);
  if (lastPath === null) { lastPath = p; return; }
  if (p === lastPath) return;   // #해시만 바뀐 이동은 세지 않는다
  inAppMoves += 1;
  lastMove = popTarget === p ? "pop" : "push";
  popTarget = null;
  lastPath = p;
}

/** 지금 화면에 뒤로가기(브라우저 뒤로/router.back)로 돌아왔는지 */
export const cameBackHere = () => lastMove === "pop";

/**
 * 뒤로 가도 사이트 안에 머무는지. 지원하는 브라우저(Navigation API)는 같은 사이트 기록 위치로 정확히 판단하고,
 * 아니면 이번 접속에서 사이트 안 이동이 한 번이라도 있었는지로 판단한다.
 */
export function canGoBackInSite(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as Window & { navigation?: { currentEntry?: { index: number } | null } }).navigation;
  const index = nav?.currentEntry?.index;
  if (typeof index === "number") return index > 0;
  return inAppMoves > 0;
}
