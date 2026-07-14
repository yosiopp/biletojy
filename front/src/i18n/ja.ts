// 正とする辞書。キーは「ページ/機能.意味」で構造化する。
// 値の {name} 形式のプレースホルダは t() の params で置換される
export const ja = {
  // 共通
  'common.cancel': 'キャンセル',
  'common.save': '保存',
  'common.create': '作成',
  'common.update': '更新',
  'common.edit': '編集',
  'common.delete': '削除',
  'common.deleteAction': '削除する',
  'common.close': '閉じる',
  'common.loading': '読み込み中...',
  'common.set': '設定',
  'common.clear': 'クリア',
  // メタ情報の区切り（作成者 ・ 日時 など）。前後の空白も含む
  'common.metaSeparator': ' ・ ',

  // ヘッダー
  'header.menu': 'メニュー',
  'header.nav': 'ナビゲーション',
  'header.theme': '表示テーマ',
  'header.themeTitle': '表示テーマ: {label}（自動はOS設定に追随）',
  'header.themeAuto': '自動',
  'header.themeLight': 'ライト',
  'header.themeDark': 'ダーク',
  'header.language': '言語',
  'header.languageTitle': '言語: {label}（自動はブラウザ設定に追随）',
  'header.langAuto': '自動',
  'header.changeUserName': 'ユーザ名を変更',
  'header.setUserName': 'ユーザ名を設定',

  // レイアウト（ショートカットヘルプ・検索構文）
  'layout.shortcutNewTicket': 'チケット作成',
  'layout.shortcutNewTag': 'タグ作成',
  'layout.shortcutEditTicket': 'チケット編集（詳細表示中）',
  'layout.shortcutTicketHistory': 'チケット履歴（詳細表示中）',
  'layout.shortcutTicketList': 'チケット一覧へ移動',
  'layout.shortcutFileList': 'ファイル一覧へ移動',
  'layout.shortcutTagList': 'タグ一覧へ移動',
  'layout.shortcutTemplateList': 'テンプレート一覧へ移動',
  'layout.shortcutHelp': 'このヘルプを表示',
  'layout.syntaxNot': '-タグ',
  'layout.syntaxNotDesc': 'そのタグを除外（NOT）',
  'layout.syntaxOr': 'タグ|タグ',
  'layout.syntaxOrDesc': 'いずれかに一致（OR）',
  'layout.syntaxDate': '日時@:>=…',
  'layout.syntaxDateDesc': '日時タグを比較演算子で範囲指定',
  'layout.syntaxNumber': '数値#:>=…',
  'layout.syntaxNumberDesc': '数値タグを比較演算子で範囲指定',
  'layout.shortcutsButton': 'ショートカット一覧',
  'layout.shortcutsButtonTitle': 'ショートカット一覧（?）',
  'layout.shortcutsTitle': 'キーボードショートカット',
  'layout.searchSyntax': '検索構文',

  // ユーザ名設定ダイアログ
  'userName.title': 'ユーザ名の設定',
  'userName.description': 'チケットやコメントの作成者名として記録されます。未設定のままの場合は anonymous として記録されます。',
  'userName.placeholder': 'ユーザ名',
  'userName.later': 'あとで',

  // タグチップ
  'tagItem.overdue': '期限超過',
  'tagItem.dueSoon': '期限まで3日以内',

  // ファイル添付
  'attachFile.button': 'ファイルを添付',
  'attachFile.uploading': 'アップロード中...',

  // 履歴共通（チケット履歴・コメント履歴）
  'history.latest': '（最新）',
  'history.restoreThis': 'この版に戻す',
  'history.restoreMessage': 'v{version} の内容に戻しますか？（新しい版として保存されます）',
  'history.restoreAction': '戻す',

  // コメント履歴
  'commentHistory.restoreTitle': 'コメントを過去の版に戻す',

  // チケットのエクスポート/インポート
  'exportImport.selectJson': 'エクスポートしたJSONファイルを選択してください',
  'exportImport.exportJson': 'JSONエクスポート',
  'exportImport.exportMarkdown': 'Markdownエクスポート',
  'exportImport.importJson': 'JSONインポート...',
  'exportImport.label': 'エクスポート/インポート',
  'exportImport.importing': 'インポート中...',

  // タグのエクスポート/インポート/デフォルト復元
  'tagCatalogMenu.selectJson': 'エクスポートしたタグのJSONファイルを選択してください',
  'tagCatalogMenu.importTitle': 'タグのインポート',
  'tagCatalogMenu.importMessage': '{count}件のタグを取り込みます。\n同名の既存タグはスキップされます。\n取り込みますか？',
  'tagCatalogMenu.importAction': '取り込む',
  'tagCatalogMenu.importDone': '{imported}件のタグを登録しました（{skipped}件スキップ）',
  'tagCatalogMenu.restoreTitle': 'デフォルトタグの復元',
  'tagCatalogMenu.restoreMessage': '不足しているデフォルトのタグを追加します。\n既存のタグ（名前・色・並び順）は変更されません。\n復元しますか？',
  'tagCatalogMenu.restoreAction': '復元する',
  'tagCatalogMenu.restoreDone': '{count}件のデフォルトタグを復元しました',
  'tagCatalogMenu.export': 'エクスポート',
  'tagCatalogMenu.import': 'インポート...',
  'tagCatalogMenu.busy': '処理中...',
  'tagCatalogMenu.label': 'タグのエクスポート/インポート',

  // 絞り込み・全文検索バー
  'tagFilter.placeholder': 'タグまたは全文検索',
  'tagFilter.filterLabel': '絞り込み:',
  'tagFilter.hierarchy': '階層',
  'tagFilter.not': '除外',
  'tagFilter.fullText': '全文',

  // タググループ選択
  'tagGroupSelect.exclude': '除外（マッチしないもの）',

  // タグ入力
  'tagInput.placeholder': 'タグを追加（Enterで確定）',
  'tagInput.candidates': 'タグ候補',

  // 日時・数値タグの値入力
  'tagRangeInput.add': '追加',

  // ボード表示
  'ticketBoard.none': 'なし',

  // チケット参照補完
  'ticketRef.searching': '検索中...',
  'ticketRef.noMatch': '該当するチケットはありません',
  'ticketRef.candidates': 'チケット参照の候補',

  // ツリー表示
  'ticketTree.unclassified': '未分類',
  'ticketTree.label': 'チケットツリー',

  // 表示モード
  'viewMode.list': 'リスト',
  'viewMode.tree': 'ツリー',
  'viewMode.board': 'ボード',
  'viewModeSelect.all': 'すべて',
  'viewModeSelect.none': 'なし',
  'viewModeSelect.target': '対象',
  'viewModeSelect.selectTarget': '{label}の対象を選択',
  'viewModeSelect.label': '表示モード',

  // 保存済みビュー
  'viewSelect.chipLabel': 'ビュー',
  'viewSelect.currentTitle': 'ビュー「{name}」',
  'viewSelect.saveTitle': '現在の条件をビューとして保存',
  'viewSelect.applyTitle': '保存済みビューを適用',
  'viewSelect.saveNew': '+ 保存',
  'viewSelect.select': '選択',
  'viewSelect.empty': '保存済みのビューはありません',
  'viewSelect.namePlaceholder': '現在の条件に名前を付ける',
  'viewSelect.deleteView': 'ビュー「{name}」を削除',
  'viewSelect.needCondition': '検索条件を設定すると保存できます',

  // エディタ表示モード
  'editorMode.edit': '編集',
  'editorMode.split': '両方',
  'editorMode.preview': 'プレビュー',

  // JSONエクスポート読込
  'exportFile.invalidJson': 'JSONファイルを読み取れませんでした',

  // 未確定タグの保存ガード
  'pendingTagGuard.title': '未確定のタグ入力があります',
  'pendingTagGuard.message': 'タグ入力欄の「{text}」はまだタグとして確定されておらず、保存すると失われます。このまま保存しますか？',
  'pendingTagGuard.saveAnyway': 'このまま保存',

  // ファイル一覧
  'fileList.title': 'ファイル一覧',
  'fileList.add': '+ ファイル追加',
  'fileList.referenced': '参照あり',
  'fileList.historyOnly': '履歴のみ',
  'fileList.noReference': '参照なし',
  'fileList.deleteTitle': 'ファイルの削除',
  'fileList.deleteReferencedMessage': 'ファイル「{name}」はチケット・コメントから参照されています。\n削除するとチケットからの参照（リンク・画像）が切れます。\n削除しますか？',
  'fileList.deleteHistoryReferencedMessage': 'ファイル「{name}」はチケット・コメントの履歴から参照されています。\n削除するとチケットからの参照（リンク・画像）が切れます。\n削除しますか？',
  'fileList.deleteMessage': 'ファイル「{name}」を削除しますか？',
  'fileList.headerName': 'ファイル名',
  'fileList.headerSize': 'サイズ',
  'fileList.headerCreated': '追加日時',
  'fileList.headerRef': '参照',
  'fileList.empty': '添付ファイルはまだありません。「+ ファイル追加」のほか、チケット・コメントの編集エリアへの貼り付け・ドロップでも追加できます。',
  'fileList.noName': '(名前なし)',
  'fileList.deleteAria': 'ファイル「{name}」を削除',

  // タグ一覧
  'tagList.title': 'タグ一覧',
  'tagList.new': '+ 新規タグ',
  'tagList.newTitle': '新規タグ',
  'tagList.editTitle': 'タグの編集',
  'tagList.fieldTag': 'タグ',
  'tagList.note': '説明',
  'tagList.fieldColor': '色',
  'tagList.clearColor': '色なし',
  'tagList.renameTitle': 'タグ名の変更',
  'tagList.renameMessage': 'タグ名を「{from}」から「{to}」へ変更します。\n',
  'tagList.renameUsage': 'このタグを使用している {count} 件のチケットのタグも一括で変更されます。\n',
  'tagList.renameConfirm': '変更しますか？',
  'tagList.renameAction': '変更する',
  'tagList.deleteTitle': 'タグの削除',
  'tagList.deleteMessage': 'タグ「{tag}」を削除しますか？',
  'tagList.deleteUsedMessage': 'タグ「{tag}」は {count} 件のチケットで使用されています。\n削除してもチケット側のタグ表記は残りますが、色やグループなどの機能は失われます。\n削除しますか？',
  'tagList.filterPlaceholder': 'タグ名・説明で絞り込み',
  'tagList.headerAttrs': '属性',
  'tagList.attrGroup': 'グループ',
  'tagList.attrNumber': '数値',
  'tagList.attrDate': '日時',
  'tagList.attrHierarchy': '階層',
  'tagList.sortHint': 'ドラッグまたは↑↓キーで並び替え',
  'tagList.sortAria': '{tag} を並び替え',
  'tagList.editAria': '{tag} を編集',
  'tagList.deleteAria': '{tag} を削除',
  'tagList.emptyFiltered': '一致するタグがありません',

  // テンプレート一覧
  'templateList.title': 'テンプレート一覧',
  'templateList.new': '+ 新規テンプレート',
  'templateList.newTitle': '新規テンプレート',
  'templateList.editTitle': 'テンプレートの編集',
  'templateList.fieldName': 'テンプレート名',
  'templateList.fieldTitle': 'タイトル',
  'templateList.fieldContent': '本文',
  'templateList.fieldTags': 'タグ',
  'templateList.namePlaceholder': 'バグ報告',
  'templateList.titlePlaceholder': '【バグ】',
  'templateList.contentPlaceholder': '## 再現手順\n\n## 期待する結果\n\n## 実際の結果',
  'templateList.deleteTitle': 'テンプレートの削除',
  'templateList.deleteMessage': 'テンプレート「{name}」を削除しますか？',
  'templateList.empty': 'テンプレートはまだありません。「+ 新規テンプレート」から登録すると、チケット作成時に選択して適用できます。',
  'templateList.editAria': 'テンプレート「{name}」を編集',
  'templateList.deleteAria': 'テンプレート「{name}」を削除',

  // チケット詳細
  'ticketDetail.createdUpdated': 'が作成 ・ 更新',
  'ticketDetail.history': '履歴',
  'ticketDetail.backlinks': 'このチケットを参照しているチケット',
  'ticketDetail.comments': 'コメント',
  'ticketDetail.edited': '編集済み（履歴）',
  'ticketDetail.commentPlaceholder': 'コメントを追加（markdown可、画像・ファイル添付可（ペースト/ドロップ）、#でチケット参照）',
  'ticketDetail.submitComment': 'コメント',

  // チケット作成・編集フォーム
  'ticketForm.newTitle': 'チケット作成',
  'ticketForm.editTitle': 'チケット編集 #{id}',
  'ticketForm.template': 'テンプレート',
  'ticketForm.noTemplate': '選択なし',
  'ticketForm.titlePlaceholder': 'タイトル',
  'ticketForm.titleRequired': 'タイトルを入力してください',
  'ticketForm.contentPlaceholder': '本文（markdown / mermaid可、画像・ファイル添付可（ペースト/ドロップ）、#でチケット参照）\n\n```mermaid\ngraph TD; A-->B;\n```',
  'ticketForm.tags': 'タグ',
  'ticketForm.applyTemplateTitle': 'テンプレートの適用',
  'ticketForm.applyTemplateMessage': '入力中の内容をテンプレート「{name}」の内容で置き換えます。よろしいですか？',
  'ticketForm.applyTemplateAction': '置き換える',
  'ticketForm.leaveTitle': 'ページ離脱の確認',
  'ticketForm.leaveMessage': '編集中の内容は保存されていません。このページを離れますか？',
  'ticketForm.leaveAction': '離れる',

  // チケット履歴
  'ticketHistory.heading': '{title} の履歴',
  'ticketHistory.backToDetail': '詳細へ戻る',
  'ticketHistory.empty': '変更履歴はまだありません',
  'ticketHistory.headerOld': '旧',
  'ticketHistory.headerNew': '新',
  'ticketHistory.headerVersion': '版',
  'ticketHistory.headerDate': '日時',
  'ticketHistory.headerUpdatedBy': '更新者',
  'ticketHistory.compareFrom': 'v{version} を比較元にする',
  'ticketHistory.compareTo': 'v{version} を比較先にする',
  'ticketHistory.diffHeading': '差分（v{old} → v{new}）',
  'ticketHistory.noDiff': '選択した版の間に差分はありません',
  'ticketHistory.sectionTitle': 'タイトル',
  'ticketHistory.sectionTags': 'タグ',
  'ticketHistory.sectionContent': '本文',
  'ticketHistory.restoreTitle': 'チケットを過去の版に戻す',

  // チケット一覧
  'ticketList.title': 'チケット一覧',
  'ticketList.new': '+ 新規チケット',
  'ticketList.filters': '絞り込み・表示設定',
  'ticketList.filtersActive': '（適用中）',
  'ticketList.sort': '並び替え:',
  'ticketList.sortHierarchy': '階層タグ',
  'ticketList.desc': '降順',
  'ticketList.asc': '昇順',
  'ticketList.imported': '{count}件のチケットをインポートしました',
  'ticketList.selectGroup': '対象のタググループを選択してください',
  'ticketList.emptyFiltered': '条件に一致するチケットがありません',
  'ticketList.clearFilters': '条件をクリア',
  'ticketList.empty': 'チケットがありません',
  'ticketList.createNew': '新規チケットを作成',
} as const;
