// ─── Puzzle System Types ───────────────────────────────────────────────────

export type PuzzleKind =
  | 'command'
  | 'collection'
  | 'filter'
  | 'projection'
  | 'update'
  | 'options'
  | 'pipeline'
  | 'sort'
  | 'limit'
  | 'field'
  | 'operator'
  | 'value'
  | 'structure'
  | 'stage';

export type ChallengeType = 'FIND' | 'INSERT' | 'UPDATE' | 'DELETE' | 'AGGREGATE';

export interface Puzzle {
  id: string;
  label: string;
  kind: PuzzleKind;
  value: unknown;
  isDistractor?: boolean;
}

export interface Slot {
  id: string;
  label: string;
  accepts: PuzzleKind[];
  required: boolean;
  hint?: string;
}

export interface MqlBreakdownItem {
  slotId: string;
  title: string;
  role: string;
  sqlMapping: string;
  explanation: string;
}

export interface Challenge {
  id: string;
  type: ChallengeType;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'boss';
  sql: string;
  collection: string;
  context: string;
  schema: Record<string, string>;
  sampleDocuments: Record<string, unknown>[];
  slots: Slot[];
  puzzles: Puzzle[];
  /** Required slot ID -> the one puzzle ID accepted for that slot. */
  answerKey: Record<string, string>;
  /** Teaching notes explaining each MQL fragment and its position. */
  mqlBreakdown?: MqlBreakdownItem[];
  /** The structured answer to validate against (used by evaluator) */
  expected: ExpectedAnswer;
  concept: string;
  hint: string;
}

export type QuestionBankStatus = 'generating' | 'review' | 'ready' | 'error';

export interface GlobalBankConstraints {
  requiredDifficulties: Array<'beginner' | 'intermediate' | 'advanced' | 'boss'>;
  requiredChallengeTypes: ChallengeType[];
  finalChallengeMustBeAggregate: boolean;
  finalChallengeRequiredStages: Array<'$group' | '$match' | '$sort'>;
  requireMqlBreakdown: boolean;
  requireAnswerKey: boolean;
  minDistractorsPerRequiredSlot: number;
}

export interface QuestionBank {
  _id: string;
  name: string;
  useCase: string;
  challenges: Challenge[];
  status: QuestionBankStatus;
  approvedQuestionIds: string[];
  errorMsg?: string;
  createdAt: string;
  updatedAt?: string;
  isActive: boolean;
}

// ─── Expected Answer AST ──────────────────────────────────────────────────

export type ExpectedAnswer =
  | FindAnswer
  | InsertAnswer
  | UpdateAnswer
  | DeleteAnswer
  | AggregateAnswer;

export interface FindAnswer {
  type: 'FIND';
  collection: string;
  filter: MongoFilter;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface InsertAnswer {
  type: 'INSERT';
  collection: string;
  document: Record<string, unknown>;
}

export interface UpdateAnswer {
  type: 'UPDATE';
  collection: string;
  filter: MongoFilter;
  update: MongoUpdate;
  multi?: boolean;
  upsert?: boolean;
}

export interface DeleteAnswer {
  type: 'DELETE';
  collection: string;
  filter: MongoFilter;
  multi?: boolean;
}

export interface AggregateAnswer {
  type: 'AGGREGATE';
  collection: string;
  pipeline: MongoPipelineStage[];
}

// ─── MongoDB Filter / Update AST ─────────────────────────────────────────

export type MongoFilter = Record<string, unknown>;

export interface MongoUpdate {
  $set?: Record<string, unknown>;
  $inc?: Record<string, number>;
  $push?: Record<string, unknown>;
}

export type MongoPipelineStage =
  | { $match: MongoFilter }
  | { $group: Record<string, unknown> }
  | { $sort: Record<string, 1 | -1> }
  | { $project: Record<string, 0 | 1 | unknown> }
  | { $limit: number };

// ─── Player / Session Types ───────────────────────────────────────────────

export interface Player {
  _id?: string;
  name: string;
  sessionToken: string;
  createdAt: Date;
}

export type GameMode = 'solo' | 'multiplayer';

export interface GameSession {
  _id?: string;
  playerId: string;
  roomId?: string;
  mode: GameMode;
  challengeVersion: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'active' | 'completed' | 'abandoned';
}

export interface AttemptRecord {
  _id?: string;
  sessionId: string;
  playerId: string;
  challengeId: string;
  isCorrect: boolean;
  timeTakenMs: number;
  attemptCount: number;
  hintsUsed: number;
  serverScore: number;
}

export interface LeaderboardEntry {
  _id?: string;
  playerId: string;
  playerName: string;
  sessionId: string;
  roomId?: string;
  mode: GameMode;
  totalScore: number;
  completionMs: number;
  hintsUsed: number;
  correctCount: number;
  totalChallenges: number;
  completedAt: Date;
}

// ─── Room / Multiplayer Types ─────────────────────────────────────────────

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  playerId: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
  completedAt?: Date;
  totalScore?: number;
  hintsUsed?: number;
}

export interface Room {
  _id?: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  maxPlayers: number;
  challengeSetId: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
}

// ─── API Request / Response Types ────────────────────────────────────────

export interface CreateRoomRequest {
  challengeSetId?: string;
}

export interface JoinRoomRequest {
  code: string;
}

export interface SubmitAttemptRequest {
  sessionId: string;
  challengeId: string;
  /** Structured slot assignments from client */
  slotAssignments: Record<string, string>; // slotId -> puzzleId
  timeTakenMs: number;
  attemptCount: number;
  hintsUsed: number;
}

export interface SubmitAttemptResponse {
  isCorrect: boolean;
  serverScore: number;
  feedback: ValidationFeedback;
}

export interface ValidationFeedback {
  slotErrors: string[];
  structureErrors: string[];
  semanticErrors: string[];
  explanation: string;
}

export interface CompleteSessionRequest {
  sessionId: string;
  submitToLeaderboard: boolean;
}

// ─── Socket.IO Event Types ────────────────────────────────────────────────

export interface ServerToClientEvents {
  roomUpdated: (room: Room) => void;
  gameStarted: (data: { room: Room; startTimestamp: number }) => void;
  playerProgress: (data: { playerId: string; completedChallenges: number }) => void;
  gameResult: (data: { entries: LeaderboardEntry[] }) => void;
  roomClosed: (reason: string) => void;
  hostChanged: (newHostId: string) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (data: CreateRoomRequest, cb: (room: Room | null, err?: string) => void) => void;
  joinRoom: (data: JoinRoomRequest, cb: (room: Room | null, err?: string) => void) => void;
  setReady: (isReady: boolean) => void;
  startGame: () => void;
  challengeCompleted: (data: { challengeId: string; score: number }) => void;
  completeSession: (data: { sessionId: string }) => void;
  leaveRoom: () => void;
}
