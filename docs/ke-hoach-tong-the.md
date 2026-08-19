> Bản kế hoạch gốc duyệt ngày 16/08/2026, khôi phục từ transcript phiên làm việc ngày 17/08/2026.
> Tiến độ thực tế xem cuối tài liệu.

# Nền tảng cờ vua thương mại trên nền AFFiNE MIT

## Bối cảnh

Bạn xây một sản phẩm cờ vua **bán thương mại**, phục vụ cả học viện/CLB, kỳ thủ cá nhân và sản xuất nội dung. Sau vòng tư vấn đầu, bạn đã chốt bốn quyết định thay đổi căn bản kiến trúc:

1. **Chỉ lấy phần frontend MIT của AFFiNE, tự viết backend riêng** — bỏ hẳn `packages/backend/**` và `packages/common/native/**` (thuộc "AFFiNE EE License", cấm bán).
2. **Dùng Arasan thay Stockfish** — Arasan là MIT nên nhúng và bán được, Stockfish là GPL-3.0 nên không.
3. **Loại bỏ mọi thành phần gây bất lợi cho việc bán thương mại** — rà toàn bộ giấy phép, nhãn hiệu, phụ thuộc.
4. **AI chạy bằng thuê bao hàng tháng, không phát sinh phí dùng thêm** — mượn CLI dạng agent của nhà cung cấp (Claude Code, Codex, Grok) theo đúng mô hình `D:\code\javis-os`.

Cả bốn quyết định đều đúng hướng. Quyết định #2 đặc biệt tốt: vì Arasan là MIT, bạn được phép làm điều mà Stockfish cấm — **nhúng engine chạy thẳng trong máy người dùng**, phân tích offline, chi phí server bằng không.

**Nói thẳng về quy mô:** kế hoạch này lớn hơn nhiều so với bản trước. Tự viết backend + build engine WASM + lớp AI đa nhà cung cấp là khối lượng **9-15 tháng cho một nhóm nhỏ**, không phải 4-8 tuần. Nhưng có một lối đi khiến rủi ro thấp hẳn, xem TL;DR mục 3.

---

## TL;DR — 6 kết luận

1. **Ranh giới MIT rất sạch và đủ dùng.** `blocksuite/` + `packages/frontend/**` + `packages/common/**` (trừ `native/`) đều MIT. Quan trọng hơn: `packages/common/graphql` (192 file `.gql`) và `packages/common/nbstore/src/impls/cloud/` **cũng là MIT** — chúng mô tả chính xác API mà frontend cần ở server. Bạn có **đặc tả backend viết sẵn, hợp pháp**, không cần đọc code backend EE dòng nào.

2. **Arasan MIT đã xác minh** — từ v14.0, và giấy phép phủ cả thư mục `network` (file trọng số NNUE). Thư mục `chess-openings` là CC0. Không có ngoại lệ cho tablebase/book. → Nhúng client-side WASM được, bán được, không copyleft.

3. **Phase 1 không cần backend nào cả.** AFFiNE frontend chạy local-first: IndexedDB trên web, SQLite trên desktop. Toàn bộ trải nghiệm soạn thảo cờ vua (bàn cờ, PGN, phân tích Arasan trong máy, AI qua CLI) demo được và **bán được như app desktop** trước khi viết một dòng backend. Backend chỉ cần khi muốn đồng bộ đa thiết bị và cộng tác nhiều người. **Đây là cách cắt rủi ro lớn nhất của kế hoạch.**

4. **Mô hình AI thuê bao ép sản phẩm phải là app desktop / self-host, và đó là điều tốt.** Dùng thuê bao Claude Code / ChatGPT / SuperGrok **của chính người dùng cuối**, chạy trên máy họ, là hợp lệ. Nhưng nếu bạn host tập trung rồi phục vụ khách bằng thuê bao _của bạn_ thì gần như chắc chắn vi phạm ToS và sẽ bị khoá tài khoản. → Bán **phần mềm**, không bán inference. Chi phí AI biên của bạn bằng **0**. Xem [Phần D](#phần-d--lớp-ai-chạy-bằng-thuê-bao).

5. **Grok đã có OAuth thuê bao từ 5/2026** (SuperGrok / X Premium+, PKCE qua `auth.x.ai`, không cần API key) → yêu cầu tích hợp Grok của bạn khả thi, ngang hàng Claude và Codex.

6. **Rủi ro lớn nhất còn lại là nhà cung cấp cắt đường CLI.** Chính javis-os đã dính: Google ngắt Gemini CLI với tài khoản cá nhân ngày 18/06/2026 (ghi trong `server/gemini_cli.py:59`). Bắt buộc phải có đường API dự phòng và thiết kế để đổi engine không gãy sản phẩm.

---

## Phần A — Ranh giới sạch: giữ gì, bỏ gì

### A.1 Giữ (toàn bộ MIT)

| Thư mục                                                                     | Vai trò                                    | Ghi chú                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `blocksuite/**`                                                             | Nhân editor: block, gfx, widget, data-view | Nơi cắm block cờ vua                                           |
| `packages/frontend/core`                                                    | ~70 module tính năng                       | Bộ não app                                                     |
| `packages/frontend/component`                                               | Design system + cầu React↔Lit              | Nơi đặt component bàn cờ                                       |
| `packages/frontend/i18n`                                                    | 26 ngôn ngữ (thiếu tiếng Việt)             |                                                                |
| `packages/frontend/apps/{web,electron,mobile}`                              | Vỏ ứng dụng                                | Desktop là bản chính                                           |
| `packages/common/infra`, `nbstore`, `graphql`, `realtime`, `auth`, `theme`… | DI, storage/sync, GraphQL client           | **`graphql` + `nbstore/impls/cloud` = đặc tả backend của bạn** |
| `tools/cli`, `tools/utils`                                                  | Lệnh `yarn affine`, cấu hình Rspack        |                                                                |

### A.2 Bỏ hẳn

| Thư mục                                  | Lý do                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/backend/**`                    | AFFiNE EE License — _"forbidden to copy, merge, publish, distribute, sublicense, and/or sell"_ |
| `packages/common/native/**`              | Cùng giấy phép EE                                                                              |
| `packages/frontend/admin`                | Là UI cho backend EE, viết lại theo backend mới                                                |
| `.docker/selfhost/**`, `.github/helm/**` | Hạ tầng của backend cũ                                                                         |

### A.3 Cắt trong frontend (giảm bề mặt bảo trì)

Cắt bằng cách **bỏ đăng ký extension trước, xoá file sau** — dễ hoàn tác. Điểm cắt: mảng trong [manager/view.ts:85](packages/frontend/core/src/blocksuite/manager/view.ts#L85) và [all/src/extensions/view.ts:60](blocksuite/affine/all/src/extensions/view.ts#L60).

Ứng viên cắt: embed Figma/Loom/GitHub, tích hợp Readwise (`modules/integration`), Typst preview, payment/subscription UI, license UI, calendar. **Giữ**: comment (chấm bài), share-doc (xuất bản ván đấu), database/data-view, edgeless, frame present (bài giảng), recording desktop (ghi buổi dạy).

---

## Phần B — Backend mới

### B.1 Nguồn đặc tả hợp pháp

Không cần đọc backend EE. Ba nguồn MIT nói đủ mọi thứ:

| Nguồn                                                                              | Cho biết                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/common/graphql/src/graphql/**` (192 file `.gql`)                         | Chính xác từng query/mutation frontend gửi, kèm biến và trường trả về                                              |
| [nbstore/impls/cloud/socket.ts](packages/common/nbstore/src/impls/cloud/socket.ts) | Hợp đồng socket.io: `space:join`, `space:push-doc-update`, `space:broadcast-doc-update`, `space:update-awareness`… |
| `nbstore/impls/cloud/{doc,blob,awareness,indexer}.ts`                              | Ngữ nghĩa từng kênh: doc sync, blob, con trỏ realtime, tìm kiếm                                                    |

API không được bảo hộ bản quyền như code (Google v. Oracle), và ở đây bạn còn đọc từ client MIT chứ không đọc server EE — vị thế pháp lý sạch.

### B.2 Chỉ làm tập con thật sự cần

Trong 192 file `.gql`, phần lớn thuộc tính năng bạn cắt. Tập tối thiểu cho sản phẩm cờ vua:

| Nhóm      | Cần                                         | Bỏ                                                                                 |
| --------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Auth      | đăng ký, đăng nhập, phiên, đổi mật khẩu     | OAuth bên thứ 3 (thêm sau)                                                         |
| Workspace | tạo/xoá/liệt kê, mời thành viên, phân quyền | —                                                                                  |
| Doc sync  | **socket.io**, không phải GraphQL           | —                                                                                  |
| Blob      | upload/list/delete (ảnh, PGN, ghi âm)       | multipart nâng cao (thêm sau)                                                      |
| Comment   | tạo/sửa/xoá/resolve                         | —                                                                                  |
| —         | —                                           | **payment, license, calendar, copilot, admin, indexer** (copilot thay bằng Phần D) |

Ước lượng: **~35-45 endpoint GraphQL + 8 sự kiện socket**. Đây là công việc nặng nhưng xác định rõ, không mơ hồ.

### B.3 Đề xuất stack: hai service

**Service 1 — Sync/Doc (Node + Fastify + Yjs)**

Lý do chọn Node: Yjs là thư viện JS gốc; merge update CRDT ở Node dùng chính `yjs` (MIT) mà frontend đang dùng → không lệch phiên bản, không lệch hành vi. Postgres lưu bảng `Update` (nhật ký) + `Snapshot` (gộp định kỳ), giống mô hình AFFiNE mà bạn đã hiểu.

**Service 2 — AI Orchestrator (Python + FastAPI)**

Đây là chỗ **tái sử dụng thẳng javis-os**: `claude_sdk_engine.py`, `claude_cli.py` (CodexCLI), `gemini_cli.py`, `mcp_hub.py`, `engine.py`. Bạn đã có mã chạy được, đã xử lý các cạnh khó (PATH của tiến trình nền trên macOS, kill cây tiến trình trên Windows, resume phiên, watchdog treo). Đừng viết lại.

Tách hai service là cố ý: sync là I/O CRDT thuần, AI là điều phối tiến trình con — vòng đời, cách scale và cách hỏng đều khác nhau.

**Bản desktop**: cả hai chạy nhúng trong Electron main process, người dùng không thấy. Bản self-host: hai container.

---

## Phần C — Engine Arasan

### C.1 Vì sao Arasan mở khoá một kiến trúc tốt hơn

Arasan (từ v14.0) là **MIT**, phủ cả `src`, `book`, `doc`, `prj`, `tests` và **`network`** (trọng số NNUE); `chess-openings` là **CC0**. Không có ngoại lệ nào cho tablebase hay opening book. So sánh:

|                                   | Stockfish (GPL-3.0)            | Arasan (MIT)                        |
| --------------------------------- | ------------------------------ | ----------------------------------- |
| Nhúng WASM vào app bán thương mại | ❌ Buộc mở mã toàn bộ frontend | ✅ Tự do                            |
| Chạy server-side                  | ✅ (tiến trình riêng)          | ✅                                  |
| Phân tích offline                 | ❌                             | ✅                                  |
| Chi phí server cho phân tích      | Cao                            | **0**                               |
| Sức mạnh                          | #1 thế giới                    | ~top 15 — vẫn vượt xa mọi con người |

Với mục đích huấn luyện, chênh lệch sức mạnh **hoàn toàn không quan trọng**. Arasan mạnh hơn nhà vô địch thế giới rất nhiều.

### C.2 Việc phải làm

| #   | Việc                                                                                                             | Công sức |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| C1  | Build Arasan sang WASM bằng Emscripten (SIMD + pthreads) — Arasan không có bản WASM chính thức, đây là việc thật | M-L      |
| C2  | Bọc UCI trong Web Worker, API: `analyze(fen, depth, multipv)`, `stop()`, streaming eval                          | M        |
| C3  | Bản native cho desktop (binary Arasan gọi qua Node child process) — nhanh hơn WASM 2-4×                          | S        |
| C4  | Cache eval theo FEN trong IndexedDB/SQLite — khai cuộc trùng nhau rất nhiều, tỉ lệ trúng cao                     | S        |
| C5  | Bản server-side tuỳ chọn cho phân tích sâu hàng loạt                                                             | M        |
| C6  | Hạ cấp mượt: WASM không hỗ trợ (trình duyệt cũ) → gọi server                                                     | S        |

**Rủi ro C1**: nếu build WASM gặp khó (Arasan dùng nhiều pthread/intrinsics), phương án dự phòng là chạy native trên desktop trước (C3, dễ) và bản web dùng server (C5). Không chặn sản phẩm.

**Kiểm chứng bắt buộc**: chạy bộ test **perft** và bộ vị trí chiến thuật chuẩn (WAC, ECM) để xác nhận bản WASM cho kết quả đúng như bản native.

---

## Phần D — Lớp AI chạy bằng thuê bao

### D.1 Nguyên lý (lấy từ javis-os)

> _"Javis **không gọi thẳng API model**. Javis mượn **CLI dạng agent** của nhà cung cấp làm bộ não, để tận dụng chính **gói subscription** người dùng đang trả thay vì bắt họ mua API riêng."_ — [docs/dev/01-kien-truc.md](D:/code/javis-os/docs/dev/01-kien-truc.md)

Điểm mấu chốt: **không bao giờ đọc token của ai**. Gọi đúng binary `claude` / `codex` / `grok` trên máy, để chính sản phẩm của nhà cung cấp lo đăng nhập. Bạn chỉ bọc bên ngoài.

### D.2 Ma trận nhà cung cấp

| Provider            | Đường thuê bao                                              | Trạng thái                                                               | Nguồn tham chiếu             |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **Claude**          | `claude` qua Claude Agent SDK, phiên Claude Code sẵn có     | ✅ Chạy tốt trong javis                                                  | `claude_sdk_engine.py`       |
| **Codex (ChatGPT)** | `codex exec`, spawn Popen + thread                          | ✅ Chạy tốt                                                              | `claude_cli.py` → `CodexCLI` |
| **Grok**            | OAuth `auth.x.ai` (PKCE + S256), cần SuperGrok / X Premium+ | ✅ Khả thi, xAI mở OAuth từ 5/2026 — **javis chưa làm, đây là phần mới** | —                            |
| **Gemini**          | `gemini` CLI, đăng nhập Google                              | ⚠️ Google đã ngắt tài khoản cá nhân 18/06/2026                           | `gemini_cli.py:59`           |
| API thuần           | OpenRouter / Anthropic / OpenAI / Groq / Ollama             | ✅ Đường dự phòng, có tính phí                                           | `engine.py`                  |

### D.3 Hợp đồng engine (giữ nguyên từ javis)

```
.query(prompt) -> async yield {type: text | tool_call | tool_result | final | error}
```

Mọi engine tuân cùng một hợp đồng ⇒ thêm Grok chỉ là viết một class mới, không đụng phần còn lại. Đây chính là lý do thiết kế này chịu được việc nhà cung cấp cắt đường (rủi ro TL;DR #6).

### D.4 MCP Hub + tool cờ vua

Hub là **cổng tool duy nhất**: CLI agent nhìn hub như một MCP server HTTP; engine API gọi in-process. Hub kiểm quyền 3 mức và ghi audit. Bạn thêm vào hub các tool cờ vua:

| Tool                                 | Việc                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `chess.analyze`                      | Gọi Arasan → eval, best line, multipv                           |
| `chess.scan_game`                    | Quét cả ván, gắn nhãn Inaccuracy / Mistake / Blunder, tính ACPL |
| `chess.explorer`                     | Opening explorer (Lichess API, dữ liệu CC0)                     |
| `chess.tablebase`                    | Syzygy ≤7 quân                                                  |
| `chess.read_doc` / `chess.write_doc` | Đọc/ghi block cờ trong tài liệu đang mở                         |
| `chess.make_puzzle`                  | Sinh bài tập từ điểm blunder                                    |

**Đây là chỗ tạo khác biệt lớn nhất của sản phẩm.** LLM chơi cờ rất tệ và bịa nước đi; nhưng khi nó _phải_ gọi Arasan để lấy số liệu rồi mới diễn giải, chất lượng chú giải nhảy vọt. Và vì AI là agent có tool ghi tài liệu, nó **tự chú giải thẳng vào ván đấu** chứ không chỉ trả lời trong khung chat.

### D.5 Ràng buộc ToS — quyết định mô hình kinh doanh

Dùng thuê bao tiêu dùng để phục vụ bên thứ ba gần như chắc chắn vi phạm điều khoản của Anthropic/OpenAI/xAI. Nên:

| Mô hình                                                     | Hợp lệ | Ghi chú                    |
| ----------------------------------------------------------- | ------ | -------------------------- |
| App desktop, người dùng đăng nhập **thuê bao của chính họ** | ✅     | **Chọn cái này**           |
| Self-host, mỗi tổ chức dùng tài khoản của tổ chức           | ✅     | Cho học viện               |
| Bạn host tập trung, chạy AI bằng thuê bao **của bạn**       | ❌     | Vi phạm ToS, sẽ bị khoá    |
| Bạn host, khách nhập API key riêng (BYOK)                   | ✅     | Đường dự phòng có tính phí |

Hệ quả tốt: bạn bán **phần mềm**, chi phí AI biên bằng 0, giá bán không bị API cost ăn mòn.

Việc phải làm: đọc ToS hiện hành của cả ba nhà cung cấp, và ghi rõ trong tài liệu sản phẩm rằng người dùng cần thuê bao riêng.

---

## Phần E — Rà soát giấy phép thương mại

### E.1 Thư viện cờ vua

| Thư viện                                      | Giấy phép                                       | Quyết định                                        |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| **Arasan**                                    | **MIT** (đã xác minh, v14.0+, phủ cả `network`) | ✅ **Engine chính**                               |
| `chess.js`                                    | BSD-2-Clause                                    | ✅ Luật đi quân, FEN                              |
| `@mliebelt/pgn-parser`                        | MIT                                             | ✅ PGN có biến lồng, NAG, comment                 |
| `cm-chessboard`                               | MIT                                             | ✅ Dùng hoặc tham khảo                            |
| Arasan `chess-openings`                       | CC0                                             | ✅ Thư viện khai cuộc                             |
| Lichess opening explorer / tablebase / puzzle | API free; dữ liệu CC0                           | ✅ Cache lại, đọc ToS                             |
| Stockfish, Lc0                                | GPL-3.0                                         | ❌ **Loại**                                       |
| `chessground`, `chessops` (Lichess)           | GPL-3.0                                         | ❌ **Loại**                                       |
| Bộ quân cờ Lichess                            | GPL / CC-BY-SA tuỳ bộ                           | ❌ **Đặt vẽ riêng** — vừa sạch vừa là thương hiệu |
| Chess.com API                                 | ToS hạn chế thương mại                          | ⚠️ Đọc kỹ trước khi phụ thuộc                     |

> Bảng này phải được **verify lại bằng file LICENSE thật** trong `node_modules` / repo tại thời điểm cài, rồi chốt vào `THIRD-PARTY-NOTICES`.

### E.2 Quy trình rà soát bắt buộc

| #   | Việc                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Chạy công cụ quét giấy phép trên toàn bộ cây phụ thuộc frontend; **chặn** GPL/AGPL/SSPL/BUSL/CC-BY-NC lọt vào bundle                                |
| E2  | Kiểm riêng **font** đang bundle (`AffineCanvasTextFonts`) — font hay vướng giấy phép hạn chế nhúng                                                  |
| E3  | **Rebrand toàn diện**: tên, logo, icon, URL scheme `affine://`, mọi chuỗi "AFFiNE" trong UI. MIT **không** cấp quyền nhãn hiệu — giữ tên là vi phạm |
| E4  | Sinh `THIRD-PARTY-NOTICES` tự động trong CI, kèm vào bản phát hành                                                                                  |
| E5  | Thêm cổng CI chặn merge nếu xuất hiện phụ thuộc copyleft mới                                                                                        |
| E6  | Giữ bản ghi nguồn gốc: fork từ commit nào của AFFiNE, kèm `LICENSE-MIT` gốc và ghi công                                                             |

Điểm cắm rebrand: [utils/channel.ts:29-41](packages/frontend/core/src/utils/channel.ts#L29-L41) (`appNames`, `appIconMap`, `appSchemes`).

---

## Phần F — Lộ trình

Nguyên tắc xuyên suốt: **mỗi giai đoạn phải ra được thứ bán được**, không chờ đến cuối.

| GĐ     | Thời gian  | Nội dung                                                                                      | Sản phẩm bán được                                            |
| ------ | ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **P0** | 2-3 tuần   | Tách fork MIT, bỏ backend EE, rebrand (E1-E6), dựng CI                                        | —                                                            |
| **P1** | 6-10 tuần  | Block bàn cờ + PGN + edgeless + tiếng Việt. **Không backend**                                 | **App desktop local-first** — soạn giáo án, chú giải ván đấu |
| **P2** | 6-8 tuần   | Arasan (WASM + native), quét ván, thanh eval, cache                                           | Desktop **có phân tích offline** — đã đủ bán cho kỳ thủ      |
| **P3** | 6-8 tuần   | Lớp AI thuê bao (port javis-os) + tool cờ vua qua MCP Hub                                     | Desktop **có HLV AI** — khác biệt lớn nhất                   |
| **P4** | 10-14 tuần | Backend riêng: auth, workspace, doc sync, blob, comment                                       | **Bản cộng tác** — bán cho học viện/CLB                      |
| **P5** | 8-12 tuần  | Dữ liệu & sư phạm: import PGN/Lichess, database ván đấu, giao–nộp–chấm bài, ôn tập ngắt quãng | Bản đầy đủ cho học viện                                      |
| **P6** | tuỳ        | Mobile, tìm theo mẫu thế cờ, gói cước                                                         | Mở rộng thị trường                                           |

Thứ tự này khiến **backend — phần rủi ro và tốn kém nhất — bị đẩy xuống sau khi đã có doanh thu và đã kiểm chứng thị trường**. Nếu P1-P3 không bán được, bạn dừng lại mà chưa mất 3 tháng viết backend.

---

## Phần G — Phase 1 chi tiết (thực thi được ngay, không cần backend)

### G.1 `blocksuite/chess/core` — logic thuần

Package mới; workspace tự nhận nhờ glob `blocksuite/**/*` trong [package.json:7-16](package.json#L7-L16).

- Bọc `chess.js` (luật đi, FEN) + `@mliebelt/pgn-parser` (biến lồng, NAG, comment)
- Kiểu: `Fen`, `San`, `MoveNode`/`MoveTree`, `Nag`, `GameHeader` (Event, Site, Date, Round, White, Black, Result, ECO, WhiteElo, BlackElo, TimeControl)
- Hàm: `parsePgn`, `serializePgn`, `fenToPosition`, `legalMoves`, `applyMove`, `navigate(tree, path)`
- **Test vitest bắt buộc**: round-trip PGN thật có biến lồng 3 tầng + comment + NAG phải ra đúng chuỗi gốc; đối chiếu perft

### G.2 `packages/frontend/component/src/chess/` — bàn cờ (React, MIT)

- `<Chessboard fen orientation arrows highlights interactive onMove coordinates />`
- SVG, responsive, dùng token vanilla-extract sẵn có → tự đúng theme sáng/tối
- Lớp overlay mũi tên + tô ô (chuột phải kéo)
- Bộ quân SVG **đặt vẽ riêng** (sạch giấy phép + là nhận diện thương hiệu)
- Kèm `.stories.tsx` — repo đã dùng Storybook

### G.3 `blocksuite/chess/block-board` — `affine:chess-board`

Theo đúng khuôn block `callout` đã đọc:

| File                          | Nội dung                                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model.ts`                | `defineBlockSchema({ flavour: 'affine:chess-board', props: { fen, orientation, arrows, highlights, caption }, metadata: { version: 1, role: 'content', parent: ['affine:note','affine:paragraph','affine:edgeless-text'], children: [] } })` + `BlockSchemaExtension` |
| `src/board-block.ts`          | Lit element, render React qua `ReactToLit` (mẫu: [pdf-view.tsx](packages/frontend/core/src/blocksuite/view-extensions/pdf/pdf-view.tsx))                                                                                                                              |
| `src/edgeless-board-block.ts` | Bản whiteboard (mẫu: `embed-edgeless-figma-block.ts`)                                                                                                                                                                                                                 |
| `src/configs/slash-menu.ts`   | `/board`, `/fen`, `/theco`                                                                                                                                                                                                                                            |
| `src/configs/toolbar.ts`      | Lật bàn, copy FEN, phân tích, xoá                                                                                                                                                                                                                                     |
| `src/view.ts`                 | `ChessBoardViewExtension extends ViewExtensionProvider`, phân nhánh theo `context.scope`                                                                                                                                                                              |
| `src/store.ts`                | `ChessBoardStoreExtension` — schema + markdown adapter                                                                                                                                                                                                                |

### G.4 `blocksuite/chess/block-game` — `affine:chess-game`

- Props: `pgn`, `currentPath`, `orientation`, `showCoordinates`
- UI: bàn cờ + movelist (biến lồng thụt lề, comment sửa tại chỗ) + `⏮ ◀ ▶ ⏭` + lật bàn + copy FEN/PGN
- Bàn phím: `←/→` đi nước, `↑/↓` chuyển biến, `f` lật bàn
- **PGN là nguồn sự thật duy nhất** — sửa chú giải ghi ngược vào chuỗi PGN, tránh lệch trạng thái

### G.5 Nhập liệu nhanh

Paste FEN → tạo block bàn cờ; paste PGN → tạo block ván đấu (mẫu: paste link YouTube → embed). Kéo thả `.pgn` vào doc → sinh danh sách ván.

### G.6 Đăng ký

- [manager/view.ts](packages/frontend/core/src/blocksuite/manager/view.ts): thêm `ChessBoardViewExtension`, `ChessGameViewExtension` vào mảng constructor + `chess:` vào type `Configure` và `_initDefaultConfig`
- [manager/store.ts](packages/frontend/core/src/blocksuite/manager/store.ts): thêm store extension tương ứng
- [feature-flag/constant.ts](packages/frontend/core/src/modules/feature-flag/constant.ts): cờ `enable_chess_blocks`

### G.7 Tiếng Việt

Thêm `packages/frontend/i18n/src/resources/vi.json`, đăng ký trong [resources/index.ts](packages/frontend/i18n/src/resources/index.ts). Namespace riêng `chess.*`. **Chốt từ điển thuật ngữ trước khi dịch** (Tốt/Mã/Tượng/Xe/Hậu/Vua, nhập thành, bắt tốt qua đường, chiếu hết, thí quân…) — làm một lần, dùng xuyên suốt.

---

## Phần H — Kiểm chứng

| Lớp              | Cách kiểm                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Logic cờ         | `yarn test` — round-trip PGN có biến lồng/NAG/comment; perft đối chiếu bộ chuẩn                                          |
| Engine Arasan    | Bản WASM phải cho **cùng kết quả** bản native trên bộ test chiến thuật (WAC, ECM) và perft                               |
| Bàn cờ           | Storybook — theme sáng/tối, mũi tên, kéo quân                                                                            |
| Tích hợp editor  | `yarn affine dev -p web` → tạo doc → `/board`, `/game` → kiểm **cả page mode và edgeless mode**                          |
| Bền vững dữ liệu | Reload giữ nguyên FEN/PGN; 2 tab kiểm đồng bộ CRDT cục bộ                                                                |
| Nhập/xuất        | Paste FEN, paste PGN, kéo `.pgn`, export markdown                                                                        |
| Lớp AI           | Kiểm từng engine (Claude/Codex/Grok) chạy được với thuê bao; kiểm hub **từ chối thật** tool ngoài whitelist và ghi audit |
| E2E              | Playwright trong `tests/`                                                                                                |
| Chất lượng       | `yarn typecheck` + `yarn lint` sạch                                                                                      |
| **Giấy phép**    | CI quét phụ thuộc, **fail build** nếu có copyleft; sinh `THIRD-PARTY-NOTICES`                                            |

---

## Rủi ro & cách chặn

| Rủi ro                                                                        | Mức                | Cách chặn                                                                                          |
| ----------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| Nhà cung cấp cắt đường CLI thuê bao (Google đã làm với Gemini CLI 18/06/2026) | **Cao**            | Hợp đồng engine chung; luôn giữ đường API/BYOK dự phòng; đừng để một provider thành phụ thuộc chết |
| Vi phạm ToS nếu host tập trung bằng thuê bao của bạn                          | **Cao**            | Chỉ mô hình BYO-subscription, chạy trên máy người dùng (Phần D.5)                                  |
| Build Arasan sang WASM khó hơn dự kiến                                        | Trung bình         | Ưu tiên native desktop trước; web dùng server; không chặn sản phẩm                                 |
| Viết lại backend phình to                                                     | **Cao**            | Đẩy xuống P4, sau khi P1-P3 đã bán được; chỉ làm tập con ~40 endpoint                              |
| Frontend MIT vẫn tham chiếu API backend EE cũ                                 | Trung bình         | Đặc tả lấy từ `common/graphql` + `nbstore/impls/cloud` (đều MIT)                                   |
| Copyleft lọt vào bundle qua phụ thuộc gián tiếp                               | Trung bình         | Cổng CI (E5)                                                                                       |
| Nhãn hiệu AFFiNE còn sót                                                      | Thấp nhưng dễ dính | Rebrand toàn diện (E3) + grep chuỗi trong CI                                                       |

---

## Ba việc cần bạn quyết (không chặn P1)

1. **Nền tảng phát hành đầu tiên**: Windows desktop, hay web? → ảnh hưởng thứ tự C1 (WASM) vs C3 (native).
2. **Ai vẽ bộ quân cờ**? Đây là đường găng của giao diện và là tài sản thương hiệu — nên đặt ngay từ P0.
3. **Nguồn ván đấu chính**: Lichess, hay kho PGN nội bộ của công ty? → quyết định thứ tự nhập liệu ở P5.

---

_Nguồn xác minh giấy phép Arasan: [arasan-chess/LICENSE](https://github.com/jdart1/arasan-chess/blob/master/LICENSE) · [Arasan Chess Engine Licensing](https://www.arasanchess.org/license.shtml)_
_Nguồn xác minh Grok OAuth: [grok-cli (OAuth-first)](https://github.com/Moore-developers/grok-cli) · [xAI Grok OAuth — Hermes Agent](https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth)_

---

# Tiến độ thực tế (cập nhật 19/08/2026)

## Đã xong — 15 PR merge vào `canary` của covuaduongsinh/AFFiNE

| PR      | Nội dung                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1      | `blocksuite/chess/core` — engine luật cờ tự viết (0x88), parse/ghi PGN có biến lồng, perft depth 5                                                                                     |
| #2      | Component bàn cờ React (SVG, theme sáng/tối, bộ quân hình học tự vẽ — chưa phải bộ đặt vẽ)                                                                                             |
| #3      | Block `affine:chess-board` (page mode) + slash menu                                                                                                                                    |
| #4      | Block `affine:chess-game` — movelist, replay, biến lồng                                                                                                                                |
| #5      | Sửa specifier `.js` (lỗi dev-server)                                                                                                                                                   |
| #6      | Paste FEN/PGN tự tạo block — nhận diện bảo thủ, 22 test chống nhận nhầm văn xuôi                                                                                                       |
| #7      | Bàn cờ trên whiteboard (edgeless) — `GfxCompatible`, sửa `SurfaceBlockSchema` (file upstream duy nhất bị đụng)                                                                         |
| #8      | Sửa bàn cờ 0px + `scripts/serve-dist.mjs` (né Kaspersky proxy) + bộ E2E đầu tiên                                                                                                       |
| #9      | Đồng bộ cỡ bàn 420px mọi ngữ cảnh                                                                                                                                                      |
| #10     | Chế độ sửa đủ bộ: ô soạn PGN, chú giải !/?/!!/??, promote biến, delete-from, toolbar block                                                                                             |
| #11–#15 | Năm đợt sửa nhập liệu: dán bị cướp → focus bị block chọn ghim → không undo được → autofocus → **lá chắn window-capture + tự phục hồi phím bị giết + nút Dán PGN + dòng chẩn đoán v15** |

Kiểm chứng hiện tại: 109 unit test chess-core, 20/20 E2E trên production build (gồm ca mô phỏng extension giết phím), tsc/oxlint/oxfmt sạch.

## Trạng thái theo lộ trình

| GĐ    | Kế hoạch                                                  | Trạng thái                                                                                                                                            |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0    | Tách fork MIT, bỏ backend EE, rebrand, CI giấy phép       | **Chưa làm** — đang build trên cây AFFiNE đầy đủ; EE vẫn trong tree, chưa rebrand                                                                     |
| P1    | Block bàn cờ + PGN + edgeless + tiếng Việt, không backend | **~95%** — còn: kéo-thả file `.pgn`; mục edgeless toolbar tạo bàn trên canvas; dịch tiếng Việt mới có khung (`vi.json` 5 chuỗi); bộ quân đặt vẽ riêng |
| P2    | Arasan WASM + native, quét ván, thanh eval                | **Đường chính xong (Windows native)** — [docs/p2-ket-qua-ban-giao.md](p2-ket-qua-ban-giao.md). WASM / macOS / Linux còn nợ                            |
| P3    | Lớp AI thuê bao + tool cờ MCP                             | **Đóng** — Claude Max + Grok Build đã chạy trên desktop Windows. [docs/p3-ket-qua-ban-giao.md](p3-ket-qua-ban-giao.md) §8 mở P4                       |
| P4    | Backend riêng (~40 endpoint + 8 socket)                   | **Chưa bắt đầu** — đặc tả MIT sẵn; không đọc EE                                                                                                       |
| P5–P6 | Sư phạm, database ván, mobile                             | Chưa bắt đầu                                                                                                                                          |

## Ba câu hỏi từ kế hoạch gốc vẫn chờ bạn quyết

1. Nền tảng phát hành đầu tiên: **Windows desktop hay web?** (quyết thứ tự Arasan native vs WASM)
2. **Ai vẽ bộ quân cờ?** — tài sản thương hiệu, nên đặt sớm
3. Nguồn ván đấu chính: **Lichess hay kho PGN nội bộ?**
