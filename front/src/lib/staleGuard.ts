// エフェクト内の非同期処理向けのガード。cancel（クリーンアップ）後に届いた
// 古いレスポンスを無視するため、コールバックをfreshで包んで使う
export function staleGuard() {
  let stale = false;
  return {
    fresh:
      <T>(fn: (v: T) => void) =>
      (v: T) => {
        if (!stale) fn(v);
      },
    cancel: () => {
      stale = true;
    },
  };
}
