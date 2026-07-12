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

// 候補の事前絞り込み用に、いずれかの択を部分文字列として含むことを表すLIKE条件
// （SQL断片とバインド値）を返す。LIKEは上位集合を返す（部分文字列や % _ のワイルドカードにも
// マッチする）ため、厳密な判定はmatchで行う。NOT条件は絞り込みに使えないため空を返す
func (c *tagCond) likeCond() (string, []any) {
	if c.not {
		return "", nil
	}
	likes := make([]string, len(c.alts))
	args := make([]any, len(c.alts))
	for i, alt := range c.alts {
		token := alt.tag
		if alt.rng != nil {
			token = alt.rng.group
		}
		likes[i] = `t.tags LIKE ?`
		args[i] = "%" + token + "%"
	}
	return "(" + strings.Join(likes, " OR ") + ")", args
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
