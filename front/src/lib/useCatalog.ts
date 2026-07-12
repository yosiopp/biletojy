import { useEffect, useMemo, useState } from 'react';
import { api, Tag } from '../api/client';
import { buildTagColorMap, TagColorMap } from './tags';

// 画面遷移（一覧→詳細→編集など）のたびに /api/tags を取り直さないよう、
// 初回フェッチのPromiseをモジュールレベルで共有する
let cache: Promise<Tag[]> | null = null;

function fetchCatalog(): Promise<Tag[]> {
  if (cache == null) {
    cache = api.listTags().catch((e: unknown) => {
      // 失敗したPromiseを持ち続けると以後ずっと空のままになるため、次回また取得する
      cache = null;
      throw e;
    });
  }
  return cache;
}

// タグ編集（TagList）などでカタログが変わったときに呼ぶ。次のマウントで取得し直す
export function invalidateCatalog() {
  cache = null;
}

// タグ名→表示色のMap。各タグ表示でカタログを線形探索しないよう、カタログが変わったときだけ構築する
// （カタログをpropsで受け取るコンポーネントでも使えるよう引数で渡す）
export function useTagColors(catalog: Tag[]): TagColorMap {
  return useMemo(() => buildTagColorMap(catalog), [catalog]);
}

// タグカタログを取得する（共有キャッシュ付き）
// タグの色付け・選択肢の表示にしか使わないため、失敗しても画面表示は妨げない
export function useCatalog(): Tag[] {
  const [catalog, setCatalog] = useState<Tag[]>([]);
  useEffect(() => {
    let stale = false;
    fetchCatalog()
      .then((tags) => {
        if (!stale) setCatalog(tags);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, []);
  return catalog;
}
