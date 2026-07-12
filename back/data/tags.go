package data

import (
	"fmt"
	"strings"
	"unicode"
)

// タググループ(:を含む)、日時・数値タグ(グループ名末尾@/#)の属性をタグ名から導出する
func TagAttrs(name string) (isGroup, isRange bool) {
	sep := strings.Index(name, ":")
	isGroup = sep > 0
	isRange = isGroup && (strings.HasSuffix(name[:sep], "@") || strings.HasSuffix(name[:sep], "#"))
	return
}

// タグ名を検証し、問題があればエラーメッセージを返す。
// "," "|" 空白は検索構文（カンマ区切り・OR・タグのスペース区切り）のメタ文字、先頭 "-" はNOT指定と衝突するため使えない
func TagNameError(name string) string {
	switch {
	case name == "":
		return "tag is required"
	case strings.HasPrefix(name, "-"):
		return "tag must not start with '-'"
	case strings.ContainsAny(name, ",|"):
		return "tag must not contain ',' or '|'"
	case strings.ContainsFunc(name, unicode.IsSpace):
		return "tag must not contain whitespace"
	}
	return ""
}

// チケット等のタグ文字列（スペース区切り）を検証し、問題があればエラーメッセージを返す。
// 各タグへタグカタログAPIと同じ検証（TagNameError）をかける。空文字（タグなし）は許容する
func TagsError(tags string) string {
	return AddedTagsError(tags, "")
}

// チケット編集時のタグ検証。検証導入前に保存されたメタ文字入りのタグを持つチケットも
// 編集・履歴復元できるよう、currentに既にあるタグは検証せず、新たに追加されるタグだけを検証する
func AddedTagsError(tags, current string) string {
	existing := map[string]bool{}
	for _, tag := range strings.Fields(current) {
		existing[tag] = true
	}
	for _, tag := range strings.Fields(tags) {
		if existing[tag] {
			continue
		}
		if msg := TagNameError(tag); msg != "" {
			return fmt.Sprintf("tag %q: %s", tag, msg)
		}
	}
	return ""
}
