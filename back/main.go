package main

import (
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/yosiopp/biletojy/data"
	"github.com/yosiopp/biletojy/webui"
)

func main() {
	addr := flag.String("addr", ":8040", "listen address")
	staticDir := flag.String("static", "", "frontend build directory overriding the embedded assets (empty to use embedded)")
	userHeader := flag.String("user-header", "", "trusted request header holding the authenticated user id, e.g. X-Goog-Authenticated-User-Id (empty to disable)")
	flag.Parse()

	dao, err := data.NewDao()
	if err != nil {
		log.Fatal(err)
	}
	defer dao.Close()

	// 通常は埋め込み済みのフロントを配信し、-static指定時はディレクトリ配信で上書きする（開発用）
	var static fs.FS
	if *staticDir != "" {
		if _, err := os.Stat(*staticDir); err != nil {
			log.Printf("static dir %s not found, serving API only", *staticDir)
		} else {
			static = os.DirFS(*staticDir)
		}
	} else if embedded, ok := webui.Dist(); ok {
		static = embedded
	} else {
		log.Print("no embedded frontend, serving API only")
	}

	log.Printf("biletojy listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, newServer(dao, static, *userHeader)))
}
