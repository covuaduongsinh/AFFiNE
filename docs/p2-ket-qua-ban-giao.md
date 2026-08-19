# P2 — Kết quả bàn giao (cơ sở mở P3)

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| **Ngày**       | 2026-08-19                                                                          |
| **Nhánh**      | `chess-editing-suite`                                                               |
| **Design**     | [docs/p2-arasan-engine.md](p2-arasan-engine.md)                                     |
| **Kế hoạch**   | [docs/ke-hoach-tong-the.md](ke-hoach-tong-the.md) — Phase 2                         |
| **Trạng thái** | **Đường chính P2 đã xong** trên desktop Windows. WASM / macOS / Linux là track phụ. |

Tài liệu này ghi **cái đã chạy trên máy**, **chỗ P3 được phép móc**, và **cái P3 không được đụng** trừ khi mở rộng có chủ đích.

---

## 1. P2 đã giao gì

Sản phẩm P2: **app desktop local-first có phân tích offline**, không mạng, không backend, không GPL Stockfish.

Đã xác nhận trên Electron Windows (doc `demo-co-vua`, ván Evergreen + Scholar’s mate):

| Tính năng             | Kết quả trên máy                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Analyze vị trí        | Thanh eval, điểm (+0.76 / −1.20…), PV SAN, mũi tên nước 1 (không ghi `props.arrows`)              |
| Scan game (main line) | Tiến độ `n / N`, nhãn Inaccuracy / Mistake / Blunder trên movelist, ACPL hai bên                  |
| Apply to PGN          | `[%eval …]` + NAG `?!` / `?` / `??`; **không xoá** `!` / `!!` / `!?` của người; một `captureSync` |
| Persist overlay       | `analysisJson` trên `affine:chess-game`; reload còn nhãn; Markdown **không** xuất JSON này        |
| Web                   | Nút Analyze/Scan disabled + “Offline analysis is available in the desktop app”; E2E 2/2 pass      |
| Schema                | `analysisJson` additive, default `''`, **version vẫn 1**                                          |

Không tự Apply sau Scan. PGN chỉ đổi khi người bấm **Gắn vào PGN**.

---

## 2. Việc đã làm theo PR (design)

| PR  | Việc                                                                                                                   | Trạng thái                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| PR1 | `@blocksuite/chess-engine`: kiểu UCI, parse `info`, win% Lichess, `scanGame`, cache memory, `uciToMove` / `pvUciToSan` | Xong, unit test package                        |
| PR2 | Vendor Arasan 26 Windows (AVX2 + SSE2), spawn UCI, IPC `chessEngine`                                                   | Xong; Hash = MB; không `gui/` / `book.bin`     |
| PR3 | `ChessEngineService`, IDB cache, flag `enable_chess_engine`, Native vs `NullEngineHost`                                | Xong                                           |
| PR4 | Eval bar, mũi tên PV, Analyze / Scan / Stop, depth 10–16                                                               | Xong; toolbar hover block **cố ý bỏ**          |
| PR5 | `analysisJson` + Apply `[%eval]` / NAG                                                                                 | Xong                                           |
| PR6 | E2E web + i18n `com.affine.chess.engine.*` (EN/VI)                                                                     | Xong (web đã chạy). Desktop e2e spec thích ứng |
| PR7 | WASM Arasan                                                                                                            | **Chưa** — không chặn P3                       |
| PR8 | Binary macOS / Linux                                                                                                   | **Chưa** — không chặn P3                       |

Sửa phát sinh khi chạy máy (không đổi hợp đồng P2):

- Parser bỏ dòng `info` không có score (tránh eval về `0.00`).
- Scan `stop()` live trước khi `go depth`; UI **Scanning…** + `n / N`.
- `stop()` không còn đánh `crashed` vĩnh viễn (Scan báo unavailable sau Analyze).
- Tab Electron: HMR cùng origin không che tab (tránh nhấp nháy / màn xương cá).
- Layout ván: movelist cuộn trong cột, Analyze kẹp đáy cạnh bàn; comment eval hiện gọn (`7.38` thay vì cả `[%eval 7.38]`).

---

## 3. Bản đồ code P3 được phép gọi

P3 **không spawn engine mới**. Một process Arasan / một `ChessEngine` cho cả app. P3 chỉ thêm adapter / tool gọi host sẵn có.

```
UI (chess-game-view / chess-board-view)
  → ChessEngineService.engine          @affine/core
       → EngineHost                    @blocksuite/chess-engine
            → NativeEngineHost         IPC chessEngine (Electron)
            → NullEngineHost           web
            → (P3) không thêm process
       → scan() / evaluate() / analyzePosition() / stop()
  → applyScanToGame / serializeGameScan
```

| API / chỗ                                               | P3 dùng để                                      |
| ------------------------------------------------------- | ----------------------------------------------- |
| `ChessEngine.evaluate(fen, depth, multipv)`             | Tool `chess.analyze` — một vị trí, có cache     |
| `ChessEngine.scan(game, { depth, signal, onProgress })` | Tool `chess.scan_game`                          |
| `ChessEngine.analyzePosition` / `lastInfo$`             | Live eval nếu HLV cần theo thế đang mở          |
| `ChessEngine.stop`                                      | Huỷ job khi user/agent dừng                     |
| `EngineHost` (`id`, `engineVersion`, `subscribe`)       | Adapter MCP: **không** nói chuyện UCI trực tiếp |
| `applyScanToGame` + `model.store.updateBlock`           | Tool ghi chú vào PGN — **một** `captureSync`    |
| `parsePgn` / `serializePgn` / `nodeAt` / `positionAt`   | `chess.read_doc` / `chess.write_doc`            |
| `analysisJson`                                          | Overlay nội bộ; **không** đưa vào markdown      |
| Flag `enable_chess_engine`                              | Tắt engine = tool analyze/scan fail rõ ràng     |

IPC Electron (đã expose qua preload):

- Handlers: `chessEngine.status` / `analyze` / `stop`
- Events: `chessEngine.info` / `bestmove` / `exit`

Binary: `packages/frontend/apps/electron/resources/arasan/` (`arasanx-64-avx2.exe`, `arasanx-64.exe`, `arasanv8-20260622.nnue`). Dev: `AFFINE_ARASAN_DIR`.

---

## 4. Hợp đồng dữ liệu P3 phải giữ

- **PGN là nguồn sự thật.** Không ghi đè PGN trừ khi user (hoặc tool P3 tương đương Apply) chủ động.
- **`analysisJson` không phải tài liệu.** Adapter markdown bỏ qua. HLV AI chú giải vào **comment / NAG trên PGN**, không nhét JSON vào fence.
- **Schema `affine:chess-game` version = 1.** Prop mới phải additive, default backfill.
- **Một job trên engine.** Live và scan không song song. Agent P3 xếp hàng qua `ChessEngine`, không `spawn` Arasan lần hai.
- **Phân loại win%** (`classify` / `labelForScores`) — không bịa ngưỡng cp riêng trong tool MCP.
- **MIT only.** Không Stockfish, không `chessground`/`chessops`, không piece set Lichess.

---

## 5. Còn nợ P2 (không chặn P3)

| Nợ                        | Ảnh hưởng P3                                      |
| ------------------------- | ------------------------------------------------- |
| WASM (PR7)                | Web/HLV trên browser chưa có engine               |
| Binary macOS/Linux (PR8)  | P3 desktop chỉ chắc trên Windows hiện tại         |
| Quét biến lồng            | Tool scan chỉ main line                           |
| Toolbar hover Analyze     | Engine ở `@affine/core`, không nhét vào block pkg |
| E2E desktop full Electron | Spec có; chưa chạy trên runner đóng gói           |
| P0 rebrand / cắt EE       | Vẫn trên cây AFFiNE đầy đủ                        |
| Nốt P1                    | Kéo `.pgn`, bộ quân đặt vẽ, i18n cờ đầy đủ        |

---

## 6. P3 — Section mở (bàn giao)

**Mục tiêu sản phẩm:** desktop **có HLV AI** — agent chạy bằng **thuê bao của chính user** (Claude Code / Codex / Grok), gọi tool cờ, **chú giải thẳng vào block** chứ không chỉ chat.

**Không làm trong P3:** backend (P4), server engine (C5/C6), host tập trung bằng thuê bao _của mình_ (vi phạm ToS), WASM trừ khi P2.x song song.

### 6.1 Nguyên tắc

1. LLM **không** tự bịa nước / eval. Mọi số liệu thế cờ đi qua `EngineHost` / `ChessEngine`.
2. Không đọc token nhà cung cấp. Spawn `claude` / `codex` / `grok` trên máy user.
3. Bán phần mềm, không bán inference. Chi phí AI biên = 0.
4. Hub tool **một cổng**: whitelist + audit. Agent chỉ thấy tool đã đăng ký.
5. `write_doc` **được tự Apply** sau scan (ghi `[%eval]` / NAG như nút Gắn vào PGN). Vẫn **một** `captureSync` — một Undo gỡ hết. User vẫn có nút Apply thủ công.

### 6.2 Việc P3 phải làm (thứ tự đã chốt)

| #   | Việc                                                                               | Ghi chú móc P2                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | Port lớp engine thuê bao từ javis-os; **Claude Code trước** (`claude` / Agent SDK) | Đã chạy trong javis                         |
| 2   | MCP Hub local + **CLI gắn được** (`claude` / sau này `grok` nhìn cùng tool)        | Một cổng với panel                          |
| 3   | Tool `chess.analyze` / `chess.scan_game` / `chess.read_doc`                        | Bọc `ChessEngine` + PGN block focus         |
| 4   | Tool `chess.write_doc` — **tự Apply** được (`applyScanToGame` hoặc comment/NAG)    | Một `captureSync`; Undo gỡ                  |
| 5   | **Panel HLV** cạnh editor / cạnh `affine:chess-game`                               | Bề mặt sản phẩm; không tắt Analyze/Scan tay |
| 6   | **Grok sau Claude** (OAuth `auth.x.ai`, SuperGrok / X Premium+)                    | Cùng hợp đồng `query`                       |
| 7   | Tool `chess.make_puzzle` (mỏng)                                                    | Blunder từ scan đã có                       |
| 8   | Đường API dự phòng (OpenRouter / key user)                                         | Rủi ro cắt CLI                              |

**Để P3.x / P4:** `chess.explorer` (Lichess CC0), `chess.tablebase` (Syzygy), sync cloud cho hội thoại HLV.

### 6.3 Việc P3 không được làm

- Spawn thêm process Arasan, nói UCI thô, hoặc nhúng Stockfish.
- Ghi PGN trong vòng lặp agent mà không `captureSync` / không undo được.
- Đẩy `analysisJson` ra markdown / xuất bản.
- Host AI trung tâm bằng thuê bao công ty.
- Bật COOP/COEP toàn app chỉ để WASM.
- Bump `metadata.version` của chess blocks.

### 6.4 Kiểm chứng P3 (khi làm)

- Scholar’s mate: agent gọi `chess.analyze` → nhận score/PV **trùng** panel Analyze (cùng FEN, cùng depth).
- Agent gọi `chess.scan_game` rồi `chess.write_doc` **tự Apply** → PGN có `[%eval]` / NAG; **một Undo** gỡ hết. Nút Apply thủ công vẫn đúng khi user tự scan.
- Tool ngoài whitelist bị **từ chối** và ghi audit.
- Tắt flag `enable_chess_engine` → tool analyze/scan fail rõ, UI Analyze disabled.
- Không có mạng: Analyze/Scan thủ công vẫn chạy; HLV chỉ fail phần LLM.

### 6.5 Quyết định đã chốt (2026-08-19)

| #   | Câu hỏi               | Quyết định                                                                                                                  |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | HLV sống ở đâu?       | **Cả hai:** panel desktop cạnh editor **và** CLI gắn MCP. Panel là bề mặt sản phẩm; CLI dùng cùng Hub.                      |
| 2   | Provider nào trước?   | **Claude Code trước**, **Grok ngay sau** (cùng hợp đồng engine).                                                            |
| 3   | `write_doc` tự Apply? | **Có.** Agent được ghi `[%eval]` / NAG sau scan như nút Gắn vào PGN. Một `captureSync` / một Undo. User vẫn Apply tay được. |

P3 có thể vào implement theo 6.2 mà không chờ quyết thêm.

---

## 7. Cách chạy lại P2 trên Windows (dev)

1. Native: `yarn affine @affine/native build` (đã có `packages/frontend/native`).
2. Renderer: `yarn affine dev -p @affine/electron-renderer` (`http://localhost:8080`).
3. Main: build `scripts/build-layers.ts` với `DEV_SERVER_URL=http://localhost:8080`, rồi `electron.exe` trỏ `packages/frontend/apps/electron`. **Không** để `NODE_OPTIONS=--import=tsx` lọt vào process Electron (`app` sẽ `undefined`).
4. Cửa sổ AFFiNE (không dùng tab Chrome). `/Chess game (example)` → Analyze / Scan / Apply.

Web: `yarn affine dev -p @affine/web` — chỉ kiểm UI unavailable.

---

## 8. Liên kết

- Design P2: [p2-arasan-engine.md](p2-arasan-engine.md)
- Lộ trình: [ke-hoach-tong-the.md](ke-hoach-tong-the.md) Phần D (AI), Phần F (P3)
- Package engine: `blocksuite/chess/engine/`
- Service: `packages/frontend/core/src/modules/chess-engine/`
- UI: `packages/frontend/core/src/blocksuite/view-extensions/chess/`
- Electron UCI: `packages/frontend/apps/electron/src/main/chess-engine/`
