import { splitTags } from './tags';

// 保存済み検索（ビュー）。チケット一覧の検索条件（q + tags）に名前を付けてlocalStorageへ保存する
export type SavedView = {
  name: string;
  q: string;
  tags: string[];
};

const VIEWS_KEY = 'biletojy.views';

export function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 手編集などで壊れたエントリは読み飛ばす
    return parsed.filter(
      (v): v is SavedView =>
        v != null &&
        typeof v.name === 'string' &&
        typeof v.q === 'string' &&
        Array.isArray(v.tags) &&
        v.tags.every((t: unknown) => typeof t === 'string'),
    );
  } catch {
    return [];
  }
}

// 同名のビューは同じ位置で上書きする
export function saveView(view: SavedView): SavedView[] {
  const views = loadViews();
  const index = views.findIndex((v) => v.name === view.name);
  if (index >= 0) views[index] = view;
  else views.push(view);
  localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  return views;
}

export function deleteView(name: string): SavedView[] {
  const views = loadViews().filter((v) => v.name !== name);
  localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  return views;
}

// 現在の検索条件がビューと一致するか（タグ・検索ワードとも順不同で比較）
export function matchesView(view: SavedView, q: string, tags: string[]): boolean {
  const words = (s: string) => splitTags(s).sort().join(' ');
  const conds = (a: string[]) => [...a].sort().join(',');
  return words(view.q) === words(q) && conds(view.tags) === conds(tags);
}
