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

// envOr は環境変数keyが空でない値を持てばその値を、なければfallbackを返す（フラグの既定値算出に使う）。
// 「定義はあるが空」（docker-composeの値なし定義など）は未設定として扱い、誤って
// 空のアドレス（:80待ち受け）や空のDBパスで起動しないようにする
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// defaultAddr は-addr未指定・BILETOJY_ADDR未設定時の待ち受けアドレスを決める。
// Cloud Runのポート契約に合わせ、PORTがあれば :$PORT へフォールバックする
func defaultAddr() string {
	if v := os.Getenv("BILETOJY_ADDR"); v != "" {
		return v
	}
	if port := os.Getenv("PORT"); port != "" {
		return ":" + port
	}
	return ":8040"
}

func main() {
	// 各フラグの既定値を環境変数から与える（優先順位: フラグ > 環境変数 > 既定値）
	addr := flag.String("addr", defaultAddr(), "listen address (env BILETOJY_ADDR, falls back to :$PORT then :8040)")
	staticDir := flag.String("static", envOr("BILETOJY_STATIC", ""), "frontend build directory overriding the embedded assets (env BILETOJY_STATIC, empty to use embedded)")
	userHeader := flag.String("user-header", envOr("BILETOJY_USER_HEADER", ""), "trusted request header holding the authenticated user id, e.g. X-Goog-Authenticated-User-Id (env BILETOJY_USER_HEADER, empty to disable)")
	dbPath := flag.String("db", envOr("BILETOJY_DB", data.DefaultDBPath), "SQLite database file path (env BILETOJY_DB)")
	flag.Parse()

	dao, err := data.NewDao(*dbPath)
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
