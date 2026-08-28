# AFFiNE — Giới thiệu chi tiết (tiếng Việt)

> Tài liệu này mô tả AFFiNE **v0.27.0**, branch `canary`, dựa trên việc đọc trực tiếp mã nguồn trong repo này.
> Mọi đường dẫn đều tính từ gốc repo.

---

## Mục lục

1. [AFFiNE là gì](#1-affine-là-gì)
2. [Tính năng theo góc nhìn người dùng](#2-tính-năng-theo-góc-nhìn-người-dùng)
3. [AFFiNE AI](#3-affine-ai)
4. [Kiến trúc kỹ thuật](#4-kiến-trúc-kỹ-thuật)
5. [Cây thư mục monorepo](#5-cây-thư-mục-monorepo)
6. [Bản quyền, phiên bản và gói trả phí](#6-bản-quyền-phiên-bản-và-gói-trả-phí)
7. [Phụ lục: lệnh chạy & phát triển](#7-phụ-lục-lệnh-chạy--phát-triển)

---

## 1. AFFiNE là gì

**AFFiNE** (đọc là /əˈfʌɪn/) là một **workspace all-in-one mã nguồn mở**, tự mô tả là "một lựa chọn thay thế cho **Notion & Miro**" — riêng tư, ưu tiên dữ liệu cục bộ (local-first), dùng được ngay.

Khẩu hiệu: **"Write, Draw and Plan All at Once"** — Viết, Vẽ và Lập kế hoạch cùng một lúc.

Cái tên là một chơi chữ: trong toán học, _affine_ là phép biến đổi bảo toàn tính thẳng hàng — ở đây ám chỉ **tài liệu, canvas và bảng dữ liệu được hợp nhất (hyper-merged) thành một**.

### Vấn đề nó giải quyết

Quy trình làm việc tri thức thông thường bị phân mảnh: viết ở Notion, vẽ sơ đồ ở Miro/Whimsical, quản lý task ở Trello, dữ liệu ở Airtable. Mỗi lần chuyển công cụ là một lần mất ngữ cảnh và phải đồng bộ thủ công.

AFFiNE gộp tất cả vào **một tài liệu duy nhất**: cùng một nội dung có thể xem ở chế độ trang văn bản (**page**) hoặc trải ra trên bảng trắng vô hạn (**edgeless**). Không phải "nhúng whiteboard vào doc" — mà là cùng một cây block CRDT được render bằng hai cách.

### So sánh nhanh

|                                          | AFFiNE               | Notion       | Miro | Obsidian                 |
| ---------------------------------------- | -------------------- | ------------ | ---- | ------------------------ |
| Doc + Whiteboard hợp nhất                | ✅ cùng một tài liệu | ❌           | ❌   | ❌ (cần plugin)          |
| Local-first (dùng offline)               | ✅                   | ❌           | ❌   | ✅                       |
| Mã nguồn mở                              | ✅ MIT (frontend)    | ❌           | ❌   | ❌                       |
| Tự host (self-host)                      | ✅                   | ❌           | ❌   | —                        |
| Cộng tác real-time                       | ✅ CRDT/Yjs          | ✅           | ✅   | ❌ (cần dịch vụ trả phí) |
| Database đa view (table/kanban/calendar) | ✅                   | ✅           | ❌   | ❌                       |
| AI tích hợp sẵn                          | ✅ + BYOK            | ✅ (trả phí) | ✅   | ❌                       |

### Nguồn cảm hứng (theo README)

Quip & Notion (mọi thứ là một block), Trello (Kanban), Airtable & Miro (bảng dữ liệu lập trình được, không cần code), Miro & Whimsical (whiteboard vô hạn), Remote & Capacities (hệ thống tag hướng đối tượng).

---

## 2. Tính năng theo góc nhìn người dùng

### 2.1 Hai chế độ của cùng một tài liệu

`blocksuite/affine/model/src/consts/doc.ts`:

```ts
export type DocMode = 'edgeless' | 'page';
```

- **Page mode** — trang tài liệu tuyến tính, giống Notion. Cài đặt ở `blocksuite/affine/blocks/root/src/page/`.
- **Edgeless mode** — bảng trắng vô hạn, giống Miro. Cài đặt ở `blocksuite/affine/blocks/root/src/edgeless/`.

Cơ chế then chốt: mỗi **note block** mang một chế độ hiển thị (`blocksuite/affine/model/src/consts/note.ts`): `DocAndEdgeless` / `DocOnly` / `EdgelessOnly`. Nhờ đó một tài liệu có thể có phần chỉ hiện trong doc, phần chỉ hiện trên canvas — mà vẫn là một tài liệu.

### 2.2 Danh sách block (21 loại)

Thư mục `blocksuite/affine/blocks/`:

| Nhóm    | Block                                                                             |
| ------- | --------------------------------------------------------------------------------- |
| Văn bản | `paragraph`, `list`, `divider`, `callout`, `code` (highlight bằng Shiki), `latex` |
| Dữ liệu | `database`, `data-view`, `table`                                                  |
| Media   | `image`, `attachment`, `bookmark`                                                 |
| Canvas  | `surface`, `surface-ref`, `frame`, `edgeless-text`, `note`                        |
| Nhúng   | `embed`, `embed-doc`                                                              |
| Gốc     | `root`                                                                            |

**Embed** hỗ trợ (`blocksuite/affine/blocks/embed/src/`): YouTube, Figma, GitHub, Loom, HTML thô, iframe bất kỳ — cộng thêm nhúng chính tài liệu AFFiNE khác (linked doc / synced doc).

### 2.3 Phần tử canvas (edgeless)

`blocksuite/affine/gfx/` — `brush` (bút vẽ), `connector` (đường nối), `shape` (hình khối), `text`, `group`, `mindmap` (sơ đồ tư duy), `link`, `template`, `pointer`, `turbo-renderer` (renderer tăng tốc).

**Chế độ trình chiếu**: `blocksuite/affine/blocks/frame/src/present/` — mỗi _frame_ trên canvas là một slide. Vẽ xong bấm play là thành bài thuyết trình.

### 2.4 Database đa view

`blocksuite/affine/data-view/src/`:

- **View**: `table` (bản PC, PC-virtual, mobile, có dòng thống kê), `kanban` (PC + mobile), `calendar`.
- **Kiểu cột**: checkbox, date, image, multi-select, number, progress, select, text.
- **Năng lực**: filter, sort, group-by, statistics, expression, panel chi tiết từng record.

### 2.5 Tổ chức & điều hướng

Các module ở `packages/frontend/core/src/modules/`:

| Tính năng                         | Module                            |
| --------------------------------- | --------------------------------- |
| Nhật ký hằng ngày                 | `journal`                         |
| Tag                               | `tag`                             |
| Collection thông minh (theo rule) | `collection`, `collection-rules`  |
| Thư mục                           | `organize`                        |
| Yêu thích                         | `favorite`                        |
| Chia màn hình / nhiều tab         | `workbench`                       |
| Command palette                   | `quicksearch`                     |
| Tìm kiếm cục bộ                   | `docs-search`                     |
| Menu @-mention                    | `at-menu-config`                  |
| Tìm trong trang (desktop)         | `find-in-page`                    |
| Backlink / outgoing link          | `doc-link`                        |
| Xem nhanh khi hover               | `peek-view`                       |
| Thuộc tính tài liệu tùy biến      | `workspace-property`              |
| Mẫu tài liệu                      | `template-doc`, `import-template` |

### 2.6 Cộng tác & chia sẻ

- **Chia sẻ public link** — `share-doc`, có `PublicDocMode` (`page` hoặc `edgeless`), tức là chia sẻ được cả bảng trắng.
- **Bình luận inline + trả lời** — `comment` (frontend) ↔ `packages/backend/server/src/core/comment/` (backend).
- **Con trỏ người khác theo thời gian thực** — `blocksuite/affine/widgets/remote-selection/` + awareness ở `packages/common/nbstore/src/sync/awareness/`.
- **Phân quyền workspace** (`packages/backend/server/src/core/permission/types.ts`): `External` < `Collaborator` < `Admin` < `Owner`. Riêng Owner mới có `Administrators.Manage` và `TransferOwner`.
- **Phân quyền tài liệu**: `External` < Reader/Editor < `Manager` < `Owner`, với hàm `fixupDocRole()` ánh xạ quyền workspace → quyền mặc định trên doc.
- **Thông báo**: Mention, Invitation, InvitationAccepted, InvitationBlocked, InvitationReviewRequest/Approved/Declined.

### 2.7 Nhập / xuất

Adapter ở `blocksuite/affine/shared/src/adapters/`: `markdown`, `html`, `notion-html` (import file ZIP export từ Notion), `plain-text`, `pdf`, `clipboard`.

Ngoài ra có **Web Clipper** (`packages/frontend/core/src/modules/import-clipper`) và tích hợp **Readwise** (`modules/integration`).

### 2.8 Lịch sử phiên bản & thùng rác

Modal lịch sử ở `packages/frontend/core/src/components/affine/page-history-modal/`, dữ liệu nằm ở bảng `SnapshotHistory`. Thời gian lưu trữ bị giới hạn bởi quota `historyPeriod`.

### 2.9 Đa nền tảng

| Nền tảng    | Vị trí                            | Công nghệ                                                                  |
| ----------- | --------------------------------- | -------------------------------------------------------------------------- |
| Web         | `packages/frontend/apps/web`      | React 19 SPA                                                               |
| Desktop     | `packages/frontend/apps/electron` | Electron 39 + Electron Forge (dmg, nsis, squirrel, deb, flatpak, AppImage) |
| Mobile web  | `packages/frontend/apps/mobile`   | React SPA tối ưu cho mobile                                                |
| iOS         | `packages/frontend/apps/ios`      | Capacitor 8 + Xcode project                                                |
| Android     | `packages/frontend/apps/android`  | Capacitor 8 + Gradle                                                       |
| Admin panel | `packages/frontend/admin`         | React + Radix + Tailwind, server phục vụ tại `/admin`                      |

Riêng bản desktop có thêm: ghi âm (`main/recording`) → chuyển thành văn bản, tự động cập nhật (`main/updater`), tray icon, deep link, đa cửa sổ.

### 2.10 Đa ngôn ngữ

26 ngôn ngữ ở `packages/frontend/i18n/src/resources/`: ar, ca, da, de, el-GR, en, es, es-AR, es-CL, fa, fr, hi, it, ja, kk, ko, nb-NO, pl, pt-BR, ru, sv-SE, tr, uk, ur, zh-Hans, zh-Hant. **Chưa có tiếng Việt** — đây là chỗ có thể đóng góp.

---

## 3. AFFiNE AI

### 3.1 Danh mục prompt dựng sẵn

64 prompt được định nghĩa ở `packages/backend/native/src/llm/assets/prompts/built-in.json`:

| Nhóm           | Ví dụ                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Âm thanh / họp | Transcript audio (+ bản có cấu trúc), Summarize the meeting, Find action for summary                                                                                                                      |
| Viết           | Summary, Translate to, Improve writing, Improve grammar, Fix spelling, Change tone, Make it longer/shorter, Continue writing, Write an article/twitter/poem/blog post, Create headings, Find action items |
| Canvas         | Brainstorm ideas, Brainstorm mindmap, Expand mind map, Create a presentation, **Make it real** (vẽ phác thảo → sinh ra UI chạy được)                                                                      |
| Ảnh            | Generate image, đổi phong cách Clay/Sketch/Anime/Pixel, Convert to sticker, Upscale, Remove background, Generate a caption                                                                                |
| Code           | Check code error, Explain this code, Code Artifact                                                                                                                                                        |
| Hội thoại      | Chat With AFFiNE AI, Conversation Summary                                                                                                                                                                 |

AI xuất hiện ngay trong thanh format, code toolbar, image toolbar và edgeless toolbar — xem `packages/frontend/core/src/blocksuite/ai/entries/`.

### 3.2 Hạ tầng AI phía server

`packages/backend/server/src/plugins/copilot/`:

- `providers/`, `runtime/` — định tuyến model (phần lõi đã chuyển sang Rust ở `packages/backend/native/src/llm/route/`).
- `byok/` — **Bring Your Own Key**. Hỗ trợ `openai`, `anthropic`, `gemini`, `fal`, cộng endpoint `openai_compatible` (dialect `responses` hoặc `chat_completions`). Key lưu ở server hoặc chỉ ở máy người dùng.
- `embedding/` + `retrieval/` — RAG trên pgvector.
- `mcp/` — Model Context Protocol.
- `transcript/` — chuyển giọng nói thành văn bản.
- `tools/` — công cụ agent gọi được: `doc-read`, `doc-write`, `doc-search`, `doc-compose`, `doc-canvas-read`, `section-edit`, `artifact`, `code-artifact`, `exa-search`, `exa-crawl` (tìm kiếm web), `conversation-summary`.

> Muốn bật AI khi tự host: cần API key riêng. Chưa cấu hình key thì các nút AI sẽ không hoạt động — phần còn lại của ứng dụng vẫn chạy bình thường.

---

## 4. Kiến trúc kỹ thuật

### 4.1 Sơ đồ tầng

```
┌──────────────────────────────────────────────────────────────┐
│  Vỏ ứng dụng   packages/frontend/apps/{web,electron,mobile,  │
│                ios,android}  — chỉ bootstrap                 │
├──────────────────────────────────────────────────────────────┤
│  App brain     packages/frontend/core                        │
│                ~70 module tính năng                          │
├──────────────────────────────┬───────────────────────────────┤
│  Editor engine               │  DI + reactive                │
│  blocksuite/                 │  packages/common/infra        │
│  (Lit 3, blocks, gfx)        │  (@toeverything/infra)        │
├──────────────────────────────┴───────────────────────────────┤
│  CRDT          blocksuite/framework/store  →  Yjs 13.6        │
├──────────────────────────────────────────────────────────────┤
│  Storage/sync  packages/common/nbstore                       │
│                idb │ sqlite │ cloud │ broadcast-channel      │
└──────────────────────────────┬───────────────────────────────┘
                               │ socket.io + GraphQL
┌──────────────────────────────┴───────────────────────────────┐
│  Backend  packages/backend/server (NestJS 11)                │
│  core/    auth, doc, sync, realtime, workspaces, permission, │
│           comment, notification, mail, storage, quota        │
│  plugins/ copilot(AI), payment, oauth, indexer, captcha,     │
│           license, calendar, worker, gcloud                  │
├──────────────────────────────────────────────────────────────┤
│  PostgreSQL + pgvector  │  Redis  │  S3/R2/fs  │  Manticore  │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Luồng đồng bộ (điểm cốt lõi làm nên "local-first + collab")

1. Người dùng gõ chữ → BlockSuite cập nhật cây block, thực chất là một **Yjs document** (CRDT).
2. Yjs sinh ra một **update** nhị phân.
3. `@affine/nbstore` ghi update vào **kho cục bộ trước**: IndexedDB trên web, SQLite qua Rust trên desktop, UniFFI trên mobile. → Đây là lý do app dùng được offline.
4. Song song, adapter `cloud` đẩy update lên server qua **socket.io** — gateway ở `packages/backend/server/src/core/sync/gateway.ts`; tầng realtime thứ hai ở `packages/backend/server/src/core/realtime/`.
5. Server ghi vào Postgres: bảng `Update` (nhật ký thay đổi), rồi định kỳ gộp thành `Snapshot` (`merge-updates.ts` dùng hàm Rust `applyUpdatesWithNative`), lưu bản cũ vào `SnapshotHistory`.
6. Server phát update tới các client khác trong cùng "room"; `broadcast-channel` lo đồng bộ giữa các tab trên cùng trình duyệt.
7. **Awareness** (con trỏ, vùng chọn của người khác) đi qua kênh riêng, không lưu xuống DB.

Vì là CRDT nên hai người sửa cùng lúc sẽ **tự động hòa giải** mà không cần khóa (lock) hay server làm trọng tài.

### 4.3 Công nghệ chính

**Frontend**: React 19.2, Lit 3 (tầng editor), Jotai + `@preact/signals-core`, vanilla-extract CSS-in-TS, Tailwind 4 (admin), Radix UI, rxjs 7. Render đặc biệt: Shiki (code), KaTeX, Mermaid, Typst (`@myriaddreamin/typst.ts`), PDF viewer.

**Backend**: NestJS 11 trên Express 5, GraphQL (Apollo Server 5, SDL sinh ra ở `packages/backend/server/src/schema.gql`), Prisma 6.6 + PostgreSQL/pgvector, Redis + BullMQ, socket.io, Stripe, argon2, nodemailer + React Email, OpenTelemetry.

**Rust** (`Cargo.toml`, 7 crate): napi-rs 3.7 cho Node addon, UniFFI 0.29 cho mobile, sqlx (SQLite), y-octo (Yjs bản native), tiktoken-rs, symphonia/cpal/screencapturekit (ghi âm & thu màn hình), onenote_parser (import OneNote).

**Build**: **Rspack 2** + SWC (không phải Vite/Webpack), **oxlint + oxfmt** (không phải ESLint/Prettier), TypeScript bản native thế hệ mới, Vitest 4 (unit) + AVA (backend) + Playwright 1.58 (E2E).

### 4.4 Lưu trữ file (blob)

`packages/backend/server/src/base/storage/providers/index.ts`:

```ts
StorageProviderName = 'fs' | 'aws-s3' | 'cloudflare-r2' | 'assetpack';
```

`aws-s3` có `forcePathStyle` nên dùng được với mọi dịch vụ tương thích S3 (MinIO, Backblaze…). **Không có provider Azure.** Khi tự host, mặc định là `fs` → `/root/.affine/storage`.

---

## 5. Cây thư mục monorepo

```
AFFiNE/
├─ blocksuite/                  # Nhân editor (vendored, monorepo trong monorepo)
│  ├─ framework/                # store (Yjs), std (Lit runtime), sync, global
│  ├─ affine/                   # ~90 package: blocks/ gfx/ widgets/ inlines/ fragments/
│  ├─ playground/               # sân chơi thử editor độc lập
│  └─ integration-test/
│
├─ packages/
│  ├─ frontend/
│  │  ├─ core/                  # @affine/core — "bộ não" ứng dụng, ~70 module
│  │  ├─ component/             # design system / UI kit + cầu nối React↔Lit
│  │  ├─ admin/                 # SPA quản trị, phục vụ tại /admin
│  │  ├─ i18n/                  # 26 ngôn ngữ
│  │  ├─ native/                # napi-rs Rust addon cho desktop (sqlite, nbstore, ghi âm)
│  │  ├─ mobile-native/         # UniFFI bindings cho iOS/Android
│  │  ├─ electron-api/          # định nghĩa IPC có kiểu
│  │  ├─ templates/ track/ routes/
│  │  └─ apps/                  # web, electron, electron-renderer, mobile, ios, android
│  │
│  ├─ backend/
│  │  ├─ server/                # NestJS: core/ (25 module) + plugins/ (9)
│  │  └─ native/                # napi addon cho server: crypto, doc loader, LLM runtime
│  │
│  └─ common/
│     ├─ infra/                 # @toeverything/infra — DI + reactive
│     ├─ nbstore/               # tầng storage/sync đa nền tảng
│     ├─ graphql/               # GraphQL client sinh tự động
│     ├─ native/                # crate Rust dùng chung (hashcash)
│     └─ realtime/ reader/ auth/ env/ error/ debug/ s3-compat/ theme/
│
├─ tools/
│  ├─ cli/                      # @affine-tools/cli — lệnh `yarn affine`
│  └─ utils/ changelog/ doc-diff/ ...
│
├─ tests/                       # Playwright E2E: local, cloud, copilot, desktop, mobile
├─ docs/                        # tài liệu contributor (kể cả file này)
├─ .docker/                     # dev/ (compose local) + selfhost/ (compose production)
└─ .github/                     # workflows, helm chart, Dockerfile deploy
```

---

## 6. Bản quyền, phiên bản và gói trả phí

### 6.1 Giấy phép (file `LICENSE`)

- Mọi thứ **trừ** `packages/backend/**` và `packages/common/native/**` → **MIT** (`LICENSE-MIT`). Nghĩa là **toàn bộ `blocksuite/` và toàn bộ frontend là MIT**.
- Hai thư mục trên → giấy phép riêng tại `packages/backend/server/LICENSE`.

### 6.2 CE và EE

- **Community Edition (CE)** — bản hiện tại, tự host miễn phí.
- **Enterprise Edition (EE)** — chưa phát hành, sẽ bổ sung rebranding, SSO, quản trị nâng cao và audit log.

### 6.3 Kênh build

`tools/cli/src/rspack/index.ts` — biến môi trường `BUILD_TYPE` nhận `canary` (mặc định), `beta`, `stable`, `internal`. Mỗi kênh có tên app và icon riêng.

### 6.4 Gói dịch vụ

`packages/backend/server/src/plugins/payment/types.ts`: `free`, `pro`, `ai`, `team`, `selfhosted`, `selfhostedteam`. Chu kỳ: tháng / năm / trọn đời ("Believer"). Thanh toán qua Stripe; mobile dùng RevenueCat.

Các chiều quota (`src/core/quota/service.ts`): `blobLimit` (dung lượng 1 file), `storageQuota`, `historyPeriod` (thời gian giữ lịch sử), `memberLimit` / `seatLimit`.

---

## 7. Phụ lục: lệnh chạy & phát triển

### 7.1 Yêu cầu môi trường

| Thành phần          | Yêu cầu                                                                  | Nguồn                             |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Node.js             | `>=22.12.0 <23.0.0` (`.nvmrc` ghi 22.23.2)                               | `package.json` → `engines`        |
| —                   | `.npmrc` bật `engine-strict=true` → Node sai version bị chặn cài         | `.npmrc`                          |
| Yarn                | 4.18.0 (repo tự kèm ở `.yarn/releases/`)                                 | `package.json` → `packageManager` |
| Rust                | 1.97.1                                                                   | `rust-toolchain.toml`             |
| Trình biên dịch C++ | VS Build Tools 2022 (Windows) — vì `.cargo/config.toml` ép `+crt-static` | `.cargo/config.toml`              |
| Docker              | cho Postgres(pgvector)/Redis/Mailpit                                     | `.docker/dev/compose.yml.example` |

### 7.2 Thiết lập lần đầu

```bash
yarn install                                  # postinstall tự chạy `yarn affine init`

cp .docker/dev/compose.yml.example .docker/dev/compose.yml
cp .docker/dev/.env.example .docker/dev/.env
docker compose -f .docker/dev/compose.yml up -d postgres redis mailpit

yarn affine @affine/server-native build       # addon Rust — server bắt buộc cần

cp packages/backend/server/.env.example packages/backend/server/.env
# bỏ comment tối thiểu: DATABASE_URL, REDIS_SERVER_HOST, MAILER_HOST, MAILER_PORT

yarn affine server init                       # prisma migrate dev + data-migration run
```

### 7.3 Chạy (2 terminal)

```bash
yarn affine dev -p server     # backend  → http://localhost:3010
yarn affine dev -p web        # frontend → http://localhost:8080
```

Dev server tự proxy `/api`, `/graphql`, `/socket.io` sang cổng 3010 (`tools/cli/src/bundle-shared.ts`).

### 7.4 Tài khoản có sẵn khi `NODE_ENV=development`

Tạo tự động bởi `packages/backend/server/src/core/auth/dev.ts`:

| Email             | Mật khẩu | Đặc quyền                              |
| ----------------- | -------- | -------------------------------------- |
| `dev@affine.pro`  | `dev`    | quyền `administrator`, gói AI          |
| `pro@affine.pro`  | `pro`    | gói Pro + AI                           |
| `team@affine.pro` | `team`   | Pro + AI + sẵn "Team Workspace" 10 ghế |

### 7.5 Cổng dịch vụ

| Dịch vụ                 | Cổng                           |
| ----------------------- | ------------------------------ |
| Web dev server (Rspack) | 8080                           |
| Backend                 | 3010                           |
| Swagger (chỉ dev)       | http://localhost:3010/api/docs |
| Postgres                | 5432                           |
| Redis                   | 6379                           |
| Mailpit SMTP / Web UI   | 1025 / 8025                    |
| Manticore (tùy chọn)    | 9308                           |
| Prisma Studio           | 5555                           |

### 7.6 Lệnh khác

```bash
yarn affine dev -p admin        # admin panel (CÙNG cổng 8080 — phải tắt web trước)
yarn affine dev -p mobile       # bản mobile web
yarn affine dev -p renderer     # renderer cho Electron
yarn affine dev -p electron     # vỏ Electron (cần `yarn affine @affine/native build`)

yarn affine build -p web        # build production — LUÔN cần cờ -p
yarn affine server prisma studio  # GUI xem database
yarn affine server seed -h        # sinh dữ liệu mẫu

yarn lint                       # oxlint + oxfmt
yarn typecheck                  # tsc -b
yarn test                       # vitest (unit)
yarn affine @affine/server test # AVA (backend, cần pg + redis)
```

### 7.7 Cách tự host bằng Docker (không cần build)

Nếu chỉ muốn _dùng_ chứ không sửa code, dùng `.docker/selfhost/compose.yml`: image `ghcr.io/toeverything/affine:stable` + Postgres(pgvector) + Redis, chạy ở cổng **3010**, lần đầu vào sẽ tự chuyển tới `/admin/setup` để tạo tài khoản quản trị.

### 7.8 Những chỗ tài liệu gốc đã lỗi thời

- `packages/backend/server/README.md` ghi GraphQL ở cổng 3000 — thực tế mặc định là **3010**.
- `.codesandbox/task.json` gọi `yarn dev-core` — script này không còn tồn tại.
- `docs/building-desktop-client-app.md` dùng `yarn build` không cờ — nay `--package/-p` là bắt buộc.
- `docs/developing-server.md` nhắc "mailhog" — compose thực tế dùng **mailpit**.

---

_Tài liệu này được viết dựa trên mã nguồn tại thời điểm branch `canary`, version 0.27.0._
