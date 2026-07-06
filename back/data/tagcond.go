package data

import (
	"strings"
)

// タグ絞り込み条件の1要素。先頭 "-" で除外（NOT）、"|" 区切りでOR条件を表す
// （例: "-status:CLOSED", "status:OPEN|status:WIP"）。NOTはOR全体に掛かる
type tagCond struct {
	not  bool
	alts []tagAlt
}

// OR条件の1択。日時・数値タグの範囲条件、または通常タグ（完全一致か階層の前方一致）
type tagAlt struct {
	rng *rangeCond
	tag string
}

// タグ絞り込み値を条件として解釈する。有効な択がなければnil
func parseTagCond(s string) *tagCond {
	c := &tagCond{}
	if rest, ok := strings.CutPrefix(s, "-"); ok {
		c.not = true
		s = rest
	}
	for _, alt := range strings.Split(s, "|") {
		if alt == "" {
			continue
		}
		if r := parseRangeCond(alt); r != nil {
			c.alts = append(c.alts, tagAlt{rng: r})
		} else {
			c.alts = append(c.alts, tagAlt{tag: alt})
		}
	}
	if len(c.alts) == 0 {
		return nil
	}
	return c
}

// チケットのタグ文字列が条件を満たすか（いずれかの択にマッチ。NOTなら反転）
func (c *tagCond) match(tags string) bool {
	for _, alt := range c.alts {
		if alt.match(tags) {
			return !c.not
		}
	}
	return c.not
}

func (a tagAlt) match(tags string) bool {
	if a.rng != nil {
		return a.rng.match(tags)
	}
	for _, tag := range strings.Fields(tags) {
		if tag == a.tag || strings.HasPrefix(tag, a.tag+"/") {
			return true
		}
	}
	return false
}
