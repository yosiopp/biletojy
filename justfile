# `just` で本番ビルド一式を実行
default: build

# 本番ビルド（フロント → バックエンド）
build: build-front build-back

# フロントをビルド（成果物は front/dist）
[working-directory: 'front']
build-front:
    npm install
    npm run build

# バックエンドをビルド（FTS5を有効にするため -tags sqlite_fts5 が必須）
[working-directory: 'back']
build-back:
    go build -tags sqlite_fts5 -o biletojy .

# ビルドして本番構成で起動（http://localhost:8040）
[working-directory: 'back']
start: build
    ./biletojy

# バックエンドのテスト（FTS5を有効にするため -tags sqlite_fts5 が必須）
[working-directory: 'back']
test:
    go test -tags sqlite_fts5 ./...
