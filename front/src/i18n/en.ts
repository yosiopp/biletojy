import { ja } from './ja';

// 英語辞書。Record<keyof typeof ja, string> の型により ja.ts とのキーの過不足をコンパイルエラーで検出する。
// 値の {name} 形式のプレースホルダは t() の params で置換される
export const en: Record<keyof typeof ja, string> = {
  // 共通
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.create': 'Create',
  'common.update': 'Update',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.deleteAction': 'Delete',
  'common.close': 'Close',
  'common.loading': 'Loading...',
  'common.set': 'Set',
  'common.clear': 'Clear',
  'common.metaSeparator': ' · ',

  // ヘッダー
  'header.menu': 'Menu',
  'header.nav': 'Navigation',
  'header.theme': 'Theme',
  'header.themeTitle': 'Theme: {label} (Auto follows the OS setting)',
  'header.themeAuto': 'Auto',
  'header.themeLight': 'Light',
  'header.themeDark': 'Dark',
  'header.language': 'Language',
  'header.languageTitle': 'Language: {label} (Auto follows the browser setting)',
  'header.langAuto': 'Auto',
  'header.changeUserName': 'Change user name',
  'header.setUserName': 'Set user name',

  // レイアウト（ショートカットヘルプ・検索構文）
  'layout.shortcutNewTicket': 'New ticket',
  'layout.shortcutNewTag': 'New tag',
  'layout.shortcutEditTicket': 'Edit ticket (on detail page)',
  'layout.shortcutTicketHistory': 'Ticket history (on detail page)',
  'layout.shortcutTicketList': 'Go to ticket list',
  'layout.shortcutFileList': 'Go to file list',
  'layout.shortcutTagList': 'Go to tag list',
  'layout.shortcutTemplateList': 'Go to template list',
  'layout.shortcutHelp': 'Show this help',
  'layout.syntaxNot': '-tag',
  'layout.syntaxNotDesc': 'Exclude the tag (NOT)',
  'layout.syntaxOr': 'tag|tag',
  'layout.syntaxOrDesc': 'Match any of them (OR)',
  'layout.syntaxDate': 'date@:>=…',
  'layout.syntaxDateDesc': 'Range-filter a date tag with comparison operators',
  'layout.syntaxNumber': 'number#:>=…',
  'layout.syntaxNumberDesc': 'Range-filter a number tag with comparison operators',
  'layout.shortcutsButton': 'Keyboard shortcuts',
  'layout.shortcutsButtonTitle': 'Keyboard shortcuts (?)',
  'layout.shortcutsTitle': 'Keyboard shortcuts',
  'layout.searchSyntax': 'Search syntax',

  // ユーザ名設定ダイアログ
  'userName.title': 'Set user name',
  'userName.description':
    'Recorded as the author of tickets and comments. If left unset, "anonymous" is recorded instead.',
  'userName.placeholder': 'User name',
  'userName.later': 'Later',

  // タグチップ
  'tagItem.overdue': 'Overdue',
  'tagItem.dueSoon': 'Due within 3 days',

  // ファイル添付
  'attachFile.button': 'Attach file',
  'attachFile.uploading': 'Uploading...',

  // 履歴共通（チケット履歴・コメント履歴）
  'history.latest': '(latest)',
  'history.restoreThis': 'Restore this version',
  'history.restoreMessage': 'Restore the content of v{version}? (It will be saved as a new version)',
  'history.restoreAction': 'Restore',

  // コメント履歴
  'commentHistory.restoreTitle': 'Restore comment to a previous version',

  // チケットのエクスポート/インポート
  'exportImport.selectJson': 'Select an exported JSON file',
  'exportImport.exportJson': 'Export JSON',
  'exportImport.exportMarkdown': 'Export Markdown',
  'exportImport.importJson': 'Import JSON...',
  'exportImport.label': 'Export / Import',
  'exportImport.importing': 'Importing...',

  // タグのエクスポート/インポート/デフォルト復元
  'tagCatalogMenu.selectJson': 'Select an exported tag JSON file',
  'tagCatalogMenu.importTitle': 'Import tags',
  'tagCatalogMenu.importMessage':
    'Import {count} tags.\nExisting tags with the same name will be skipped.\nProceed?',
  'tagCatalogMenu.importAction': 'Import',
  'tagCatalogMenu.importDone': 'Imported {imported} tags ({skipped} skipped)',
  'tagCatalogMenu.restoreTitle': 'Restore default tags',
  'tagCatalogMenu.restoreMessage':
    'Add the missing default tags.\nExisting tags (name, color, order) will not be changed.\nProceed?',
  'tagCatalogMenu.restoreAction': 'Restore',
  'tagCatalogMenu.restoreDone': 'Restored {count} default tags',
  'tagCatalogMenu.export': 'Export',
  'tagCatalogMenu.import': 'Import...',
  'tagCatalogMenu.busy': 'Processing...',
  'tagCatalogMenu.label': 'Export / import tags',

  // 絞り込み・全文検索バー
  'tagFilter.placeholder': 'Tags or full-text search',
  'tagFilter.filterLabel': 'Filter:',
  'tagFilter.hierarchy': 'Hierarchy',
  'tagFilter.not': 'Exclude',
  'tagFilter.fullText': 'Full text',

  // タググループ選択
  'tagGroupSelect.exclude': 'Exclude (not matching)',

  // タグ入力
  'tagInput.placeholder': 'Add a tag (press Enter to confirm)',
  'tagInput.candidates': 'Tag suggestions',

  // 日時・数値タグの値入力
  'tagRangeInput.add': 'Add',

  // ボード表示
  'ticketBoard.none': 'None',

  // チケット参照補完
  'ticketRef.searching': 'Searching...',
  'ticketRef.noMatch': 'No matching tickets',
  'ticketRef.candidates': 'Ticket reference suggestions',

  // ツリー表示
  'ticketTree.unclassified': 'Unclassified',
  'ticketTree.label': 'Ticket tree',

  // 表示モード
  'viewMode.list': 'List',
  'viewMode.tree': 'Tree',
  'viewMode.board': 'Board',
  'viewModeSelect.all': 'All',
  'viewModeSelect.none': 'None',
  'viewModeSelect.target': 'Target',
  'viewModeSelect.selectTarget': 'Select target for {label}',
  'viewModeSelect.label': 'View mode',

  // 保存済みビュー
  'viewSelect.chipLabel': 'View',
  'viewSelect.currentTitle': 'View "{name}"',
  'viewSelect.saveTitle': 'Save current conditions as a view',
  'viewSelect.applyTitle': 'Apply a saved view',
  'viewSelect.saveNew': '+ Save',
  'viewSelect.select': 'Select',
  'viewSelect.empty': 'No saved views',
  'viewSelect.namePlaceholder': 'Name the current conditions',
  'viewSelect.deleteView': 'Delete view "{name}"',
  'viewSelect.needCondition': 'Set search conditions to save a view',

  // エディタ表示モード
  'editorMode.edit': 'Edit',
  'editorMode.split': 'Both',
  'editorMode.preview': 'Preview',

  // JSONエクスポート読込
  'exportFile.invalidJson': 'Could not read the JSON file',

  // 未確定タグの保存ガード
  'pendingTagGuard.title': 'Unconfirmed tag input',
  'pendingTagGuard.message':
    '"{text}" in the tag input has not been confirmed as a tag and will be lost when saving. Save anyway?',
  'pendingTagGuard.saveAnyway': 'Save anyway',

  // ファイル一覧
  'fileList.title': 'Files',
  'fileList.add': '+ Add file',
  'fileList.referenced': 'Referenced',
  'fileList.historyOnly': 'History only',
  'fileList.noReference': 'Unreferenced',
  'fileList.deleteTitle': 'Delete file',
  'fileList.deleteReferencedMessage':
    'File "{name}" is referenced by tickets or comments.\nDeleting it will break those references (links and images).\nDelete it?',
  'fileList.deleteHistoryReferencedMessage':
    'File "{name}" is referenced by ticket or comment histories.\nDeleting it will break those references (links and images).\nDelete it?',
  'fileList.deleteMessage': 'Delete file "{name}"?',
  'fileList.headerName': 'File name',
  'fileList.headerSize': 'Size',
  'fileList.headerCreated': 'Added',
  'fileList.headerRef': 'References',
  'fileList.empty':
    'No attachments yet. Besides "+ Add file", you can also add files by pasting or dropping them into the ticket or comment editor.',
  'fileList.noName': '(no name)',
  'fileList.deleteAria': 'Delete file "{name}"',

  // タグ一覧
  'tagList.title': 'Tags',
  'tagList.new': '+ New tag',
  'tagList.newTitle': 'New tag',
  'tagList.editTitle': 'Edit tag',
  'tagList.fieldTag': 'Tag',
  'tagList.note': 'Description',
  'tagList.fieldColor': 'Color',
  'tagList.clearColor': 'No color',
  'tagList.renameTitle': 'Rename tag',
  'tagList.renameMessage': 'Rename the tag from "{from}" to "{to}".\n',
  'tagList.renameUsage': 'The tag will also be updated on all {count} tickets that use it.\n',
  'tagList.renameConfirm': 'Proceed?',
  'tagList.renameAction': 'Rename',
  'tagList.deleteTitle': 'Delete tag',
  'tagList.deleteMessage': 'Delete tag "{tag}"?',
  'tagList.deleteUsedMessage':
    'Tag "{tag}" is used by {count} tickets.\nAfter deletion, the tag text remains on the tickets, but features such as color and grouping are lost.\nDelete it?',
  'tagList.filterPlaceholder': 'Filter by tag name or description',
  'tagList.headerAttrs': 'Attributes',
  'tagList.attrGroup': 'Group',
  'tagList.attrNumber': 'Number',
  'tagList.attrDate': 'Date',
  'tagList.attrHierarchy': 'Hierarchy',
  'tagList.sortHint': 'Drag or press the up/down arrow keys to reorder',
  'tagList.sortAria': 'Reorder {tag}',
  'tagList.editAria': 'Edit {tag}',
  'tagList.deleteAria': 'Delete {tag}',
  'tagList.emptyFiltered': 'No matching tags',

  // テンプレート一覧
  'templateList.title': 'Templates',
  'templateList.new': '+ New template',
  'templateList.newTitle': 'New template',
  'templateList.editTitle': 'Edit template',
  'templateList.fieldName': 'Template name',
  'templateList.fieldTitle': 'Title',
  'templateList.fieldContent': 'Content',
  'templateList.fieldTags': 'Tags',
  'templateList.namePlaceholder': 'Bug report',
  'templateList.titlePlaceholder': '[Bug]',
  'templateList.contentPlaceholder': '## Steps to reproduce\n\n## Expected result\n\n## Actual result',
  'templateList.deleteTitle': 'Delete template',
  'templateList.deleteMessage': 'Delete template "{name}"?',
  'templateList.empty':
    'No templates yet. Create one with "+ New template" and you can select and apply it when creating a ticket.',
  'templateList.editAria': 'Edit template "{name}"',
  'templateList.deleteAria': 'Delete template "{name}"',

  // チケット詳細
  'ticketDetail.createdUpdated': 'created · updated',
  'ticketDetail.history': 'History',
  'ticketDetail.backlinks': 'Tickets referencing this ticket',
  'ticketDetail.comments': 'Comments',
  'ticketDetail.edited': 'edited (history)',
  'ticketDetail.commentPlaceholder':
    'Add a comment (markdown supported; paste/drop to attach images and files; # to reference tickets)',
  'ticketDetail.submitComment': 'Comment',

  // チケット作成・編集フォーム
  'ticketForm.newTitle': 'New ticket',
  'ticketForm.editTitle': 'Edit ticket #{id}',
  'ticketForm.template': 'Template',
  'ticketForm.noTemplate': 'None',
  'ticketForm.titlePlaceholder': 'Title',
  'ticketForm.titleRequired': 'Enter a title',
  'ticketForm.contentPlaceholder':
    'Content (markdown / mermaid supported; paste/drop to attach images and files; # to reference tickets)\n\n```mermaid\ngraph TD; A-->B;\n```',
  'ticketForm.tags': 'Tags',
  'ticketForm.applyTemplateTitle': 'Apply template',
  'ticketForm.applyTemplateMessage':
    'Replace the current input with the content of template "{name}". Are you sure?',
  'ticketForm.applyTemplateAction': 'Replace',
  'ticketForm.leaveTitle': 'Leave this page?',
  'ticketForm.leaveMessage': 'Your changes have not been saved. Leave this page?',
  'ticketForm.leaveAction': 'Leave',

  // チケット履歴
  'ticketHistory.heading': 'History of {title}',
  'ticketHistory.backToDetail': 'Back to detail',
  'ticketHistory.empty': 'No change history yet',
  'ticketHistory.headerOld': 'Old',
  'ticketHistory.headerNew': 'New',
  'ticketHistory.headerVersion': 'Ver.',
  'ticketHistory.headerDate': 'Date',
  'ticketHistory.headerUpdatedBy': 'Updated by',
  'ticketHistory.compareFrom': 'Compare from v{version}',
  'ticketHistory.compareTo': 'Compare to v{version}',
  'ticketHistory.diffHeading': 'Diff (v{old} → v{new})',
  'ticketHistory.noDiff': 'No differences between the selected versions',
  'ticketHistory.sectionTitle': 'Title',
  'ticketHistory.sectionTags': 'Tags',
  'ticketHistory.sectionContent': 'Content',
  'ticketHistory.restoreTitle': 'Restore ticket to a previous version',

  // チケット一覧
  'ticketList.title': 'Tickets',
  'ticketList.new': '+ New ticket',
  'ticketList.filters': 'Filters & view settings',
  'ticketList.filtersActive': '(active)',
  'ticketList.sort': 'Sort:',
  'ticketList.sortHierarchy': 'Hierarchy tag',
  'ticketList.desc': 'Descending',
  'ticketList.asc': 'Ascending',
  'ticketList.imported': 'Imported {count} tickets',
  'ticketList.selectGroup': 'Select a target tag group',
  'ticketList.emptyFiltered': 'No tickets match the conditions',
  'ticketList.clearFilters': 'Clear conditions',
  'ticketList.empty': 'No tickets yet',
  'ticketList.createNew': 'Create a new ticket',
};
