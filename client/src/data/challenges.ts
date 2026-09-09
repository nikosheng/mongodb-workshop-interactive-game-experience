/**
 * Client-side challenge data.
 * Must stay in sync with server/src/lib/challengeData.ts.
 * The server is the authoritative source for validation.
 */
import type { Challenge } from '@query-quest/shared';

export const CHALLENGE_VERSION = '1.0';

export const defaultChallenges: Challenge[] = [
  // ─── Challenge 1: SELECT + WHERE equality ─────────────────────────────
  {
    id: 'ch1',
    type: 'FIND',
    title: '基本查詢：找出已付款訂單',
    difficulty: 'beginner',
    sql: "SELECT orderId, total FROM orders WHERE status = 'paid';",
    collection: 'orders',
    context: '電商平台訂單管理系統，需要篩選特定狀態的訂單並指定回傳欄位。',
    schema: {
      _id: 'ObjectId',
      orderId: 'string',
      customerId: 'string',
      status: "'paid' | 'pending' | 'cancelled'",
      total: 'number',
      createdAt: 'Date',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', customerId: 'c1', status: 'paid', total: 1500, createdAt: '2024-01-01' },
      { _id: '2', orderId: 'ORD-002', customerId: 'c2', status: 'pending', total: 800, createdAt: '2024-01-02' },
      { _id: '3', orderId: 'ORD-003', customerId: 'c1', status: 'paid', total: 200, createdAt: '2024-01-03' },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true, hint: 'MongoDB 查詢指令' },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: 'WHERE 對應 filter 物件' },
      { id: 's_proj', label: 'Projection 欄位', accepts: ['projection'], required: true, hint: 'SELECT 欄位對應 projection' },
    ],
    puzzles: [
      { id: 'p_find', label: 'find', kind: 'command', value: 'find' },
      { id: 'p_aggregate', label: 'aggregate', kind: 'command', value: 'aggregate', isDistractor: true },
      { id: 'p_filter_paid', label: '{ status: "paid" }', kind: 'filter', value: { status: 'paid' } },
      { id: 'p_filter_pending', label: '{ status: "pending" }', kind: 'filter', value: { status: 'pending' }, isDistractor: true },
      { id: 'p_proj_ot', label: '{ orderId: 1, total: 1, _id: 0 }', kind: 'projection', value: { orderId: 1, total: 1, _id: 0 } },
      { id: 'p_proj_all', label: '{}', kind: 'projection', value: {}, isDistractor: true },
    ],
    expected: {
      type: 'FIND',
      collection: 'orders',
      filter: { status: 'paid' },
      projection: { orderId: 1, total: 1, _id: 0 },
    },
    answerKey: { s_cmd: 'p_find', s_filter: 'p_filter_paid', s_proj: 'p_proj_ot' },
    concept: 'SELECT 欄位 → projection；WHERE 條件 → filter 物件；find() 接受 (filter, projection) 兩個參數。',
    hint: 'db.orders.find( <filter>, <projection> )，projection 中 1 表示回傳，0 表示排除。',
  },

  // ─── Challenge 2: Comparison $gte ────────────────────────────────────
  {
    id: 'ch2',
    type: 'FIND',
    title: '比較條件：高額訂單篩選',
    difficulty: 'beginner',
    sql: 'SELECT * FROM orders WHERE total >= 1000;',
    collection: 'orders',
    context: '找出所有總金額大於等於 1000 的訂單。',
    schema: {
      _id: 'ObjectId',
      orderId: 'string',
      status: 'string',
      total: 'number',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', status: 'paid', total: 1500 },
      { _id: '2', orderId: 'ORD-002', status: 'pending', total: 800 },
      { _id: '3', orderId: 'ORD-003', status: 'paid', total: 3000 },
      { _id: '4', orderId: 'ORD-004', status: 'cancelled', total: 50 },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: 'total >= 1000 → 使用 $gte 運算子' },
    ],
    puzzles: [
      { id: 'p_find', label: 'find', kind: 'command', value: 'find' },
      { id: 'p_filter_gte', label: '{ total: { $gte: 1000 } }', kind: 'filter', value: { total: { $gte: 1000 } } },
      { id: 'p_filter_gt', label: '{ total: { $gt: 1000 } }', kind: 'filter', value: { total: { $gt: 1000 } }, isDistractor: true },
      { id: 'p_filter_lte', label: '{ total: { $lte: 1000 } }', kind: 'filter', value: { total: { $lte: 1000 } }, isDistractor: true },
    ],
    expected: {
      type: 'FIND',
      collection: 'orders',
      filter: { total: { $gte: 1000 } },
    },
    answerKey: { s_cmd: 'p_find', s_filter: 'p_filter_gte' },
    concept: 'SQL >= 對應 MongoDB $gte（greater than or equal）；$gt 表示嚴格大於（不含等於）。',
    hint: '注意 $gte（包含等於 1000）vs $gt（嚴格大於 1000），此題是 >= 所以用 $gte。',
  },

  // ─── Challenge 3: $in ─────────────────────────────────────────────────
  {
    id: 'ch3',
    type: 'FIND',
    title: '$in 條件：多狀態訂單查詢',
    difficulty: 'beginner',
    sql: "SELECT * FROM orders WHERE status IN ('paid', 'pending');",
    collection: 'orders',
    context: '一次查詢多個可接受的狀態值，等同 SQL 的 IN 子句。',
    schema: {
      _id: 'ObjectId',
      orderId: 'string',
      status: 'string',
      total: 'number',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', status: 'paid', total: 1500 },
      { _id: '2', orderId: 'ORD-002', status: 'pending', total: 800 },
      { _id: '3', orderId: 'ORD-003', status: 'cancelled', total: 200 },
      { _id: '4', orderId: 'ORD-004', status: 'pending', total: 500 },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: 'IN (a, b) → $in: [a, b]' },
    ],
    puzzles: [
      { id: 'p_find', label: 'find', kind: 'command', value: 'find' },
      { id: 'p_filter_in', label: "{ status: { $in: ['paid', 'pending'] } }", kind: 'filter', value: { status: { $in: ['paid', 'pending'] } } },
      { id: 'p_filter_or', label: "{ $or: [{ status: 'paid' }, { status: 'pending' }] }", kind: 'filter', value: { $or: [{ status: 'paid' }, { status: 'pending' }] }, isDistractor: true },
      { id: 'p_filter_nin', label: "{ status: { $nin: ['paid', 'pending'] } }", kind: 'filter', value: { status: { $nin: ['paid', 'pending'] } }, isDistractor: true },
    ],
    expected: {
      type: 'FIND',
      collection: 'orders',
      filter: { status: { $in: ['paid', 'pending'] } },
    },
    answerKey: { s_cmd: 'p_find', s_filter: 'p_filter_in' },
    concept: 'SQL IN (...) → MongoDB $in: [...]；$or 也能達到類似效果但語法更冗長；$nin 是反向（NOT IN）。',
    hint: '$in 接受一個陣列，文件的欄位值只要匹配陣列中任一元素即回傳。',
  },

  // ─── Challenge 4: ORDER BY + FETCH FIRST ─────────────────────────────
  {
    id: 'ch4',
    type: 'FIND',
    title: '排序與限制：最新三筆訂單',
    difficulty: 'intermediate',
    sql: 'SELECT * FROM orders ORDER BY createdAt DESC FETCH FIRST 3 ROWS ONLY;',
    collection: 'orders',
    context: '取最新建立的前三筆訂單，依建立時間由新到舊排列。',
    schema: {
      _id: 'ObjectId',
      orderId: 'string',
      status: 'string',
      total: 'number',
      createdAt: 'Date',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', status: 'paid', total: 1500, createdAt: '2024-01-01' },
      { _id: '2', orderId: 'ORD-002', status: 'pending', total: 800, createdAt: '2024-01-05' },
      { _id: '3', orderId: 'ORD-003', status: 'paid', total: 200, createdAt: '2024-01-03' },
      { _id: '4', orderId: 'ORD-004', status: 'cancelled', total: 3000, createdAt: '2024-01-07' },
      { _id: '5', orderId: 'ORD-005', status: 'pending', total: 500, createdAt: '2024-01-09' },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: '無 WHERE → 空 filter {}' },
      { id: 's_sort', label: '.sort()', accepts: ['sort'], required: true, hint: 'DESC → -1' },
      { id: 's_limit', label: '.limit()', accepts: ['limit'], required: true, hint: 'FETCH FIRST 3 ROWS ONLY → limit(3)' },
    ],
    puzzles: [
      { id: 'p_find', label: 'find', kind: 'command', value: 'find' },
      { id: 'p_filter_empty', label: '{}', kind: 'filter', value: {} },
      { id: 'p_sort_desc', label: '{ createdAt: -1 }', kind: 'sort', value: { createdAt: -1 } },
      { id: 'p_sort_asc', label: '{ createdAt: 1 }', kind: 'sort', value: { createdAt: 1 }, isDistractor: true },
      { id: 'p_limit_3', label: '3', kind: 'limit', value: 3 },
      { id: 'p_limit_5', label: '5', kind: 'limit', value: 5, isDistractor: true },
    ],
    expected: {
      type: 'FIND',
      collection: 'orders',
      filter: {},
      sort: { createdAt: -1 },
      limit: 3,
    },
    answerKey: { s_cmd: 'p_find', s_filter: 'p_filter_empty', s_sort: 'p_sort_desc', s_limit: 'p_limit_3' },
    concept: 'ORDER BY field DESC → .sort({ field: -1 })；ASC → 1；FETCH FIRST n ROWS ONLY → .limit(n)；方法鏈接在 find() 後。',
    hint: 'find({}).sort({ createdAt: -1 }).limit(3)，注意 -1 為降序（新到舊）。',
  },

  // ─── Challenge 5: INSERT ──────────────────────────────────────────────
  {
    id: 'ch5',
    type: 'INSERT',
    title: '新增文件：建立待處理訂單',
    difficulty: 'beginner',
    sql: "INSERT INTO orders (orderId, customerId, status, total, createdAt)\nVALUES ('ORD-999', 'c5', 'pending', 750, CURRENT_TIMESTAMP);",
    collection: 'orders',
    context: '新增一筆 pending 狀態的新訂單到 orders collection。',
    schema: {
      _id: 'ObjectId（自動產生）',
      orderId: 'string',
      customerId: 'string',
      status: 'string',
      total: 'number',
      createdAt: 'Date',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', customerId: 'c1', status: 'paid', total: 1500, createdAt: '2024-01-01' },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_doc', label: 'Document 物件', accepts: ['update'], required: true, hint: 'INSERT 的欄位值對應 document 物件' },
    ],
    puzzles: [
      { id: 'p_insertOne', label: 'insertOne', kind: 'command', value: 'insertOne' },
      { id: 'p_insertMany', label: 'insertMany', kind: 'command', value: 'insertMany', isDistractor: true },
      { id: 'p_doc', label: "{ orderId: 'ORD-999', customerId: 'c5', status: 'pending', total: 750, createdAt: new Date() }", kind: 'update', value: { orderId: 'ORD-999', customerId: 'c5', status: 'pending', total: 750 } },
      { id: 'p_doc_wrong', label: "{ orderId: 'ORD-999', status: 'paid', total: 750 }", kind: 'update', value: { orderId: 'ORD-999', status: 'paid', total: 750 }, isDistractor: true },
    ],
    expected: {
      type: 'INSERT',
      collection: 'orders',
      document: { orderId: 'ORD-999', customerId: 'c5', status: 'pending', total: 750 },
    },
    answerKey: { s_cmd: 'p_insertOne', s_doc: 'p_doc' },
    concept: 'SQL INSERT INTO ... VALUES → MongoDB insertOne({ field: value, ... })；_id 由 MongoDB 自動產生。',
    hint: 'insertOne() 接受一個 document 物件，欄位直接寫在物件中，不需要指定 _id。',
  },

  // ─── Challenge 6: UPDATE with $inc ───────────────────────────────────
  {
    id: 'ch6',
    type: 'UPDATE',
    title: '累加更新：Gold 客戶點數 +100',
    difficulty: 'intermediate',
    sql: "UPDATE customers SET points = points + 100 WHERE tier = 'gold';",
    collection: 'customers',
    context: '對所有 gold 等級客戶的 points 欄位做累加，不是直接設定新值。',
    schema: {
      _id: 'ObjectId',
      name: 'string',
      tier: "'gold' | 'silver' | 'bronze'",
      points: 'number',
      email: 'string',
    },
    sampleDocuments: [
      { _id: 'c1', name: 'Alice', tier: 'gold', points: 500, email: 'alice@example.com' },
      { _id: 'c2', name: 'Bob', tier: 'silver', points: 200, email: 'bob@example.com' },
      { _id: 'c3', name: 'Carol', tier: 'gold', points: 800, email: 'carol@example.com' },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: 'WHERE tier = gold' },
      { id: 's_update', label: 'Update 操作', accepts: ['update'], required: true, hint: 'points + 100 → $inc，不是 $set' },
    ],
    puzzles: [
      { id: 'p_updateMany', label: 'updateMany', kind: 'command', value: 'updateMany' },
      { id: 'p_updateOne', label: 'updateOne', kind: 'command', value: 'updateOne', isDistractor: true },
      { id: 'p_filter_gold', label: "{ tier: 'gold' }", kind: 'filter', value: { tier: 'gold' } },
      { id: 'p_inc_points', label: '{ $inc: { points: 100 } }', kind: 'update', value: { $inc: { points: 100 } } },
      { id: 'p_set_points', label: '{ $set: { points: 100 } }', kind: 'update', value: { $set: { points: 100 } }, isDistractor: true },
    ],
    expected: {
      type: 'UPDATE',
      collection: 'customers',
      filter: { tier: 'gold' },
      update: { $inc: { points: 100 } },
      multi: true,
    },
    answerKey: { s_cmd: 'p_updateMany', s_filter: 'p_filter_gold', s_update: 'p_inc_points' },
    concept: 'points = points + 100 → $inc: { points: 100 }；$set 是直接設定新值；UPDATE 多筆 → updateMany()。',
    hint: '$inc 會在原本的數值上加 n，而 $set 會直接覆蓋。這題要的是「累加」，所以用 $inc。',
  },

  // ─── Challenge 7: DELETE with safe filter ────────────────────────────
  {
    id: 'ch7',
    type: 'DELETE',
    title: '安全刪除：移除指定取消訂單',
    difficulty: 'intermediate',
    sql: "DELETE FROM orders WHERE _id = 'ord3' AND status = 'cancelled';",
    collection: 'orders',
    context: '刪除一筆特定 id 且狀態為 cancelled 的訂單，雙重條件確保安全。',
    schema: {
      _id: 'string',
      orderId: 'string',
      status: 'string',
      total: 'number',
    },
    sampleDocuments: [
      { _id: 'ord1', orderId: 'ORD-001', status: 'paid', total: 1500 },
      { _id: 'ord2', orderId: 'ORD-002', status: 'pending', total: 800 },
      { _id: 'ord3', orderId: 'ORD-003', status: 'cancelled', total: 200 },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true },
      { id: 's_filter', label: 'Filter 條件', accepts: ['filter'], required: true, hint: '包含 _id 和 status 的雙重篩選' },
    ],
    puzzles: [
      { id: 'p_deleteOne', label: 'deleteOne', kind: 'command', value: 'deleteOne' },
      { id: 'p_deleteMany', label: 'deleteMany', kind: 'command', value: 'deleteMany', isDistractor: true },
      { id: 'p_filter_safe', label: "{ _id: 'ord3', status: 'cancelled' }", kind: 'filter', value: { _id: 'ord3', status: 'cancelled' } },
      { id: 'p_filter_status_only', label: "{ status: 'cancelled' }", kind: 'filter', value: { status: 'cancelled' }, isDistractor: true },
    ],
    expected: {
      type: 'DELETE',
      collection: 'orders',
      filter: { _id: 'ord3', status: 'cancelled' },
      multi: false,
    },
    answerKey: { s_cmd: 'p_deleteOne', s_filter: 'p_filter_safe' },
    concept: 'deleteOne 只刪第一筆匹配文件；永遠加上明確的 filter 以免誤刪資料；雙重條件（_id + status）是最佳實務。',
    hint: '使用 deleteOne 並包含 _id 確保只刪一筆，同時加 status: cancelled 作為額外保險。',
  },

  // ─── Challenge 8: AGGREGATE (Boss) ───────────────────────────────────
  {
    id: 'ch8',
    type: 'AGGREGATE',
    title: 'Boss 關：訂單狀態統計與排名',
    difficulty: 'boss',
    sql: 'SELECT status, COUNT(*) AS count\nFROM orders\nGROUP BY status\nORDER BY count DESC;',
    collection: 'orders',
    context: '使用 Aggregation Pipeline 統計各狀態訂單數量，並依數量由多到少排序。',
    schema: {
      _id: 'ObjectId',
      orderId: 'string',
      status: 'string',
      total: 'number',
    },
    sampleDocuments: [
      { _id: '1', orderId: 'ORD-001', status: 'paid', total: 1500 },
      { _id: '2', orderId: 'ORD-002', status: 'pending', total: 800 },
      { _id: '3', orderId: 'ORD-003', status: 'paid', total: 200 },
      { _id: '4', orderId: 'ORD-004', status: 'cancelled', total: 3000 },
      { _id: '5', orderId: 'ORD-005', status: 'pending', total: 500 },
      { _id: '6', orderId: 'ORD-006', status: 'paid', total: 750 },
    ],
    slots: [
      { id: 's_cmd', label: 'Command', accepts: ['command'], required: true, hint: 'SQL GROUP BY → aggregate()' },
      { id: 's_stage1', label: 'Stage 1：分組', accepts: ['stage'], required: true, hint: 'GROUP BY status → $group' },
      { id: 's_stage2', label: 'Stage 2：排序', accepts: ['stage'], required: true, hint: 'ORDER BY count DESC → $sort' },
    ],
    puzzles: [
      { id: 'p_aggregate', label: 'aggregate', kind: 'command', value: 'aggregate' },
      { id: 'p_find', label: 'find', kind: 'command', value: 'find', isDistractor: true },
      { id: 'p_group', label: "{ $group: { _id: '$status', count: { $sum: 1 } } }", kind: 'stage', value: { $group: { _id: '$status', count: { $sum: 1 } } } },
      { id: 'p_match', label: "{ $match: { status: 'paid' } }", kind: 'stage', value: { $match: { status: 'paid' } }, isDistractor: true },
      { id: 'p_sort_count_desc', label: '{ $sort: { count: -1 } }', kind: 'stage', value: { $sort: { count: -1 } } },
      { id: 'p_sort_count_asc', label: '{ $sort: { count: 1 } }', kind: 'stage', value: { $sort: { count: 1 } }, isDistractor: true },
    ],
    expected: {
      type: 'AGGREGATE',
      collection: 'orders',
      pipeline: [
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
    },
    answerKey: { s_cmd: 'p_aggregate', s_stage1: 'p_group', s_stage2: 'p_sort_count_desc' },
    concept: 'SQL GROUP BY → $group；COUNT(*) → $sum: 1；ORDER BY → $sort；aggregate() 接受一個 pipeline 陣列，依序處理。',
    hint: 'Aggregation Pipeline 像水管：文件依序通過每個 stage。先 $group 分組計數，再 $sort 排序。',
  },
];
