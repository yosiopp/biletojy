package data

import (
	"regexp"
	"strings"
)

// 日時タグの範囲条件（例: "due-date@:>=2026-01-01"）
type rangeCond struct {
	group string // "due-date@:" のようなグループ接頭辞
	op    string // ">", "<", ">=", "<=", "="
	value string // "2026-01-01" または "2026-01-01T10:00"
}

var rangeCondPattern = regexp.MustCompile(`^(.+@:)(>=|<=|>|<|=)(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)$`)

// タグ絞り込み値を日時タグの範囲条件として解釈する。該当しなければnil
func parseRangeCond(tag string) *rangeCond {
	m := rangeCondPattern.FindStringSubmatch(tag)
	if m == nil {
		return nil
	}
	return &rangeCond{group: m[1], op: m[2], value: m[3]}
}

// チケットのタグ文字列に条件を満たす日時タグが含まれるか
func (c *rangeCond) match(tags string) bool {
	for _, tag := range strings.Fields(tags) {
		v, ok := strings.CutPrefix(tag, c.group)
		if !ok || v == "" {
			continue
		}
		if compareDateValue(v, c.op, c.value) {
			return true
		}
	}
	return false
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
