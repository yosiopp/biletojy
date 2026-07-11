package data

import (
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
