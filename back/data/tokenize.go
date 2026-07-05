package data

import (
	"regexp"
	"strings"
)

var (
	markdownSymbols = regexp.MustCompile("[#*`>\\-\\[\\]()!|~_=+]")
	multiSpaces     = regexp.MustCompile(`\s+`)
)

// markdown装飾記号の除去
func StripMarkdown(s string) string {
	return markdownSymbols.ReplaceAllString(s, " ")
}

// 複数スペース、改行コードの統合
func NormalizeSpaces(s string) string {
	return strings.TrimSpace(multiSpaces.ReplaceAllString(s, " "))
}

// 単語ごとにbi-gram化しスペース区切りで返す（FTS格納用）。
// 末尾の1文字は先頭に来るbi-gramがなく前方一致検索で拾えないため、unigramも追加で出力する
func Bigram(s string) string {
	words := strings.Fields(NormalizeSpaces(s))
	tokens := []string{}
	for _, word := range words {
		runes := []rune(strings.ToLower(word))
		if len(runes) < 2 {
			tokens = append(tokens, string(runes))
			continue
		}
		for i := 0; i+2 <= len(runes); i++ {
			tokens = append(tokens, string(runes[i:i+2]))
		}
		tokens = append(tokens, string(runes[len(runes)-1:]))
	}
	return strings.Join(tokens, " ")
}

// 検索語をFTS5のMATCH式に変換する
// 2文字以上の単語はbi-gramの連続フレーズ、1文字は前方一致で検索する。
// 索引側（StripMarkdown後にbi-gram化）と同じ前処理を通し、記号を含む語も一致させる
func BigramQuery(s string) string {
	words := strings.Fields(NormalizeSpaces(StripMarkdown(s)))
	terms := []string{}
	for _, word := range words {
		runes := []rune(strings.ToLower(word))
		if len(runes) < 2 {
			terms = append(terms, `"`+escapeFtsToken(string(runes))+`" *`)
			continue
		}
		grams := []string{}
		for i := 0; i+2 <= len(runes); i++ {
			grams = append(grams, escapeFtsToken(string(runes[i:i+2])))
		}
		terms = append(terms, `"`+strings.Join(grams, " ")+`"`)
	}
	return strings.Join(terms, " AND ")
}

func escapeFtsToken(s string) string {
	return strings.ReplaceAll(s, `"`, `""`)
}
