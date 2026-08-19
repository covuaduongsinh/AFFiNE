# Demo khối cờ vua trong AFFiNE

File này minh họa mọi dạng khối cờ mà AFFiNE nhận khi import markdown. Mở AFFiNE → **Import** → **Markdown files** → chọn file này.

## 1. Thế cờ dạng Obsidian (```chessboard + fen:)

Em. Lasker – Meyer, Prague 1900. Trắng tìm phương án chiếu hết bắt buộc:

```chessboard
fen: 5rk1/6p1/p5p1/1pr2P1p/4R1PP/1P6/P1P5/3R2K1 w - - 0 1
```

## 2. Thế cờ nhìn từ phía Đen (orientation)

```chessboard
fen: 1r1q1rk1/pp4pp/4p3/3pP3/1r3n2/R4N2/2B1QPPP/5RK1 b - - 0 1
orientation: black
```

## 3. Thế cờ minh họa KHÔNG có vua (cấu trúc Tốt)

```chessboard
fen: 8/pp3ppp/2p1p3/8/8/2P1P3/PP3PPP/8 w - - 0 1
```

## 4. FEN trần (```fen)

```fen
4k3/8/8/8/8/8/8/4K3 w - - 0 1
```

## 5. Ván đấu đầy đủ (```pgn) — Ván cờ Evergreen

```pgn
[Event "Ván cờ Evergreen"]
[Site "Berlin GER"]
[Date "1852.??.??"]
[White "Adolf Anderssen"]
[Black "Jean Dufresne"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3
8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6
14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1
Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0
```

## 6. Ván có chú thích và biến

```pgn
[Event "Scholar's mate"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? {Giữ f7 mới là cốt yếu.} (3... g6 4. Qf3
Nf6) 4. Qxf7# 1-0
```

Ghi chú: các khối trên chỉ biến thành bàn cờ khi **import file** hoặc **dán văn bản markdown thô vào đoạn văn thường** — dán vào bên trong một khối code có sẵn thì AFFiNE giữ nguyên là chữ.
