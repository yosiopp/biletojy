// Package webui はフロントエンドのビルド成果物をバイナリへ埋め込む。
// dist/ の実体はビルド時に front/dist からコピーされる（justfileのbuild-back参照）。
// gitには空の .gitkeep のみ登録されているため、コピーせずビルドした場合は埋め込みなしとして動作する
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist は埋め込んだフロントエンドを返す。埋め込まれていない場合はfalseを返す
func Dist() (fs.FS, bool) {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil, false
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil, false
	}
	return sub, true
}
