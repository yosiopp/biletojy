# 配布イメージ。GoReleaser（.goreleaser.yaml のdockers_v2）がビルド済みバイナリを
# プラットフォーム別ディレクトリに置いたコンテキストで実行するため、単体での docker build は想定しない。
# フロントはバイナリに埋め込み済み。DBは /data/biletojy.db に作成されるため、/data をボリュームで永続化する
FROM gcr.io/distroless/static-debian12
ARG TARGETPLATFORM
COPY $TARGETPLATFORM/biletojy /usr/local/bin/biletojy
WORKDIR /data
VOLUME /data
EXPOSE 8040
ENTRYPOINT ["/usr/local/bin/biletojy"]
