import type { Ticket } from '../api/client';

// チケット一覧のソート指定。keyは 'id' | 'updated'
export type SortSpec = { key: string; desc: boolean };

// 未指定時は従来どおり更新日時の降順
export const DEFAULT_SORT: SortSpec = { key: 'updated', desc: true };

// URLの sort パラメータ（例: "id", "-id"）を解釈する。先頭 "-" は降順
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

// updated_atはRFC3339形式（同一サーバー生成でオフセットが揃う）のため辞書順で比較できる
function sortValue(ticket: Ticket, key: string): number | string {
  return key === 'id' ? ticket.id : ticket.updated_at;
}

export function sortTickets(tickets: Ticket[], spec: SortSpec): Ticket[] {
  const dir = spec.desc ? -1 : 1;
  return [...tickets].sort((a, b) => {
    const va = sortValue(a, spec.key);
    const vb = sortValue(b, spec.key);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}
