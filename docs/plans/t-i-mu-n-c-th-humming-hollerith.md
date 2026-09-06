# Kế hoạch: Đưa các tính năng đọc/ghi của bản Electron desktop lên bản web/self-hosted AFFiNE

## Bối cảnh

Yêu cầu ban đầu: muốn mở nhiều tab doc để đọc mà không phải quay lại giao diện quản lý
doc, giống Obsidian. Sau khi khảo sát, phát hiện self-hosted stack của bạn (`.docker/selfhost`)
chạy bản **web** (`packages/frontend/apps/web`, package `@affine/web`), không phải bản
Electron desktop — và rất nhiều tính năng "tưởng chỉ Electron mới có" thực ra đã tồn tại
sẵn trong code dùng chung, chỉ đơn giản là bị khoá lại bằng cờ `BUILD_CONFIG.isElectron`
ở một vài điểm UI cụ thể, hoặc đã hoạt động đầy đủ trên web nhưng chưa được kiểm chứng.

Sau khi rà toàn bộ các điểm gate `BUILD_CONFIG.isElectron` trong `packages/frontend/core`,
đã loại bỏ các tính năng gắn chặt OS không thể/không nên đưa lên web (system tray, menu
bar gốc, auto-updater, giao thức `affine://`, SQLite local storage, OS keychain, đa cửa sổ,
native find Ctrl+F...) — những thứ này giữ nguyên là Electron-only, không nằm trong phạm vi.

Bạn đã chọn 4 tính năng đưa vào kế hoạch lần này:

1. Tab/split-view đọc nhiều doc cùng lúc (yêu cầu gốc)
2. Tìm-trong-doc nâng cao (thay Ctrl+F trình duyệt)
3. Import Notion/Obsidian/Markdown zip trên web
4. Export/backup toàn bộ workspace trên web

**Phát hiện quan trọng làm thay đổi phạm vi:** sau khi một Plan agent đọc trực tiếp mã
nguồn và tôi tự xác minh lại hai điểm mấu chốt, hoá ra **tính năng 3 và 4 đã được cài đặt
đầy đủ cho web từ trước** — không cần xây mới, chỉ cần kiểm chứng hoạt động thực tế. Tính
năng 1 chỉ cần gỡ vài cờ khoá + thêm một thanh tab nhỏ. Chỉ có tính năng 2 là thực sự phải
xây từ đầu.

## Tính năng 1 — Tab/split-view đọc nhiều doc (Effort: M)

**Hiện trạng đã xác minh:** `WorkbenchRoot` (`packages/frontend/core/src/modules/workbench/view/workbench-root.tsx`)
render `<SplitView>` không hề có điều kiện `isElectron` — toàn bộ state (`Workbench.views$`,
`createView`/`open`/`close`/`closeOthers`/`moveView`/`resize` trong
`packages/frontend/core/src/modules/workbench/entities/workbench.ts`) đã platform-agnostic.
Cái bị khoá chỉ là **lối vào UI**:

- `packages/frontend/core/src/components/explorer/docs-view/more-menu.tsx:194` — mục
  menu "Open in Split View" bị ẩn trên web (đã tự xác minh dòng này).
- `packages/frontend/core/src/components/page-list/operation-cell.tsx:196-200` — tương tự.
- `packages/frontend/core/src/modules/workbench/view/split-view/split-view.tsx:95`
  (`canMonitor`) và `panel.tsx:161,200` (`canDrop`/`canDrag`) — kéo-thả doc vào chia đôi
  màn hình bị khoá `isElectron`.
- "Open in new tab" (`workbench.openDoc(id, {at: 'new-tab'})`) đã hoạt động đúng trên web
  qua `window.open()` (`workbench-new-tab-handler.ts`) — giữ nguyên, không đụng vào.

**Cách làm:**

1. Gỡ các cờ `isElectron` ở 4 điểm trên để "Open in Split View" + kéo-thả-để-chia-đôi
   hoạt động trên web. Lưu ý: `split-view.tsx` có một comment về workaround lit-element
   remount — cần smoke-test mở 2+ doc trên web trước khi gỡ, không xoá cờ một cách mù quáng.
2. Thêm một thanh tab nhỏ gọn (không phải port `AppTabsHeader`/OS-tab của Electron — quá
   tốn công, đã loại khỏi phạm vi) hiển thị `workbench.views$` đang mở, render trong
   `BrowserLayout` (`packages/frontend/core/src/desktop/components/app-container/index.tsx`).
   Dùng đúng convention `Entity`/`Service`/`LiveData` sẵn có (`useLiveData(workbench.views$)`,
   `useLiveData(workbench.activeView$)`, `view.title$`/`icon$`). Click để chuyển tab
   (`workbench.active(view)`), nút đóng khi có ≥2 view (`workbench.close(view)`). Chỉ tham
   khảo phần UI/icon của `app-tabs-header.tsx`, không dùng `app-tabs-header-service.ts`
   (Electron IPC).

**File chính:**

- Sửa: `more-menu.tsx`, `operation-cell.tsx`, `split-view/split-view.tsx`, `split-view/panel.tsx`
- Sửa: `desktop/components/app-container/index.tsx` (`BrowserLayout`)
- Mới: `modules/workbench/view/view-tabs/view-tabs.tsx` (+ styles)

## Tính năng 2 — Tìm-trong-doc nâng cao (Effort: L–XL)

**Hiện trạng:** hoàn toàn Electron-only, dựa vào `webContents.findInPage` native của
Chromium (`apps/electron/src/main/find-in-page/`). UI shell (`find-in-page-popup.tsx`)
là React thuần, tái dùng được gần như nguyên vẹn — chỉ backend tìm kiếm cần viết lại.

**Cách làm:**

1. Đổi `FindInPage` entity (`modules/find-in-page/entities/find-in-page.ts`) sang mô hình
   DI-swappable giống `WorkbenchNewTabHandler` (`createIdentifier<FindInPageBackend>()`),
   thay vì branch cứng theo `isElectron` bên trong entity.
2. Viết backend web: duyệt cây block của doc blocksuite đang mở (không dùng DOM Ctrl+F thô,
   không dùng chỉ mục toàn-workspace của `docs-search` vì nó giới hạn 2 kết quả/doc và có
   độ trễ index — chỉ tham khảo để biết search block-content đã có tiền lệ trong codebase).
3. Highlight bằng CSS Custom Highlight API (`CSS.highlights`) để không phá DOM/virtual-DOM
   của blocksuite; cần fallback vì Firefox/Safari cũ chưa hỗ trợ đầy đủ.
4. Gỡ cờ `isElectron` ở `use-register-find-in-page-commands.ts` và nơi render
   `<FindInPagePopup />` (`desktop/pages/root/index.tsx:33`).
5. Giới hạn phạm vi: chỉ page mode (không xử lý edgeless/canvas) — native find của Electron
   nhiều khả năng cũng có hạn chế tương tự nên đây là ngang bằng, không phải thụt lùi.

**File chính:**

- Sửa: `modules/find-in-page/entities/find-in-page.ts`, `use-register-find-in-page-commands.ts`,
  `desktop/pages/root/index.tsx`
- Mới: `modules/find-in-page/services/find-in-page-backend.ts` (+ impl Electron/Browser),
  tiện ích tìm kiếm/highlight phía browser

## Tính năng 3 — Import Notion/Obsidian/Markdown zip (Effort: S — chỉ kiểm chứng)

**Đã có sẵn**, xác nhận qua đọc trực tiếp `modules/import/services/service.ts`: mọi định
dạng (Markdown zip, Notion zip cả 2 biến thể md/html, Obsidian vault, Bear backup, Markdown/
HTML/Docx/snapshot đơn lẻ) đều đã có nhánh web pure-JS dùng transformer của blocksuite +
`Zip`/`Unzip` tự viết (không cần thêm `jszip`). Có sẵn giới hạn an toàn bộ nhớ trình duyệt
(`desktop/dialogs/import/web-limits.ts`: 32MB zip thường / 128MB vault Obsidian). Chỉ
OneNote bị chặn trên web — đúng vì OneNote import dựa vào COM Windows-only, giữ nguyên.

**Việc cần làm:** kiểm thử thủ công từng luồng import trên trình duyệt thật (không phải
build code mới), xác nhận thông báo "chỉ có trên desktop" của OneNote hiển thị rõ ràng.
Chỉ cân nhắc nâng giới hạn dung lượng sau khi đã test thực tế, không chỉnh số mù quáng.

## Tính năng 4 — Export/backup workspace trên web (Effort: S — chỉ kiểm chứng + polish nhỏ)

**Đã có sẵn**, tự xác minh tại `desktop/dialogs/setting/workspace-setting/storage/index.tsx`
dòng 39-47 và 57-66: `WebExportPanel` được dùng thay `DesktopExportPanel` khi không phải
Electron, xuất toàn bộ workspace thành file `.bs.zip` qua `useExportWorkspaceSnapshot` +
`ZipTransformer.exportDocs`, tải về bằng blob-link (`<a download>`) — cách này thực ra
tương thích trình duyệt tốt hơn cả File System Access API (chạy được trên Safari/Firefox),
nên **không cần thêm File System Access API**, giữ nguyên cách hiện tại.

Phần "Backup" tự động định kỳ trong Settings (danh sách bản backup SQLite `.affine` trên
đĩa) đúng là Electron-only và nên giữ nguyên vì không có khái niệm tương đương trên
IndexedDB của web.

**Việc cần làm:** kiểm thử thực tế luồng export cho cả workspace local và cloud (bước
`fullDownload()`/`waitForSynced()` với workspace cloud lớn có thể chậm), cân nhắc thêm
progress indicator (hiện chỉ có spinner boolean) theo mẫu `context.onProgress` đã dùng ở
import, để không có cảm giác "đứng hình" khi export workspace lớn.

## Thứ tự triển khai đề xuất

1. **Kiểm chứng tính năng 3 & 4 trước** (effort S) — có thể đã đóng xong 2/4 gap gần như
   không cần sửa code, nên làm trước để tránh làm lại việc đã có.
2. **Tính năng 1** (effort M) — chủ yếu gỡ cờ khoá + 1 component tab nhỏ mới, độc lập,
   rủi ro thấp, giá trị hiển thị cao (đúng yêu cầu gốc).
3. **Tính năng 2** (effort L–XL) — việc xây mới thực sự duy nhất, không phụ thuộc 3 tính
   năng kia, để cuối vì độ bất định/khối lượng lớn nhất.

Không có hạ tầng dùng chung cần xây trước cho nhiều tính năng — thư viện zip đã dùng chung
sẵn cho cả import/export.

## Kiểm thử sau khi triển khai

- Tính năng 1: mở ≥2 doc trên web bằng "Open in Split View" và kéo-thả doc vào panel chia
  đôi; đóng/di chuyển/chuyển tab qua thanh tab mới; refresh trang kiểm tra state có mất
  không (đối chiếu `desktop-state-synchronizer`/`workbench-view-state` xem có persist qua
  reload hay không).
- Tính năng 2: tìm từ khoá xuất hiện nhiều lần trong 1 doc dài, kiểm tra điều hướng
  next/prev, kiểm tra doc có block ẩn/collapse, kiểm tra trên trình duyệt không hỗ trợ CSS
  Custom Highlight API (Firefox cũ) để xác nhận fallback.
- Tính năng 3: import thử 1 file zip Markdown, 1 export zip từ Notion (cả 2 biến thể),
  1 vault Obsidian nhỏ, 1 backup Bear — trên trình duyệt thật, không phải Electron.
  Thử 1 file OneNote để xác nhận thông báo "chỉ có trên desktop" hiện đúng.
- Tính năng 4: export 1 workspace local nhỏ và 1 workspace cloud, mở lại file `.bs.zip`
  tải về để xác nhận nội dung đầy đủ.
