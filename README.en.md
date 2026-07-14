# biletojy
issue tracking system with tag

[English](README.en.md) | [日本語](README.md)

## Concept
* Ticket attributes are expressed as tags
* Tickets support markdown and mermaid syntax
* Tags can have groups
* Tags can have a hierarchical structure
* No authentication/authorization features
* Uses SQLite3 as the database
* Operations can be performed with keyboard shortcuts

## Features
### Tickets
* Write ticket bodies and comments in markdown and mermaid syntax
* Pasting an image into the edit area saves it and inserts a markdown image link
* Every edit of a ticket or comment is saved as history; you can list revisions, view diffs, and restore a selected revision
* Full-text search across titles, bodies, comments, and tags, including Japanese text
* The ticket list can be sorted by id, updated time, and the values of date tags and numeric tags
* Register templates of title/body/tags and apply one when creating a ticket

### Tags
* If a tag contains `:` in the middle, the left-hand side becomes a tag group
* Multiple tags in the same tag group behave like a pull-down menu when tagging
* Tag groups can express attributes such as status, category, and milestone
* Tags can have a color
* If a tag contains `/` in the middle, the tag is treated as hierarchical
* Hierarchical tags behave like a pull-down menu when searching
* If a tag group name ends with `@`, the tag is treated as a date/time tag  
  For example, entering `due-date@:` when creating/editing a tag shows a date picker to select a date
* Date tags can be searched by range with comparison operators (`>`, `<`, `>=`, `<=`, `=`)  
  For example, `due-date@:>=2026-01-01` finds tickets whose due date is on or after 2026-01-01
* If a tag group name ends with `#`, the tag is treated as a numeric tag  
  For example, entering `estimate#:` when creating/editing a tag shows a numeric input field
* Numeric tags can also be searched by range with comparison operators; values are compared as numbers  
  For example, `estimate#:>=2` finds tickets whose estimate is 2 or greater

### Shortcuts
* `ctrl+n` Create a ticket
* `ctrl+e` Edit the ticket being viewed
* `ctrl+h` History of the ticket being viewed
* `ctrl+l` Go to the ticket list
* `ctrl+t` Go to the tag list
* `ctrl+m` Go to the template list
* `ctrl+shift+n` Create a tag

## Getting started
### Binary (GitHub Releases)
Download the archive for your OS/architecture from [Releases](https://github.com/yosiopp/biletojy/releases) and extract it.
The frontend is embedded in the binary, so it runs standalone; the database `biletojy.db` is created automatically in the current directory.

```sh
./biletojy            # http://localhost:8040
```

### Docker (GHCR)
The database is created at `/data` inside the container, so mount a volume to persist it.

```sh
docker run -d --name biletojy -p 8040:8040 -v biletojy-data:/data ghcr.io/yosiopp/biletojy:latest
```

#### Environment variables
When flags (such as `-addr`) are not specified, startup settings can be given via the following environment variables (precedence: flags > environment variables > defaults).

| Environment variable | Corresponding flag | Default | Description |
|---|---|---|---|
| `BILETOJY_ADDR` | `-addr` | `:8040` | Listen address |
| `PORT` | — | — | Falls back to `:$PORT` when neither `BILETOJY_ADDR` nor `-addr` is specified (for the port contract of Cloud Run, etc.) |
| `BILETOJY_USER_HEADER` | `-user-header` | (empty) | Name of a trusted header carrying the authenticated user identifier (see [IAP integration](docs/development.md#iap連携-user-header)) |
| `BILETOJY_STATIC` | `-static` | (empty) | Frontend directory to serve instead of the embedded one (development override) |
| `BILETOJY_DB` | `-db` | `./biletojy.db` | Path to the SQLite database file |

#### docker-compose
```yaml
services:
  biletojy:
    image: ghcr.io/yosiopp/biletojy:latest
    ports:
      - "8040:8040"
    environment:
      BILETOJY_DB: /data/biletojy.db
      # BILETOJY_USER_HEADER: X-Goog-Authenticated-User-Id
    volumes:
      - biletojy-data:/data
    restart: unless-stopped

volumes:
  biletojy-data:
```

#### Notes for serverless environments such as Cloud Run
The Cloud Run filesystem is volatile (in-memory) — it is discarded when an instance terminates, and multiple instances do not share storage. Since this app writes to a single SQLite file, the following are required.

* **Mounting a persistent volume is required** (mount Cloud Storage or a network filesystem via Cloud Run volume mounts and point `BILETOJY_DB` to that path). Without a mount, data is lost when the instance terminates
* **A single instance is recommended** (fix both minimum and maximum instances to 1). Concurrent writes to the same SQLite file from multiple instances may cause lock contention or corruption
* The listen port follows the `PORT` environment variable (injected by Cloud Run), so if `BILETOJY_ADDR` is not specified, the app automatically listens on `:$PORT`

### Build from source
If [just](https://github.com/casey/just) is installed, you can build and start with a single command.

```sh
just start            # build and start (http://localhost:8040)
```

For detailed steps and the development setup, see the [development guide](docs/development.md) (Japanese).

## Documentation (Japanese)
* [Development guide](docs/development.md)
* [API specification](docs/api.md)
* [Table definitions](docs/database.md)
* [UI design system](docs/design-system.md)
