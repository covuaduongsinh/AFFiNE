# Nhập vault Obsidian vào AFFiNE

Tài liệu cho lần chuyển kho `E:\Dropbox\OBSIDIAN2026` sang AFFiNE (P3). Đọc hết
trước khi bấm nhập: **chạy nhập lần hai không cập nhật mà nhân đôi mọi ghi chú
và thư mục**, nên phải làm đúng ngay lần đầu.

## Vault này có gì

Đo ngày 2026-08-18, chỉ tính phần AFFiNE sẽ nhận:

| Hạng mục                       | Số lượng                    |
| ------------------------------ | --------------------------- |
| Ghi chú markdown               | 430 tệp (~7 MB)             |
| Tệp đính kèm (ảnh, PDF)        | 11 tệp (~1,75 MB)           |
| Thư mục tạo trong sidebar      | 429                         |
| Ghi chú có `tags:`             | 36                          |
| Bản sao xung đột Dropbox bị bỏ | 167 tệp `*.md.tmp.NNNN.hex` |

Phần còn lại của thư mục vault (`.git` 115 MB, `.smart-env`, `.trash`,
`.obsidian`, `.claudian`, `.vscode`) bị lọc trước khi trình duyệt đọc tới, nên
không cần dọn vault thủ công.

## Trước khi nhập

1. **Sao lưu workspace**: Settings → Workspace → Storage → **Full Backup**, lưu
   tệp `.bs.zip` ra ngoài máy (Dropbox, ổ khác). Đây là cách duy nhất quay lại
   nếu kết quả không như ý.
2. Đóng bớt ứng dụng nặng. Lần nhập thử tốn **~3 phút** cho 430 ghi chú; máy bận
   sẽ lâu hơn.
3. Nếu đang dùng bản dựng tĩnh ở `localhost:8080`, nhớ build lại trước:
   `$env:PUBLIC_PATH="/"; yarn affine build -p web` (chạy từ PowerShell).

## Các bước nhập

1. Mở workspace đích, bấm **Import** ở cuối sidebar.
2. Chọn **Obsidian**.
3. Trong hộp thoại chọn thư mục, trỏ thẳng vào `E:\Dropbox\OBSIDIAN2026` rồi
   xác nhận. Trình duyệt sẽ hỏi quyền tải cả thư mục — đồng ý.
4. Hộp thoại hiện tiến trình dạng `n/430`. Có thể bấm **Cancel** giữa chừng;
   phần đã nhập vẫn nằm lại workspace.
5. Xong thì bấm **Complete**. Nếu có tệp bị bỏ qua (quá 8 MB hoặc là `.zip`),
   danh sách cảnh báo hiện ngay trên màn hình đó.

## Kết quả giữ được

Đã kiểm bằng lần nhập thử toàn vault:

- **Cây thư mục**: `00 - Inbox`, `01 - Notes`, `02 - Categories`, `03 - Subjects`,
  `04 - System` thành folder trong sidebar, đúng cấp.
- **Tiêu đề trang** đúng tên ghi chú (trước đây mọi trang mang tên "Untitled").
- **Bàn cờ**: fence ` ```chessboard ` thành block cờ vua thật —
  _Step 2 Trainer Manual_ có 88 bàn, _The Complete Idiot's Guide_ có 19 bàn.
- **Ảnh đính kèm** hiển thị trong bài (ví dụ _Nhật ký làm giải on5_ có 2 ảnh).
- **Liên kết `[[...]]`**: 475 liên kết trỏ đúng sang ghi chú tương ứng.
- **Tag từ front-matter**: giữ nguyên cả tên lồng, ví dụ `language/English`.
- **Các khoá front-matter khác** (`author`, `subjects`, `categories`, `nxb`…)
  thành một danh sách liên kết ở đầu bài, nên mạng liên kết của vault còn nguyên.

## Những chỗ vẫn mất hoặc đổi

- **119 liên kết không phân giải được**, chủ yếu là:
  - placeholder trong template (`[[Tên Subject]]`, `[[slug]]`, `[[...]]`);
  - ghi chú không tồn tại trong vault (`[[Permanent Notes]]`, `[[Literature Notes]]`);
  - **tên trùng nhau**: `idea` (`02 - Categories/idea.md` và `Idea.md`), `CLAUDE`
    (6 tệp), `Untitled` (2 tệp). AFFiNE không đoán bừa nên để nguyên chữ.
    Muốn cứu thì đổi tên trong Obsidian **trước** khi nhập.
- **Fence `dataview` và `base`** là truy vấn của plugin Obsidian, vào AFFiNE
  thành khối code không chạy. Giữ nguyên có chủ ý — xoá đi là mất chữ.
- **Emoji ở đầu tên tệp** trở thành icon của trang, không nằm trong tiêu đề nữa.
- **Ảnh liên kết từ internet** (không phải tệp trong vault) có thể không tải
  được, do proxy ảnh của bản self-host trả lỗi 400.

## Kiểm tra sau khi nhập

1. Mở vài ghi chú tiêu biểu: một bài dài nhiều bàn cờ (_Step 2 Trainer Manual_),
   một bài có ảnh, một bài có front-matter nhiều liên kết.
2. **Đừng dùng ô tìm kiếm nhanh để kiểm ngay sau khi nhập**: chỉ mục toàn văn
   chạy sau, vài phút đầu tìm sẽ không ra và mục đầu danh sách là "New … page" —
   bấm vào đó sẽ tạo trang trắng mới. Hãy đi theo cây thư mục trong sidebar.
3. Với workspace đã bật đồng bộ, kiểm phía máy chủ xem dữ liệu đã lên chưa:

   ```bash
   docker exec affine_postgres psql -U affine -d affine -t \
     -c "select count(*) from snapshots where workspace_id='<workspace-id>';"
   ```

   Số này phải tăng đúng bằng số ghi chú vừa nhập. Ảnh được tải lên nền và lỗi
   bị nuốt, nên nếu ảnh quan trọng thì đếm thêm bảng `blobs`.

## Nhập bổ sung về sau

Vì nhập lại nhân đôi, chỉ nên nhập **thư mục mới** hoặc **ghi chú mới** thay vì
chọn lại cả vault: mở Import → Obsidian → trỏ vào đúng thư mục con. Cây thư mục
trong sidebar khi đó bắt đầu từ thư mục bạn chọn.
