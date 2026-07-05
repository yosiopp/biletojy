package main

import (
	"flag"
	"log"
	"net/http"
	"os"

	"github.com/yosiopp/biletojy/data"
)

func main() {
	addr := flag.String("addr", ":8040", "listen address")
	staticDir := flag.String("static", "../front/dist", "frontend build directory (empty to disable)")
	userHeader := flag.String("user-header", "", "trusted request header holding the authenticated user id, e.g. X-Goog-Authenticated-User-Id (empty to disable)")
	flag.Parse()

	dao, err := data.NewDao()
	if err != nil {
		log.Fatal(err)
	}
	defer dao.Close()

	static := *staticDir
	if static != "" {
		if _, err := os.Stat(static); err != nil {
			log.Printf("static dir %s not found, serving API only", static)
			static = ""
		}
	}

	log.Printf("biletojy listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, newServer(dao, static, *userHeader)))
}
