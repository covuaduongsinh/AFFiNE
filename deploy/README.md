# Dựng `@chess/sync` trên VPS Ubuntu

Từng bước, cho một VPS Ubuntu/Debian có tên miền. Sao lưu và khôi phục ở
[../docs/an-toan-du-lieu.md](../docs/an-toan-du-lieu.md).

`@chess/sync` **không import một package workspace nào** — 13 dependency npm, khoảng 4.400 dòng.
Không phải bê cả monorepo lên VPS, và không cần Yarn.

## 1. Chép mã nguồn lên

```bash
# trên máy dev
rsync -a --exclude node_modules --exclude dist \
  packages/chess/sync/ user@vps:/opt/chess-sync/

# trên VPS
cd /opt/chess-sync
npm install --omit=dev
```

`npm` chứ không phải `yarn`, vì package này đứng một mình được.

**Phải cài trên chính VPS, không rsync `node_modules` từ máy khác sang.** `@node-rs/argon2` là
binary dựng sẵn theo nền tảng; nó chọn đúng bản `linux-x64-gnu` lúc cài. PGlite thì là WASM thuần,
chạy đâu cũng được.

`tsx` nằm trong `dependencies` của package, nên `npm install` là có. Trước đây nó chạy được chỉ
nhờ yarn hoist từ `tools/cli` — trên VPS thì cách đó không còn.

## 2. Khôi phục dữ liệu

```bash
useradd -r -s /usr/sbin/nologin chess
mkdir -p /var/lib/chess-sync
tar -xzf chess-sync-data.tar.gz -C /tmp
mv /tmp/chess-sync-data/* /var/lib/chess-sync/
chown -R chess:chess /var/lib/chess-sync
chmod 700 /var/lib/chess-sync
```

## 3. Dịch vụ nền

```bash
cp deploy/chess-sync.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now chess-sync
journalctl -u chess-sync -n 5     # phải thấy "listening on http://127.0.0.1:3010"
```

Thử dừng một lần và đọc log:

```bash
systemctl stop chess-sync && journalctl -u chess-sync -n 10
```

Phải thấy `SIGTERM, closing…` và **không** thấy `close timed out after 10s`. Nếu thấy dòng timeout
thì PGlite chưa kịp ghi xong — đừng sao lưu cho tới khi hiểu vì sao.

## 4. Bản web

```bash
mkdir -p /srv/affine-web
tar -xzf web-dist.tar.gz -C /tmp && cp -a /tmp/dist/. /srv/affine-web/
rm /srv/affine-web/index.html
```

**Xoá `index.html` không phải cho gọn.** Đó là trang vào của bản AFFiNE Cloud; `selfhost.html` mới
là trang mang thẻ `env:isSelfHosted`. Nếu có lúc nào máy chủ tĩnh phục vụ `index.html` cho `/`,
ứng dụng sẽ âm thầm đi tìm cloud AFFiNE. Xoá hẳn thì chuyện đó không xảy ra được.

Muốn build lại thay vì dùng gói có sẵn: `PUBLIC_PATH=/ yarn affine build -p web` rồi xoá các file
`.map`. Nhưng build cần cả monorepo và vài GB — trên VPS nhỏ thì chép gói sang nhanh hơn nhiều.

## 5. Caddy

```bash
apt install -y caddy
caddy hash-password              # dán kết quả vào Caddyfile
cp deploy/Caddyfile /etc/caddy/Caddyfile
# sửa sync.example.vn thành tên miền của anh, dán hash mật khẩu vào
systemctl reload caddy
```

Caddy tự xin chứng chỉ Let's Encrypt, tự xử lý nâng cấp WebSocket, và ghi đè
`X-Forwarded-Proto` bằng scheme thật.

**Mật khẩu Caddy đang gánh phần bảo mật mà ứng dụng chưa có.** Hai lỗ chưa vá: đăng nhập chính là
đăng ký (ai cũng tạo được tài khoản), và `setBlob` lấy tên file client gửi làm đường dẫn nên ghi
ra ngoài thư mục blob được. Chừng nào lớp mật khẩu này còn đứng trước thì chưa ai ngoài kia với
tới. **Đừng gỡ nó trước khi vá xong hai lỗ đó** — xem
[../docs/chay-stack-tu-chu.md](../docs/chay-stack-tu-chu.md).

## 6. Kiểm chứng

```bash
curl -s https://tenmien.vn/health -u chess:matkhau        # {"ok":true,"version":"0.27.0"}
curl -s https://tenmien.vn/ -u chess:matkhau | grep -c env:isSelfHosted   # phải là 1
```

Rồi mở trên trình duyệt, đăng nhập bằng tài khoản cũ, mở đúng workspace cũ. Sau đó thử
`systemctl restart chess-sync`, tải lại trang — dữ liệu phải còn và không phải đăng nhập lại.

**Kiểm sớm việc đồng bộ hai máy.** Basic auth và WebSocket không phải lúc nào cũng hợp nhau: trình
duyệt có thể không gắn thông tin xác thực vào lần nâng cấp WS. Nếu vậy socket.io tự lùi về
`polling`, mà XHR polling thì có mang basic auth, nên đồng bộ vẫn chạy. Nhưng phải kiểm bằng mắt:
mở cùng một tài liệu trên hai máy, gõ ở một bên, bên kia phải thấy mà không tải lại. Nếu không
thấy, đổi sang Tailscale thay basic auth, hoặc vá bảo mật ở tầng ứng dụng rồi bỏ basic auth.

## 7. Máy desktop

Đặt biến môi trường trên Windows:

```
CHESS_SYNC_URL=https://tenmien.vn
```

Không có nó, app desktop tự bật server nhúng riêng với cơ sở dữ liệu riêng, và một nửa ghi chép
của anh nằm ở chỗ không ai mở tới.

## 8. Sao lưu tự động

```bash
cp deploy/backup-chess-sync.sh /usr/local/bin/chess-backup.sh
chmod +x /usr/local/bin/chess-backup.sh
cp deploy/chess-backup.service deploy/chess-backup.timer /etc/systemd/system/
rclone config          # tạo remote "gdrive", rồi remote "gcrypt" kiểu crypt bọc lên nó
systemctl enable --now chess-backup.timer
systemctl start chess-backup.service    # chạy thử ngay một lần
```

Dùng `crypt` để Google hoặc Dropbox chỉ giữ bản mã hoá — gói này chứa `jwt-secret` và toàn bộ hash
mật khẩu.

Mỗi tháng khôi phục thử một lần, theo đúng quy trình trong `an-toan-du-lieu.md`. Một bản sao lưu
chưa từng khôi phục chỉ là một giả thuyết.

## 9. Bản mobile

Điện thoại nhận một bản dựng **khác**, không phải bản desktop thu nhỏ. AFFiNE quyết định điều đó
lúc biên dịch (`BUILD_CONFIG.isMobileEdition` là hằng số), nên không có cách nào để một bản tự
thích nghi — phải phục vụ hai gói và chọn theo User-Agent, việc mà Caddy làm ở đây.

```bash
# trên máy dev
PUBLIC_PATH=/ yarn affine @affine/mobile build
find packages/frontend/apps/mobile/dist -name '*.map' -delete
tar -C packages/frontend/apps/mobile -czf mobile-dist.tar.gz dist

# trên VPS
mkdir -p /etc/dokploy/affine/web-mobile
tar -xzf mobile-dist.tar.gz -C /tmp
cp -a /tmp/dist/. /etc/dokploy/affine/web-mobile/
rm -f /etc/dokploy/affine/web-mobile/index.html
chmod -R a+rX /etc/dokploy/affine/web-mobile
```

Xoá `index.html` ở **cả hai** thư mục, vì cùng một lý do: đó là trang vào của bản AFFiNE Cloud.

**Thứ tự quan trọng:** đẩy gói lên trước, sửa Caddyfile sau, rồi mới triển khai lại. Làm ngược thì
điện thoại nhận 404 cho tới khi tải xong. Và phải triển khai lại chứ không phải `restart` — thêm
một bind mount thì container phải được tạo lại.

**Máy tính bảng dùng bản desktop, có chủ đích.** Safari trên iPadOS 13 trở lên khai báo User-Agent
y hệt macOS nên không phân biệt được ở phía máy chủ; mà kể cả phân biệt được cũng không nên đổi:
màn 10 inch đủ chỗ cho bố cục desktop, và bản mobile **không có** thanh bên, thanh công cụ hover,
lẫn menu gạch chéo.

**Trên bản mobile không có menu gạch chéo** — BlockSuite không đăng ký nó cho phạm vi mobile. Các
khối cờ vì thế được chèn từ nút **+** của thanh công cụ bàn phím, nhóm "Cờ vua".

**Bảng trắng (edgeless) mặc định chỉ đọc trên điện thoại.** Bật ở Settings → Experimental features
→ mobile edgeless editing nếu cần vẽ trên bảng.

## 10. Mang bản sao lưu ra khỏi VPS

Job hằng đêm đã chép nguội dữ liệu vào `/var/backups/chess-sync` trên chính VPS. Nhưng một bản
sao nằm cùng máy với bản gốc thì **không phải bản sao lưu** — máy hỏng là mất cả hai.

`deploy/pull-backup.ps1` làm nốt bước còn thiếu. Chạy trên máy Windows:

```powershell
.\pull-backup.ps1
```

Nó tìm bản mới nhất trên VPS, tải về `Documents\affine-backup`, **đối chiếu vân tay SHA-256 hai
đầu**, giữ 12 bản gần nhất và xoá bản cũ hơn. Nếu bản mới nhất trên VPS đã quá 2 ngày tuổi, nó
cảnh báo — đó là dấu hiệu job hằng đêm đã hỏng.

Đối chiếu vân tay không phải cho đẹp: một file tải hỏng giữa chừng trông y hệt file tốt cho tới
ngày cần khôi phục, và đó là ngày tệ nhất để phát hiện.

Muốn khỏi phải nhớ thì đặt lịch cho Windows chạy hằng tuần:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\đường\dẫn\pull-backup.ps1"'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 8pm
Register-ScheduledTask -TaskName 'AFFiNE backup pull' -Action $action -Trigger $trigger
```

**Khôi phục** thì làm ngược lại: đẩy file lên VPS, dừng service, bung vào thư mục dữ liệu — quy
trình đầy đủ ở [../docs/an-toan-du-lieu.md](../docs/an-toan-du-lieu.md).
