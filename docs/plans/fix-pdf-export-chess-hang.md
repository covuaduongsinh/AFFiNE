# Kế hoạch xử lý: Sửa lỗi Export to PDF bị treo khi tài liệu chứa Chess Block

## Vấn đề

Khi người dùng bấm **Export to PDF** trên tài liệu có chứa chess block (`affine:chess-board` hoặc `affine:chess-game`), quá trình xuất PDF bị treo vô tận — không tải file về, không hiển thị thông báo lỗi. Tài liệu chỉ có văn bản thông thường thì xuất PDF thành công.

---

## Nguyên nhân gốc rễ

```mermaid
sequenceDiagram
  participant User as Người dùng
  participant ExportHandler as use-export-page
  participant PdfTransformer as PdfTransformer
  participant PdfAdapter as PdfAdapter
  participant PdfMake as pdfmake

  User->>ExportHandler: Bấm "Export to PDF"
  ExportHandler->>PdfTransformer: exportDoc(page)
  PdfTransformer->>PdfAdapter: fromDocSnapshot(snapshot)
  PdfAdapter->>PdfAdapter: _blockToContent() → chess adapter matcher
  Note over PdfAdapter: fenToSvg() sinh SVG có<br/>&lt;text font-family="Helvetica"&gt;
  PdfAdapter->>PdfMake: createPdf(docDefinition).getBlob(callback)
  Note over PdfMake: SVG parser gặp font "Helvetica"<br/>chưa đăng ký trong pdfMake.fonts → crash/hang ngầm
  Note over PdfMake: getBlob callback KHÔNG bao giờ được gọi
  Note over ExportHandler: Promise treo vô tận ⏳
```

1. [`fenToSvg()`](file:///D:/code/AFFiNE/blocksuite/chess/core/src/board-svg.ts#L97-L187) sinh các phần tử toạ độ dạng:
   ```xml
   <text x="0.94" y="7.94" font-family="Helvetica" font-size="0.28" ...>a</text>
   ```
2. [`pdfMake.fonts`](file:///D:/code/AFFiNE/blocksuite/affine/shared/src/adapters/pdf/pdf.ts#L57-L70) chỉ đăng ký font `Inter` và `SarasaGothicCL`.
3. Bộ phân tích cú pháp SVG nội bộ của `pdfmake` yêu cầu mọi `font-family` trong thẻ `<text>` phải được khai báo trong `pdfMake.fonts`. Khi gặp font lạ, `pdfmake` bị lỗi nội bộ nhưng callback của `getBlob()` không được kích hoạt, dẫn đến Promise treo vĩnh viễn.
4. [`_createPdfBlob`](file:///D:/code/AFFiNE/blocksuite/affine/shared/src/adapters/pdf/pdf.ts#L1011-L1022) chưa có timeout phòng vệ.

---

## User Review Required

> [!IMPORTANT]
> **Nhãn toạ độ (a–h, 1–8) trên bàn cờ khi xuất PDF sẽ được ẩn.**
> Bàn cờ trong PDF sẽ chỉ hiển thị ô cờ, quân cờ, mũi tên và vùng tô sáng (highlights) dưới dạng vector SVG thuần túy (`<rect>`, `<path>`, `<polygon>`, `<line>`).
> Điều này đảm bảo tương thích 100% với `pdfmake` mà không cần bundle thêm font Helvetica vào bộ nhớ (~30KB-50KB font data).

---

## Các thay đổi đề xuất

### 1. `@blocksuite/chess-core`

#### [MODIFY] [board-svg.ts](file:///D:/code/AFFiNE/blocksuite/chess/core/src/board-svg.ts)

- Thêm thuộc tính `textInSvg?: boolean` vào `BoardSvgOptions` (mặc định `true`).
- Khi `textInSvg === false`, bỏ qua việc sinh mảng thẻ `labels` (`<text>`).

#### [MODIFY] [board-svg.unit.spec.ts](file:///D:/code/AFFiNE/blocksuite/chess/core/src/__tests__/board-svg.unit.spec.ts)

- Bổ sung unit test xác nhận khi `textInSvg: false` thì chuỗi SVG trả về không chứa thẻ `<text`.

---

### 2. `@blocksuite/chess-block-board`

#### [MODIFY] [pdf.ts](file:///D:/code/AFFiNE/blocksuite/chess/block-board/src/adapters/pdf.ts)

- Khi gọi `fenToSvg()`, truyền `textInSvg: false`.

#### [MODIFY] [pdf-adapter.unit.spec.ts](file:///D:/code/AFFiNE/blocksuite/chess/block-board/src/__tests__/pdf-adapter.unit.spec.ts)

- Bổ sung test kiểm tra SVG sinh ra không chứa thẻ `<text>`.

---

### 3. `@blocksuite/chess-block-game`

#### [MODIFY] [pdf.ts](file:///D:/code/AFFiNE/blocksuite/chess/block-game/src/adapters/pdf.ts)

- Khi gọi `fenToSvg()`, truyền `textInSvg: false`.

#### [MODIFY] [pdf-adapter.unit.spec.ts](file:///D:/code/AFFiNE/blocksuite/chess/block-game/src/__tests__/pdf-adapter.unit.spec.ts)

- Bổ sung test kiểm tra SVG sinh ra không chứa thẻ `<text>`.

---

### 4. `@blocksuite/affine-shared`

#### [MODIFY] [pdf.ts](file:///D:/code/AFFiNE/blocksuite/affine/shared/src/adapters/pdf/pdf.ts#L1011-L1022)

- Thêm `setTimeout` 30 giây trong `_createPdfBlob` để `reject` kèm thông báo lỗi rõ ràng nếu `pdfmake` bị treo, tránh ứng dụng đứng yên không phản hồi.

---

## Kế hoạch kiểm tra (Verification Plan)

### Automated Tests

Chạy toàn bộ các test suite liên quan:

```bash
yarn workspace @blocksuite/chess-core exec vitest run src/__tests__/board-svg.unit.spec.ts
yarn workspace @blocksuite/chess-block-board exec vitest run src/__tests__/pdf-adapter.unit.spec.ts
yarn workspace @blocksuite/chess-block-game exec vitest run src/__tests__/pdf-adapter.unit.spec.ts
```

### Manual Verification

1. Khởi động ứng dụng web: `yarn affine dev -p @affine/web`
2. Tạo 1 trang tài liệu mới, chèn block cờ vua (gõ `/board` hoặc `/game`).
3. Chọn menu 3 chấm (···) -> **Export** -> **Export to PDF**.
4. Kiểm tra:
   - File PDF được tải về thành công (không bị treo).
   - Mở file PDF xem bàn cờ được hiển thị sắc nét (vector SVG).
   - Kiểm tra xuất PDF với doc văn bản thông thường vẫn hoạt động bình thường.
