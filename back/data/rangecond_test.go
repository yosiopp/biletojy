package data

import (
	"strings"
	"testing"
)

func TestParseRangeCond(t *testing.T) {
	tests := []struct {
		input string
		want  *rangeCond
	}{
		{"due-date@:>2026-01-01", &rangeCond{"due-date@:", ">", "2026-01-01", false}},
		{"due-date@:<2026-01-01", &rangeCond{"due-date@:", "<", "2026-01-01", false}},
		{"due-date@:>=2026-01-01", &rangeCond{"due-date@:", ">=", "2026-01-01", false}},
		{"due-date@:<=2026-01-01", &rangeCond{"due-date@:", "<=", "2026-01-01", false}},
		{"due-date@:=2026-01-01", &rangeCond{"due-date@:", "=", "2026-01-01", false}},
		{"due-date@:>=2026-01-01T10:30", &rangeCond{"due-date@:", ">=", "2026-01-01T10:30", false}},
		// 演算子なしは "=" と同じ扱い（日付精度を切り詰めた比較になる）
		{"due-date@:2026-01-01", &rangeCond{"due-date@:", "=", "2026-01-01", false}},
		{"due-date@:2026-01-01T10:30", &rangeCond{"due-date@:", "=", "2026-01-01T10:30", false}},
		// 数値タグ（グループ名末尾 #）
		{"estimate#:>2", &rangeCond{"estimate#:", ">", "2", true}},
		{"estimate#:<2", &rangeCond{"estimate#:", "<", "2", true}},
		{"estimate#:>=2", &rangeCond{"estimate#:", ">=", "2", true}},
		{"estimate#:<=2", &rangeCond{"estimate#:", "<=", "2", true}},
		{"estimate#:=2", &rangeCond{"estimate#:", "=", "2", true}},
		{"estimate#:2", &rangeCond{"estimate#:", "=", "2", true}},
		{"estimate#:>=1.5", &rangeCond{"estimate#:", ">=", "1.5", true}},
		{"estimate#:>=-2", &rangeCond{"estimate#:", ">=", "-2", true}},
		// 範囲条件ではないもの
		{"status:>2026-01-01", nil},  // 日時グループ（@:）でない
		{"due-date@:>tomorrow", nil}, // 日付形式でない
		{"due-date@:>2026-1-1", nil}, // ゼロ埋めなしは日付形式でない
		{"due-date@:TBD", nil},       // 演算子なしでも日付形式でなければ通常のタグ一致
		{"status:>2", nil},           // 数値グループ（#:）でない
		{"estimate#:>abc", nil},      // 数値形式でない
		{"estimate#:TBD", nil},       // 演算子なしでも数値形式でなければ通常のタグ一致
		{"estimate#:1.2.3", nil},     // 数値形式でない
		{"docs/design", nil},
	}
	for _, tt := range tests {
		got := parseRangeCond(tt.input)
		if tt.want == nil {
			if got != nil {
				t.Errorf("parseRangeCond(%q) = %+v, want nil", tt.input, got)
			}
			continue
		}
		if got == nil || *got != *tt.want {
			t.Errorf("parseRangeCond(%q) = %+v, want %+v", tt.input, got, tt.want)
		}
	}
}

func TestRangeCondMatch(t *testing.T) {
	tests := []struct {
		cond string
		tags string
		want bool
	}{
		{"due-date@:>2026-01-01", "due-date@:2026-01-02", true},
		{"due-date@:>2026-01-01", "due-date@:2026-01-01", false},
		{"due-date@:>=2026-01-01", "due-date@:2026-01-01", true},
		{"due-date@:<2026-01-01", "due-date@:2025-12-31", true},
		{"due-date@:<2026-01-01", "due-date@:2026-01-01", false},
		{"due-date@:<=2026-01-01", "due-date@:2026-01-01", true},
		{"due-date@:=2026-01-01", "due-date@:2026-01-01", true},
		{"due-date@:=2026-01-01", "due-date@:2026-01-02", false},
		// 他のタグが混在していても対象グループの値で判定する
		{"due-date@:>2026-01-01", "status:OPEN due-date@:2026-03-01 docs/design", true},
		{"due-date@:>2026-01-01", "status:OPEN docs/design", false},
		// 対象グループのタグが無い場合はマッチしない
		{"due-date@:>2026-01-01", "", false},
		{"due-date@:>2026-01-01", "start-date@:2026-03-01", false},
		// 時刻付きの値と日付のみの条件は日付の精度で比較する
		{"due-date@:=2026-01-01", "due-date@:2026-01-01T10:00", true},
		{"due-date@:>2026-01-01", "due-date@:2026-01-01T10:00", false},
		{"due-date@:<=2026-01-01", "due-date@:2026-01-01T23:00", true},
		// 時刻付きの条件同士
		{"due-date@:>=2026-01-01T10:00", "due-date@:2026-01-01T10:00", true},
		{"due-date@:>2026-01-01T10:00", "due-date@:2026-01-01T10:30", true},
		{"due-date@:>2026-01-01T10:00", "due-date@:2026-01-01T09:00", false},
		// 日付形式でない値は比較の対象にしない
		{"due-date@:>=2026-01-01", "due-date@:TBD", false},
		{"due-date@:<=2026-01-01", "due-date@:1234-56", false},
		{"due-date@:>=2026-01-01", "due-date@:TBD due-date@:2026-02-01", true},
		// 演算子なしの条件は "=" と同じ日付精度の比較になる
		{"due-date@:2026-07-04", "due-date@:2026-07-04T10:00", true},
		{"due-date@:2026-07-04", "due-date@:2026-07-04", true},
		{"due-date@:2026-07-04", "due-date@:2026-07-05", false},
		// 数値タグは数値として比較する（辞書順なら "10" < "9" になってしまう）
		{"estimate#:>2", "estimate#:3", true},
		{"estimate#:>2", "estimate#:2", false},
		{"estimate#:>=2", "estimate#:2", true},
		{"estimate#:<2", "estimate#:1", true},
		{"estimate#:<=2", "estimate#:2", true},
		{"estimate#:=2", "estimate#:2", true},
		{"estimate#:2", "estimate#:2", true},
		{"estimate#:2", "estimate#:3", false},
		{"estimate#:>=9", "estimate#:10", true},
		{"estimate#:<10", "estimate#:9", true},
		// 小数・負数・ゼロ埋め表記も数値として比較する
		{"estimate#:>=1.5", "estimate#:1.5", true},
		{"estimate#:>1.5", "estimate#:1.5", false},
		{"estimate#:>=-2", "estimate#:-1", true},
		{"estimate#:<-2", "estimate#:-1", false},
		{"estimate#:=2", "estimate#:2.0", true},
		// 他のタグが混在していても対象グループの値で判定する
		{"estimate#:>=2", "status:OPEN estimate#:3 docs/design", true},
		{"estimate#:>=2", "status:OPEN docs/design", false},
		// 対象グループのタグが無い・数値形式でない値は比較の対象にしない
		{"estimate#:>=2", "", false},
		{"estimate#:>=2", "point#:3", false},
		{"estimate#:>=2", "estimate#:TBD", false},
		{"estimate#:>=2", "estimate#:TBD estimate#:3", true},
	}
	for _, tt := range tests {
		c := parseRangeCond(tt.cond)
		if c == nil {
			t.Fatalf("parseRangeCond(%q) = nil", tt.cond)
		}
		if got := c.match(strings.Fields(tt.tags)); got != tt.want {
			t.Errorf("(%q).match(%q) = %v, want %v", tt.cond, tt.tags, got, tt.want)
		}
	}
}
