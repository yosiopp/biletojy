import { useEffect, useState } from 'react';
import { api, Tag } from '../api/client';

// タグカタログをマウント時に一度だけ取得する
// タグの色付け・選択肢の表示にしか使わないため、失敗しても画面表示は妨げない
export function useCatalog(): Tag[] {
  const [catalog, setCatalog] = useState<Tag[]>([]);
  useEffect(() => {
    api.listTags().then(setCatalog).catch(() => {});
  }, []);
  return catalog;
}
