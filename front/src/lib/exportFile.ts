// エクスポートしたJSONファイルの読み取り（チケット・タグカタログのインポートで共用）。
// エクスポートの形式（{key: [...]}）と配列のみのどちらも受け付ける。
// JSONとして壊れている・空・要素がオブジェクトでない（タグ名だけの配列など）場合は
// 表示言語のメッセージのErrorをthrowする（サーバー側のデコードエラーがそのまま出るのを防ぐ）
import { t } from '../i18n';

export async function readJsonExport<T>(file: File, key: string, emptyMessage: string): Promise<T[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(t('exportFile.invalidJson'));
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(list) || list.length === 0 || !list.every((item) => typeof item === 'object' && item != null)) {
    throw new Error(emptyMessage);
  }
  return list as T[];
}
