package data

import "testing"

func TestStripMarkdown(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"# 見出し", "  見出し"},
		{"**太字** と `コード`", "  太字   と  コード "},
		{"- リスト [リンク](http://example.com)", "  リスト  リンク  http://example.com "},
		{"プレーンテキスト", "プレーンテキスト"},
	}
	for _, tt := range tests {
		if got := StripMarkdown(tt.input); got != tt.want {
			t.Errorf("StripMarkdown(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestNormalizeSpaces(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"  a   b  ", "a b"},
		{"a\nb\r\nc", "a b c"},
		{"a\t b", "a b"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := NormalizeSpaces(tt.input); got != tt.want {
			t.Errorf("NormalizeSpaces(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestBigram(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		// 2文字以上の単語は末尾1文字のunigramも出力する（1文字の前方一致検索で拾うため）
		{"hello", "he el ll lo o"},
		{"a", "a"},
		{"", ""},
		{"ログイン", "ログ グイ イン ン"},
		{"ab cd", "ab b cd d"},
		{"ABC", "ab bc c"},
		{"エラー 発生", "エラ ラー ー 発生 生"},
		{"柴犬", "柴犬 犬"},
	}
	for _, tt := range tests {
		if got := Bigram(tt.input); got != tt.want {
			t.Errorf("Bigram(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestBigramQuery(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"hello", `"he el ll lo"`},
		{"a", `"a" *`},
		{"ログイン", `"ログ グイ イン"`},
		{"エラー 発生", `"エラ ラー" AND "発生"`},
		{"ABC", `"ab bc"`},
		{`a"b`, `"a"" ""b"`},
		// 索引側と同じ前処理（記号の除去）を通す
		{"e-mail", `"e" * AND "ma ai il"`},
		{"2026-01-01", `"20 02 26" AND "01" AND "01"`},
		// 空白のみ・除去される記号のみは空になる
		{"   ", ``},
		{"---", ``},
	}
	for _, tt := range tests {
		if got := BigramQuery(tt.input); got != tt.want {
			t.Errorf("BigramQuery(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
