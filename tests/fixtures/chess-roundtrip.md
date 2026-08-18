# Vòng tròn markdown

Mỗi khối dưới đây là một hình dạng fence có thật trong vault Obsidian. Xuất tài
liệu này ra markdown phải trả lại đúng từng byte — trừ dạng FEN trần, vốn được
chuẩn hoá về dạng có tiền tố `fen:`.

## Thế thường

```chessboard
fen: 5rk1/6p1/p5p1/1pr2P1p/4R1PP/1P6/P1P5/3R2K1 w - - 0 1
```

## Thế thiếu vua, kèm strict

```chessboard
fen: 8/8/8/4NN2/8/8/6n1/4bb1r w - - 0 1
strict: false
```

## Nhìn từ phía Đen

```chessboard
fen: 1r1q1rk1/pp4pp/4p3/3pP3/1r3n2/R4N2/2B1QPPP/5RK1 b - - 0 1
orientation: black
```

## Có chú thích

```chessboard
fen: r2qrbk1/1bp2pp1/p2p1n1p/1p6/Pn1PP3/5N1P/1P1N1PP1/RBBQR1K1 b - - 2 17
annotations: Ae1-e8/g Hf5 Cd4
```

## Khoá lạ không ai biết

```chessboard
fen: rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1
pieceStyle: cburnett
```

## FEN trần, không có tiền tố

```chessboard
r1bqk2r/ppp2ppp/2np1n2/b7/2BpP3/B1P2N2/P4PPP/RN1Q1RK1 b - - 0 1
```
