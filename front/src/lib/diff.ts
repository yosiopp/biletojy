// 履歴のバージョン間比較に使う行単位の差分
export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string };

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // 編集は局所的なことが多いため、共通の先頭・末尾を除いてからLCSを計算する
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [
    ...a.slice(0, start).map((text): DiffLine => ({ kind: 'same', text })),
    ...diffMiddle(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map((text): DiffLine => ({ kind: 'same', text })),
  ];
}

export function hasDiff(lines: DiffLine[]): boolean {
  return lines.some((line) => line.kind !== 'same');
}

// LCS（最長共通部分列）で変更部分の差分行を組み立てる
function diffMiddle(a: string[], b: string[]): DiffLine[] {
  const del = (text: string): DiffLine => ({ kind: 'del', text });
  const add = (text: string): DiffLine => ({ kind: 'add', text });
  // DPテーブルが大きくなりすぎる場合はLCSを諦めて全削除+全追加にする
  if (a.length * b.length > 1_000_000) {
    return [...a.map(del), ...b.map(add)];
  }
  // dp[i * w + j] = a[i:] と b[j:] のLCS長
  const w = b.length + 1;
  const dp = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      lines.push(del(a[i]));
      i++;
    } else {
      lines.push(add(b[j]));
      j++;
    }
  }
  while (i < a.length) lines.push(del(a[i++]));
  while (j < b.length) lines.push(add(b[j++]));
  return lines;
}
