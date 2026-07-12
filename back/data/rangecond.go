package data

import (
	"regexp"
	"strconv"
	"strings"
)

// 日時タグ・数値タグの範囲条件（例: "due-date@:>=2026-01-01", "estimate#:>=2"）
type rangeCond struct {
	group   string // "due-date@:" / "estimate#:" のようなグループ接頭辞
	op      string // ">", "<", ">=", "<=", "="
	value   string // "2026-01-01"、"2026-01-01T10:00" または "3", "1.5"
	numeric bool   // 数値タグ（グループ名末尾 #）の条件。falseは日時タグ（同 @）
}

var (
	dateRangePattern = regexp.MustCompile(`^(.+@:)(>=|<=|>|<|=)?(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)$`)
	dateValuePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$`)
	numRangePattern  = regexp.MustCompile(`^(.+#:)(>=|<=|>|<|=)?(-?\d+(?:\.\d+)?)$`)
	numValuePattern  = regexp.MustCompile(`^-?\d+(?:\.\d+)?$`)
)

// タグ絞り込み値を日時タグまたは数値タグの範囲条件として解釈する。該当しなければnil。
// 演算子なし（例: "due-date@:2026-01-01", "estimate#:3"）は "=" と同じ扱いで、
// 日時タグは日付精度を切り詰めた比較になる
func parseRangeCond(tag string) *rangeCond {
	numeric := false
	m := dateRangePattern.FindStringSubmatch(tag)
	if m == nil {
		m = numRangePattern.FindStringSubmatch(tag)
		numeric = true
	}
	if m == nil {
		return nil
	}
	op := m[2]
	if op == "" {
		op = "="
	}
	return &rangeCond{group: m[1], op: op, value: m[3], numeric: numeric}
}

// チケットの分割済みタグ群に条件を満たす日時・数値タグが含まれるか。
// 比較できない値（例: "due-date@:TBD", "estimate#:未定"）は比較の対象にしない
func (c *rangeCond) match(tags []string) bool {
	for _, tag := range tags {
		v, ok := strings.CutPrefix(tag, c.group)
		if !ok {
			continue
		}
		if c.numeric {
			if numValuePattern.MatchString(v) && compareNumberValue(v, c.op, c.value) {
				return true
			}
		} else {
			if dateValuePattern.MatchString(v) && compareDateValue(v, c.op, c.value) {
				return true
			}
		}
	}
	return false
}

// 数値文字列を数値として比較する（"10" > "9" となるよう辞書順は使わない）
func compareNumberValue(v, op, cond string) bool {
	a, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return false
	}
	b, err := strconv.ParseFloat(cond, 64)
	if err != nil {
		return false
	}
	switch op {
	case ">":
		return a > b
	case "<":
		return a < b
	case ">=":
		return a >= b
	case "<=":
		return a <= b
	default: // "="
		return a == b
	}
}

// ISO形式の日時文字列を辞書順で比較する。
// 日付のみと時刻付きが混在する場合は短い方の精度に切り詰めて比較する
// （例: "2026-01-01T10:00" は "=2026-01-01" にマッチし、">2026-01-01" にはマッチしない）
func compareDateValue(v, op, cond string) bool {
	n := min(len(v), len(cond))
	a, b := v[:n], cond[:n]
	switch op {
	case ">":
		return a > b
	case "<":
		return a < b
	case ">=":
		return a >= b
	case "<=":
		return a <= b
	default: // "="
		return a == b
	}
}
