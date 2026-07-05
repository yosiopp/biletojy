# `just` で本番ビルド一式を実行
default: build

# 本番ビルド（フロント → バックエンド）
build: build-front build-back

# フロントをビルド（成果物は front/dist）
[working-directory: 'front']
build-front:
    npm install
    npm run build

# バックエンドをビルド（成果物は dist/）
# front/dist を back/webui/dist へコピーしてバイナリに埋め込む
[working-directory: 'back']
build-back:
    rm -rf webui/dist
    mkdir -p webui/dist
    cp -R ../front/dist/. webui/dist/
    touch webui/dist/.gitkeep
    go build -o ../dist/biletojy .

# ビルドして本番構成で起動（http://localhost:8040）
[working-directory: 'dist']
start: build
    ./biletojy

# バックエンドのテスト
[working-directory: 'back']
test:
    go test ./...
