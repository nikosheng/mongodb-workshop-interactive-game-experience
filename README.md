# MongoDB Query Quest

一個可本機執行的 Web App，讓熟悉 SQL 的開發者透過遊戲化拼圖練習，學習如何把 SQL CRUD 查詢轉換成 MongoDB Query API（mongosh / MQL）。

> **注意：** 本應用是教學用 sandbox，不是可直接連線並執行任意 MongoDB query 的 production query console。所有驗證均在受控的 in-memory evaluator 中進行，僅支援題庫所需的有限 operator 集合。

---

## 功能特色

- **8 關遊戲化拼圖**：從 SELECT/WHERE → find、比較運算子、$in、ORDER BY LIMIT → sort/limit、INSERT、UPDATE $inc、DELETE、AGGREGATE pipeline
- **Drag-and-drop + Click-to-place**：支援滑鼠、觸控與鍵盤
- **即時 MQL 預覽**：拖拉同時產生格式化的 MongoDB 語法
- **三層驗證**：Slot 類型 → 結構 → 語意（in-memory evaluator）
- **多人模式**：WebSocket 房間、Lobby、即時排行
- **Leaderboard**：MongoDB Atlas 持久化，server 端計分
- **LLM 題庫生成器**：可複製 Prompt 給 AI 生成自訂題目並載入
- **響應式設計**：桌面、平板、手機均可使用

---

## 專案結構

```
mongodb-crud-playground/
├── shared/                    # 共用型別、evaluator、validator（Vitest 測試）
│   └── src/
│       ├── types.ts
│       ├── evaluator.ts       # In-memory MQL evaluator（無 eval/Function）
│       ├── validator.ts       # 三層驗證 + 計分函式
│       └── __tests__/
├── client/                    # Vite + React 18 + TypeScript 前端
│   └── src/
│       ├── components/
│       │   ├── Login/
│       │   ├── ModeSelect/
│       │   ├── Game/          # 核心拼圖遊戲（dnd-kit）
│       │   ├── Lobby/         # 多人大廳（Socket.IO）
│       │   ├── Leaderboard/
│       │   └── LlmPrompt/
│       ├── data/challenges.ts # 8 關題庫
│       └── lib/answerBuilder.ts
└── server/                    # Express + Socket.IO + MongoDB Atlas
    └── src/
        ├── routes/            # auth、sessions、leaderboard、rooms
        ├── socket/            # Socket.IO room handlers
        ├── db/                # Atlas 連線 + index 初始化
        └── middleware/
```

---

## Makefile

專案生命週期指令可透過根目錄的 `Makefile` 執行：

```bash
make help       # 顯示所有可用指令
make install    # 安裝依賴
make dev        # 啟動 client 與 server 開發伺服器
make build      # 建置 shared、server 與 client
make test       # 執行測試
make lint       # 執行 lint
make typecheck  # 執行型別檢查
make start      # 建置後啟動 production server
make clean      # 移除建置輸出
```

## 快速開始

### 1. 安裝依賴

```bash
make install
```

### 2. 設定 MongoDB Atlas

1. 前往 [MongoDB Atlas](https://cloud.mongodb.com/) 建立免費 M0 Cluster
2. 在 **Database Access** 新增一個 database user（記住帳密）
3. 在 **Network Access** 加入你的 IP（或 `0.0.0.0/0` 供開發使用）
4. 點選 **Connect → Drivers**，複製 connection string

### 3. 設定環境變數

```bash
cp server/.env.example server/.env
```

編輯 `server/.env`，填入真實值：

```env
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/query-quest?retryWrites=true&w=majority
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
SESSION_SECRET=my-very-long-random-secret-at-least-32-chars
NODE_ENV=development
```

> **安全提醒：** 永遠不要將 `.env` 或真實 URI 提交到 git。`.gitignore` 已設定排除 `.env`。

### 4. 啟動開發伺服器

```bash
make dev
```

這會同時啟動：
- **client**：http://localhost:5173
- **server**：http://localhost:3001

### 5. 初始化 MongoDB Indexes

Server 啟動時會自動執行 `createIndexes()`，無需手動操作。首次連接後可在 Atlas UI 的 **Indexes** 頁面確認。

---

## 測試

```bash
make test
```

測試位於 `shared/src/__tests__/`，使用 Vitest 執行 26 個單元測試，涵蓋：
- `$gte` vs `$gt` 邊界值
- `$inc` vs `$set` 語意差異
- Aggregation `$group` + `$sort`
- 錯誤 slot type 驗證
- 空 filter `deleteMany` 安全限制
- 計分公式邊界值

---

## Production Build

```bash
make build
```

- `shared/dist/` — 型別定義與 JavaScript
- `client/dist/` — Vite 打包的靜態資源
- `server/dist/` — TypeScript 編譯後的 Node.js

---

## Lint & Typecheck

```bash
make lint       # oxlint（client 前端）
make typecheck  # tsc --noEmit（shared + client + server）
```

---

## 如何新增題目

### 方法一：編輯題庫檔案

1. 複製 `client/src/data/challenges.ts` 中現有題目結構
2. 同時更新 `server/src/lib/challengeData.ts`（server 端驗證用）
3. 確保 `id` 唯一，`expected` 與 `puzzles` 對應正確

### 方法二：LLM 生成

1. 開啟遊戲，在右欄找到「LLM 題庫生成 Prompt」
2. 複製 Prompt 到 ChatGPT / Claude
3. 將回傳的 JSON 貼入「載入自訂題庫」欄位
4. 點擊「載入」—— 系統會做 schema validation 後合併到現有題庫

**Challenge 型別**的完整欄位說明請參考 `shared/src/types.ts`。

---

## 安全設計

| 機制 | 說明 |
|------|------|
| No eval / Function() | Evaluator 完全基於 switch/if 邏輯，不執行任意 JS |
| Allowlist operators | 僅支援 `$gt/$gte/$lt/$lte/$in/$and/$or/$set/$inc/$push/$match/$group/$sort` |
| Server-side scoring | Client 傳來的分數不被信任；server 重新計算 |
| Session auth | httpOnly cookie + express-session，playerId 從 session 讀取 |
| Rate limiting | 每 15 分鐘 200 請求；登入 1 分鐘 10 請求 |
| deleteMany guard | 空 filter 的 deleteMany 在 evaluator 與 API 雙層拒絕 |
| CORS allowlist | CLIENT_ORIGIN 環境變數控制 |
