import * as SQLite from 'expo-sqlite';
import {
  Quiz,
  SchoolClass,
  Student,
  ScanResult,
  AnswerChoice,
  GroupLabel,
  emptyAnswerKeys,
} from '../types';

const db = SQLite.openDatabaseSync('zipgrade.db');

export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS quizzes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT    NOT NULL,
      questionCount   INTEGER NOT NULL,
      answerKeys      TEXT    NOT NULL,
      groupCount      INTEGER NOT NULL DEFAULT 1,
      negativeMarking INTEGER NOT NULL DEFAULT 0,
      negativeValue   REAL    NOT NULL DEFAULT 0,
      createdAt       TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      grade     TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      classId       INTEGER NOT NULL,
      name          TEXT    NOT NULL,
      studentNumber TEXT    NOT NULL,
      FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      quizId        INTEGER NOT NULL,
      studentId     INTEGER,
      studentName   TEXT    NOT NULL,
      studentNumber TEXT    NOT NULL,
      grp           TEXT,
      answers       TEXT    NOT NULL,
      score         REAL    NOT NULL,
      correct       INTEGER NOT NULL,
      wrong         INTEGER NOT NULL,
      blank         INTEGER NOT NULL,
      namePhotoUri  TEXT,
      scannedAt     TEXT    NOT NULL,
      FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);

  await migrateQuizzesTable();
  await migrateResultsTable();
}

async function migrateQuizzesTable(): Promise<void> {
  const quizColumns = await db.getAllAsync<any>(`PRAGMA table_info(quizzes)`);
  const quizColumnNames = quizColumns.map(col => col.name as string);

  const hasOldAnswerKey = quizColumnNames.includes('answerKey');
  const hasNewAnswerKeys = quizColumnNames.includes('answerKeys');
  const hasGroupCount = quizColumnNames.includes('groupCount');
  const hasNegativeMarking = quizColumnNames.includes('negativeMarking');
  const hasNegativeValue = quizColumnNames.includes('negativeValue');

  const needsRebuild =
    hasOldAnswerKey ||
    !hasNewAnswerKeys ||
    !hasGroupCount ||
    !hasNegativeMarking ||
    !hasNegativeValue;

  if (!needsRebuild) {
    return;
  }

  await db.execAsync(`
    DROP TABLE IF EXISTS quizzes_new;

    CREATE TABLE quizzes_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT    NOT NULL,
      questionCount   INTEGER NOT NULL,
      answerKeys      TEXT    NOT NULL,
      groupCount      INTEGER NOT NULL DEFAULT 1,
      negativeMarking INTEGER NOT NULL DEFAULT 0,
      negativeValue   REAL    NOT NULL DEFAULT 0,
      createdAt       TEXT    NOT NULL
    );
  `);

  const oldRows = await db.getAllAsync<any>(`SELECT * FROM quizzes`);

  for (const row of oldRows) {
    const questionCount = Number(row.questionCount ?? 0);
    const normalizedAnswerKeys = normalizeAnswerKeysFromRow(row, questionCount);

    await db.runAsync(
      `INSERT INTO quizzes_new
        (id, title, questionCount, answerKeys, groupCount, negativeMarking, negativeValue, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.title ?? '',
      questionCount,
      JSON.stringify(normalizedAnswerKeys),
      Number(row.groupCount ?? 1),
      Number(row.negativeMarking ?? 0),
      Number(row.negativeValue ?? 0),
      row.createdAt ?? new Date().toISOString()
    );
  }

  await db.execAsync(`
    DROP TABLE quizzes;
    ALTER TABLE quizzes_new RENAME TO quizzes;
  `);
}

async function migrateResultsTable(): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE results ADD COLUMN grp TEXT`);
  } catch {}

  try {
    await db.execAsync(`ALTER TABLE results ADD COLUMN namePhotoUri TEXT`);
  } catch {}
}

function normalizeAnswerKeysFromRow(
  row: any,
  questionCount: number
): Record<GroupLabel, AnswerChoice[]> {
  const empty = emptyAnswerKeys(questionCount);

  if (row.answerKeys) {
    try {
      const parsed = JSON.parse(row.answerKeys);

      if (Array.isArray(parsed)) {
        empty.A = parsed.slice(0, questionCount) as AnswerChoice[];
        return empty;
      }

      if (parsed && typeof parsed === 'object') {
        (['A', 'B', 'C', 'D', 'E'] as GroupLabel[]).forEach(group => {
          if (Array.isArray(parsed[group])) {
            empty[group] = parsed[group].slice(0, questionCount) as AnswerChoice[];
          }
        });
        return empty;
      }
    } catch {}
  }

  if (row.answerKey) {
    try {
      const parsed = JSON.parse(row.answerKey);
      if (Array.isArray(parsed)) {
        empty.A = parsed.slice(0, questionCount) as AnswerChoice[];
        return empty;
      }
    } catch {}
  }

  return empty;
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

function rowToQuiz(row: any): Quiz {
  let answerKeys: Record<GroupLabel, AnswerChoice[]>;

  try {
    const parsed = JSON.parse(row.answerKeys);

    if (Array.isArray(parsed)) {
      answerKeys = emptyAnswerKeys(row.questionCount);
      answerKeys.A = parsed as AnswerChoice[];
    } else {
      answerKeys = emptyAnswerKeys(row.questionCount);
      (['A', 'B', 'C', 'D', 'E'] as GroupLabel[]).forEach(group => {
        if (Array.isArray(parsed?.[group])) {
          answerKeys[group] = parsed[group] as AnswerChoice[];
        }
      });
    }
  } catch {
    answerKeys = emptyAnswerKeys(row.questionCount);
  }

  return {
    id: row.id,
    title: row.title,
    questionCount: row.questionCount,
    answerKeys,
    groupCount: row.groupCount ?? 1,
    negativeMarking: row.negativeMarking === 1,
    negativeValue: Number(row.negativeValue ?? 0),
    createdAt: row.createdAt,
  };
}

export async function createQuiz(
  title: string,
  questionCount: number,
  answerKeys: Record<GroupLabel, AnswerChoice[]>,
  groupCount: number,
  negativeMarking: boolean,
  negativeValue: number
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO quizzes
      (title, questionCount, answerKeys, groupCount, negativeMarking, negativeValue, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    title,
    questionCount,
    JSON.stringify(answerKeys),
    groupCount,
    negativeMarking ? 1 : 0,
    negativeValue,
    new Date().toISOString()
  );

  return result.lastInsertRowId;
}

export async function getAllQuizzes(): Promise<Quiz[]> {
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM quizzes ORDER BY createdAt DESC'
  );
  return rows.map(rowToQuiz);
}

export async function getQuiz(id: number): Promise<Quiz | null> {
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM quizzes WHERE id = ?',
    id
  );
  return row ? rowToQuiz(row) : null;
}

export async function deleteQuiz(id: number): Promise<void> {
  await db.runAsync('DELETE FROM quizzes WHERE id = ?', id);
}

// ─── Class ────────────────────────────────────────────────────────────────────

export async function createClass(name: string, grade: string): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO classes (name, grade, createdAt) VALUES (?, ?, ?)`,
    name,
    grade,
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function getAllClasses(): Promise<SchoolClass[]> {
  return db.getAllAsync<SchoolClass>(
    'SELECT * FROM classes ORDER BY name ASC'
  );
}

export async function deleteClass(id: number): Promise<void> {
  await db.runAsync('DELETE FROM classes WHERE id = ?', id);
}

// ─── Student ──────────────────────────────────────────────────────────────────

export async function createStudent(
  classId: number,
  name: string,
  studentNumber: string
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO students (classId, name, studentNumber) VALUES (?, ?, ?)`,
    classId,
    name,
    studentNumber
  );
  return result.lastInsertRowId;
}

export async function getStudentsByClass(classId: number): Promise<Student[]> {
  return db.getAllAsync<Student>(
    'SELECT * FROM students WHERE classId = ? ORDER BY name ASC',
    classId
  );
}

export async function findStudentByNumber(studentNumber: string): Promise<Student | null> {
  return db.getFirstAsync<Student>(
    'SELECT * FROM students WHERE studentNumber = ?',
    studentNumber
  );
}

export async function deleteStudent(id: number): Promise<void> {
  await db.runAsync('DELETE FROM students WHERE id = ?', id);
}

// ─── Result ───────────────────────────────────────────────────────────────────

export async function saveResult(result: Omit<ScanResult, 'id'>): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO results
      (quizId, studentId, studentName, studentNumber, grp, answers,
       score, correct, wrong, blank, namePhotoUri, scannedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    result.quizId,
    result.studentId ?? null,
    result.studentName,
    result.studentNumber,
    result.group ?? null,
    JSON.stringify(result.answers),
    result.score,
    result.correct,
    result.wrong,
    result.blank,
    result.namePhotoUri ?? null,
    result.scannedAt
  );

  return r.lastInsertRowId;
}

export async function getResultsByQuiz(quizId: number): Promise<ScanResult[]> {
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM results WHERE quizId = ? ORDER BY scannedAt DESC',
    quizId
  );

  return rows.map(row => ({
    ...row,
    group: row.grp ?? null,
    answers: JSON.parse(row.answers),
    namePhotoUri: row.namePhotoUri ?? null,
  }));
}

export async function deleteResult(id: number): Promise<void> {
  await db.runAsync('DELETE FROM results WHERE id = ?', id);
}