/**
 * Client-side fallback Schema Design challenge registry.
 * Must stay in sync with server/src/lib/schemaDesignChallengeData.ts.
 * The server is the authoritative source for validation.
 */
import type { Challenge, Slot } from '@query-quest/shared';

export const SCHEMA_DESIGN_CHALLENGE_VERSION = '1.0';

const SCHEMA_DESIGN_SLOTS: Slot[] = [
  { id: 's_design', label: '最佳設計', accepts: ['schema-option'], required: true, hint: '從三張候選卡中選出最適合這個情境的設計' },
];

export const defaultSchemaDesignChallenges: Challenge[] = [
  // ─── beginner: embedding vs referencing ────────────────────────────────
  {
    id: 'sd1',
    type: 'SCHEMA_PATTERN',
    title: '部落格文章與作者資料，該內嵌還是參照？',
    difficulty: 'beginner',
    collection: 'posts',
    context: '一個個人部落格網站，每篇文章只有一位作者，作者資料（姓名、大頭貼）幾乎不會變動，讀取文章列表時一定要同時顯示作者姓名與大頭貼。',
    schema: {
      _id: 'ObjectId',
      title: 'string',
      body: 'string',
      authorId: 'ObjectId // 參照 authors collection',
    },
    sampleDocuments: [
      { _id: 'p1', title: 'MongoDB 入門', body: '...', authorId: 'a1' },
    ],
    slots: SCHEMA_DESIGN_SLOTS,
    puzzles: [
      {
        id: 'sd1_correct',
        kind: 'schema-option',
        label: 'Embedding（內嵌作者資料）',
        isDistractor: false,
        value: {
          summary: '把作者的姓名與大頭貼直接內嵌進文章文件，一次查詢就能取得所有顯示所需資料。',
          snippet: { posts: { title: 'string', body: 'string', author: { name: 'string', avatarUrl: 'string' } } },
        },
      },
      {
        id: 'sd1_wrong_ref',
        kind: 'schema-option',
        label: 'Referencing（純參照，每篇文章額外查詢作者）',
        isDistractor: true,
        value: {
          summary: '文章只存 authorId，顯示列表時對每篇文章額外查詢一次 authors collection。',
          snippet: { posts: { title: 'string', body: 'string', authorId: 'ObjectId' } },
        },
      },
      {
        id: 'sd1_wrong_many_authors',
        kind: 'schema-option',
        label: 'Polymorphic Pattern（依作者類型切換結構）',
        isDistractor: true,
        value: {
          summary: '假設作者有多種類型（個人/機構）並用不同欄位結構儲存，但此情境沒有這種多型需求。',
          snippet: { posts: { title: 'string', authorType: 'string', authorFields: 'object (varies by type)' } },
        },
      },
    ],
    answerKey: { s_design: 'sd1_correct' },
    patternName: 'Embedding（內嵌作者資料）',
    optionExplanations: [
      { puzzleId: 'sd1_correct', verdict: 'correct', reason: '一對一關係、資料幾乎不變、且幾乎每次讀取都需要作者姓名與大頭貼，內嵌可以用一次查詢完成，是最簡單且效能最好的選擇。' },
      { puzzleId: 'sd1_wrong_ref', verdict: 'incorrect', reason: '每次顯示文章列表都要對每篇文章額外查一次作者，造成 N+1 查詢問題，在讀取頻繁的情境下效能明顯較差。' },
      { puzzleId: 'sd1_wrong_many_authors', verdict: 'incorrect', reason: '這個情境只有一種作者結構，沒有需要依類型切換欄位的多型需求，套用 Polymorphic Pattern 只會增加不必要的複雜度。' },
    ],
    concept: 'Embedding vs Referencing 基礎決策',
    hint: '想想看：這個關聯是一對一還是一對多？資料多久會變動一次？每次讀取是否都需要對方的資料？',
  },

  // ─── intermediate: named pattern recognition ───────────────────────────
  {
    id: 'sd2',
    type: 'SCHEMA_PATTERN',
    title: '訂單列表要顯示買家名稱與頭像，如何設計？',
    difficulty: 'intermediate',
    collection: 'orders',
    context: '電商後台的訂單列表頁，每次載入 50 筆訂單，每筆都要顯示買家姓名與大頭貼縮圖。買家文件本身有 20 個以上欄位（地址、發票資訊、偏好設定等），且訂單建立後買家改名不需要反映在歷史訂單上。',
    schema: {
      _id: 'ObjectId',
      buyerId: 'ObjectId // 參照 users collection（20+ 欄位）',
      items: 'Array<{ sku: string, qty: number }>',
      total: 'number',
    },
    sampleDocuments: [
      { _id: 'o1', buyerId: 'u1', items: [{ sku: 'sku-1', qty: 2 }], total: 1200 },
    ],
    slots: SCHEMA_DESIGN_SLOTS,
    puzzles: [
      {
        id: 'sd2_correct',
        kind: 'schema-option',
        label: 'Extended Reference Pattern',
        isDistractor: false,
        value: {
          summary: '只複製最常用且可接受歷史快照的欄位（買家姓名、頭像）到訂單文件，其餘資料仍用 buyerId 參照。',
          snippet: { orders: { buyerId: 'ObjectId', buyerName: 'string (snapshot)', buyerAvatarUrl: 'string (snapshot)' } },
        },
      },
      {
        id: 'sd2_wrong_full_embed',
        kind: 'schema-option',
        label: '完整內嵌買家文件（Full Embedding）',
        isDistractor: true,
        value: {
          summary: '把買家的 20 多個欄位整份複製進每一筆訂單文件。',
          snippet: { orders: { buyer: { name: 'string', address: 'object', invoice: 'object', preferences: 'object', /* ...17 more fields */ } } },
        },
      },
      {
        id: 'sd2_wrong_pure_ref',
        kind: 'schema-option',
        label: '純參照，前端逐筆查詢（Pure Referencing）',
        isDistractor: true,
        value: {
          summary: '訂單只存 buyerId，列表頁對 50 筆訂單各自查一次 users collection。',
          snippet: { orders: { buyerId: 'ObjectId' } },
        },
      },
    ],
    answerKey: { s_design: 'sd2_correct' },
    patternName: 'Extended Reference Pattern',
    optionExplanations: [
      { puzzleId: 'sd2_correct', verdict: 'correct', reason: '列表頁只需要姓名與頭像兩個欄位，且允許歷史快照（買家改名不用同步），Extended Reference 只複製這兩個欄位，兼顧讀取效能與資料量。' },
      { puzzleId: 'sd2_wrong_full_embed', verdict: 'incorrect', reason: '複製 20 多個欄位造成訂單文件大量膨脹，而其中大部分欄位（地址、發票）列表頁根本不需要顯示，浪費儲存空間與網路頻寬。' },
      { puzzleId: 'sd2_wrong_pure_ref', verdict: 'incorrect', reason: '每次載入 50 筆訂單就要額外查詢 50 次買家資料，造成明顯的 N+1 查詢效能問題。' },
    ],
    concept: 'Extended Reference Pattern',
    hint: '哪些買家欄位是列表頁「高頻讀取」且「可以接受歷史快照」的？只複製那些欄位就好。',
  },

  // ─── advanced: multi-factor tradeoff ───────────────────────────────────
  {
    id: 'sd3',
    type: 'SCHEMA_PATTERN',
    title: '商品有數百個可選規格屬性，該怎麼設計欄位？',
    difficulty: 'advanced',
    collection: 'products',
    context: '跨品類電商平台，不同品類的商品有截然不同且數量龐大的規格屬性（例如手機有「螢幕尺寸」「電池容量」，衣服有「材質」「洗滌方式」），商品頁需要支援依任意屬性做篩選查詢，且屬性組合會隨新品類不斷增加。',
    schema: {
      _id: 'ObjectId',
      name: 'string',
      category: 'string',
    },
    sampleDocuments: [
      { _id: 'p1', name: 'Phone X', category: 'electronics', screenSize: '6.1in', batteryCapacity: '4000mAh' },
    ],
    slots: SCHEMA_DESIGN_SLOTS,
    puzzles: [
      {
        id: 'sd3_correct',
        kind: 'schema-option',
        label: 'Attribute Pattern',
        isDistractor: false,
        value: {
          summary: '把不固定的規格屬性轉成 { k, v } 陣列，並對陣列的 k/v 建立索引，方便任意屬性查詢與擴充。',
          snippet: { products: { name: 'string', category: 'string', specs: [{ k: 'screenSize', v: '6.1in' }, { k: 'batteryCapacity', v: '4000mAh' }] } },
        },
      },
      {
        id: 'sd3_wrong_flat_fields',
        kind: 'schema-option',
        label: '每個屬性都開一個獨立欄位（Flat Fields）',
        isDistractor: true,
        value: {
          summary: '把每個可能的規格屬性都變成商品文件上的一個欄位。',
          snippet: { products: { name: 'string', category: 'string', screenSize: 'string', batteryCapacity: 'string', material: 'string', washMethod: 'string' } },
        },
      },
      {
        id: 'sd3_wrong_collection_per_category',
        kind: 'schema-option',
        label: '每個品類開一個獨立 Collection（Massive Number of Collections）',
        isDistractor: true,
        value: {
          summary: '為每個品類建立獨立的 collection（electronics、clothing 等），各自定義欄位。',
          snippet: { electronics_products: { screenSize: 'string' }, clothing_products: { material: 'string' } },
        },
      },
    ],
    answerKey: { s_design: 'sd3_correct' },
    patternName: 'Attribute Pattern',
    optionExplanations: [
      { puzzleId: 'sd3_correct', verdict: 'correct', reason: '屬性數量龐大且會隨品類持續增加，Attribute Pattern 用 key-value 陣列統一表示，只需要一個複合索引就能支援任意屬性查詢，且新增屬性不需要改 schema 或加新索引。' },
      { puzzleId: 'sd3_wrong_flat_fields', verdict: 'incorrect', reason: '每個可能屬性都開欄位，會導致文件欄位數量爆炸、每個屬性都要建索引（索引數量爆炸），且新品類出現時就要一直修改 schema。' },
      { puzzleId: 'sd3_wrong_collection_per_category', verdict: 'incorrect', reason: '品類持續增加會讓 collection 數量持續增加，造成 Massive Number of Collections 反模式，跨品類查詢與維護都會變得非常困難。' },
    ],
    concept: 'Attribute Pattern',
    hint: '這題的關鍵是「屬性種類多且會持續變化，但需要支援任意屬性查詢」——想想哪個模式是為了這種情境設計的。',
  },

  // ─── boss: anti-pattern diagnosis ──────────────────────────────────────
  {
    id: 'sd4',
    type: 'SCHEMA_ANTIPATTERN',
    title: '這個商品文件的 reviews 陣列設計有什麼問題？',
    difficulty: 'boss',
    collection: 'products',
    context: '商品文件把所有顧客評論都內嵌在同一個陣列欄位裡。熱門商品已經累積數萬則評論，文件大小持續逼近 16MB 上限，寫入新評論的延遲也越來越高，且每次讀取商品基本資訊都要一起載入整個評論陣列。',
    schema: {
      _id: 'ObjectId',
      name: 'string',
      reviews: 'Array<Review> // 內嵌所有評論，無上限，目前已有數萬筆',
    },
    sampleDocuments: [
      { _id: 'p1', name: 'Phone X', reviews: [{ user: 'u1', rating: 5, text: '...' } /* ...數萬筆 */] },
    ],
    slots: SCHEMA_DESIGN_SLOTS,
    puzzles: [
      {
        id: 'sd4_correct',
        kind: 'schema-option',
        label: 'Massive Arrays（無界陣列增長）',
        isDistractor: false,
        value: {
          summary: '陣列沒有上限地持續增長，導致文件過大、寫入變慢。建議改用獨立 reviews collection（搭配 productId 索引）或 Bucket Pattern 分批儲存。',
          snippet: { reviews: { productId: 'ObjectId', user: 'string', rating: 'number', text: 'string' } },
        },
      },
      {
        id: 'sd4_wrong_bloated',
        kind: 'schema-option',
        label: 'Bloated Documents（文件塞入過多不相關欄位）',
        isDistractor: true,
        value: {
          summary: '診斷為文件包含太多彼此不相關的欄位，應該拆分成多個文件。',
          snippet: { note: '此情境的核心問題是單一欄位（陣列）無界增長，不是欄位本身彼此不相關。' },
        },
      },
      {
        id: 'sd4_wrong_separated',
        kind: 'schema-option',
        label: 'Separating Data that is Accessed Together（該一起讀的資料被拆開）',
        isDistractor: true,
        value: {
          summary: '診斷為常一起讀取的資料被拆散到不同 collection，應該合併。',
          snippet: { note: '此情境的問題方向相反：是不該綁在一起的資料被綁死在同一份文件，而非該一起讀的資料被拆開。' },
        },
      },
    ],
    answerKey: { s_design: 'sd4_correct' },
    patternName: 'Massive Arrays（無界陣列增長）',
    optionExplanations: [
      { puzzleId: 'sd4_correct', verdict: 'correct', reason: '評論陣列沒有上限地持續增長，數萬筆評論讓文件逼近 16MB 上限，且每次讀取商品基本資訊都要載入整個陣列，這正是 Massive Arrays 反模式的典型症狀。' },
      { puzzleId: 'sd4_wrong_bloated', verdict: 'incorrect', reason: 'Bloated Documents 描述的是文件中塞入大量彼此不相關的欄位，而這裡的問題集中在單一陣列欄位的無界增長，診斷方向不對。' },
      { puzzleId: 'sd4_wrong_separated', verdict: 'incorrect', reason: 'Separating Data that is Accessed Together 描述的是「該一起讀的資料被拆開」，但這裡的情境恰好相反：評論資料被綁在商品文件裡導致每次讀取商品都要載入不需要的評論。' },
    ],
    concept: 'Massive Arrays Anti-Pattern',
    hint: 'MongoDB 單一文件有 16MB 上限。想想看：這裡是哪個欄位在無止盡地增長？',
  },
];
