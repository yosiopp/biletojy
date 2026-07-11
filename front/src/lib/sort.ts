import type { Ticket } from '../api/client';
import { parseTag, splitTags } from './tags';

// チケット一覧のソート指定。keyは 'id' | 'updated' | HIERARCHY_SORT_KEY | 日時・数値タググループ名（例: 'due-date@', 'estimate#'）
export type SortSpec = { key: string; desc: boolean };

// 階層タグ（a/b/c 形式）のパス順ソートを表すキー。階層タグはグループを持たないため固定名にする
// （グループ名は ':' の左辺なので '/' 入りのタグ名とは衝突しない）
export const HIERARCHY_SORT_KEY = 'hierarchy';

// 未指定時は従来どおり更新日時の降順
export const DEFAULT_SORT: SortSpec = { key: 'updated', desc: true };

// URLの sort パラメータ（例: "id", "-id", "due-date@"）を解釈する。先頭 "-" は降順
export function parseSort(raw: string | null): SortSpec {
  if (!raw) return DEFAULT_SORT;
  const desc = raw.startsWith('-');
  const key = desc ? raw.slice(1) : raw;
  if (!key) return DEFAULT_SORT;
  return { key, desc };
}

// SortSpecをsortパラメータ値に戻す。デフォルトと同じならnull（パラメータを付けない）
export function buildSort(spec: SortSpec): string | null {
  if (spec.key === DEFAULT_SORT.key && spec.desc === DEFAULT_SORT.desc) return null;
  return (spec.desc ? '-' : '') + spec.key;
}

// タググループのソート値。数値タグは数値（"10" > "9" となるよう辞書順は使わない）、
// 日時タグは辞書順で比較できるISO形式文字列。比較できない値（"TBD" 等）しか無ければnull
function tagSortValue(tags: string, group: string): number | string | null {
  const prefix = `${group}:`;
  for (const tag of splitTags(tags)) {
    if (!tag.startsWith(prefix)) continue;
    const value = tag.slice(prefix.length);
    if (group.endsWith('#')) {
      if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    } else if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(value)) {
      return value;
    }
  }
  return null;
}

// 階層タグのソート値。単純な文字列比較だと "a/b-x" < "a/b/c" と順が崩れるため、
// "/" をどの文字よりも小さい "\x00" に置換し、辞書順比較がセグメント単位の比較になるようにする。
// 複数の階層タグを持つ場合は最小（先頭）のものを使う
function hierarchySortValue(tags: string): string | null {
  let min: string | null = null;
  for (const tag of splitTags(tags)) {
    if (!parseTag(tag).isHierarchy) continue;
    const value = tag.replaceAll('/', '\x00');
    if (min == null || value < min) min = value;
  }
  return min;
}

// updated_atはRFC3339形式（同一サーバー生成でオフセットが揃う）のため辞書順で比較できる
function sortValue(ticket: Ticket, key: string): number | string | null {
  if (key === 'id') return ticket.id;
  if (key === 'updated') return ticket.updated_at;
  if (key === HIERARCHY_SORT_KEY) return hierarchySortValue(ticket.tags);
  return tagSortValue(ticket.tags, key);
}

export function sortTickets(tickets: Ticket[], spec: SortSpec): Ticket[] {
  const dir = spec.desc ? -1 : 1;
  return [...tickets].sort((a, b) => {
    const va = sortValue(a, spec.key);
    const vb = sortValue(b, spec.key);
    // ソート対象のタグを持たないチケットは昇順・降順に関わらず末尾に置く
    if (va == null || vb == null) {
      return (va == null ? 1 : 0) - (vb == null ? 1 : 0);
    }
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}
