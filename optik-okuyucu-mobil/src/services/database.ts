import * as SQLite from 'expo-sqlite';
import { Quiz, SchoolClass, Student, ScanResult, AnswerChoice } from '../types';

const db = SQLite.openDatabaseSync('zipgrade.db');

export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      questionCount INTEGER NOT NULL,
      answerKey TEXT NOT NULL,
      negativeMarking INTEGER NOT NULL DEFAULT 0,
      negativeValue REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classId INTEGER NOT NULL,
      name TEXT NOT NULL,
      studentNumber TEXT NOT NULL,
      FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quizId INTEGER NOT NULL,
      studentId INTEGER,
      studentName TEXT NOT NULL,
      studentNumber TEXT NOT NULL,
      answers TEXT NOT NULL,
      score REAL NOT NULL,
      correct INTEGER NOT NULL,
      wrong INTEGER NOT NULL,
      blank INTEGER NOT NULL,
      scannedAt TEXT NOT NULL,
      FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);
}

// ─── Quiz ────────────────────────────────────────────────────────────────────

export async function createQuiz(
  title: string,
  questionCount: number,
  answerKey: AnswerChoice[],
  negativeMarking: boolean,
  negativeValue: number
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO quizzes (title, questionCount, answerKey, negativeMarking, negativeValue, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    title,
    questionCount,
    JSON.stringify(answerKey),
    negativeMarking ? 1 : 0,
    negativeValue,
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function getAllQuizzes(): Promise<Quiz[]> {
  const rows = await db.getAllAsync<any>('SELECT * FROM quizzes ORDER BY createdAt DESC');
  return rows.map(row => ({
    ...row,
    answerKey: JSON.parse(row.answerKey),
    negativeMarking: row.negativeMarking === 1,
  }));
}

export async function getQuiz(id: number): Promise<Quiz | null> {
  const row = await db.getFirstAsync<any>('SELECT * FROM quizzes WHERE id = ?', id);
  if (!row) return null;
  return {
    ...row,
    answerKey: JSON.parse(row.answerKey),
    negativeMarking: row.negativeMarking === 1,
  };
}

export async function deleteQuiz(id: number): Promise<void> {
  await db.runAsync('DELETE FROM quizzes WHERE id = ?', id);
}

// ─── Class ───────────────────────────────────────────────────────────────────

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
  return db.getAllAsync<SchoolClass>('SELECT * FROM classes ORDER BY name ASC');
}

export async function deleteClass(id: number): Promise<void> {
  await db.runAsync('DELETE FROM classes WHERE id = ?', id);
}

// ─── Student ─────────────────────────────────────────────────────────────────

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
  return db.getAllAsync<Student>('SELECT * FROM students WHERE classId = ? ORDER BY name ASC', classId);
}

export async function findStudentByNumber(studentNumber: string): Promise<Student | null> {
  return db.getFirstAsync<Student>('SELECT * FROM students WHERE studentNumber = ?', studentNumber);
}

export async function deleteStudent(id: number): Promise<void> {
  await db.runAsync('DELETE FROM students WHERE id = ?', id);
}

// ─── Result ──────────────────────────────────────────────────────────────────

export async function saveResult(result: Omit<ScanResult, 'id'>): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO results
      (quizId, studentId, studentName, studentNumber, answers, score, correct, wrong, blank, scannedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    result.quizId,
    result.studentId ?? null,
    result.studentName,
    result.studentNumber,
    JSON.stringify(result.answers),
    result.score,
    result.correct,
    result.wrong,
    result.blank,
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
    answers: JSON.parse(row.answers),
  }));
}

export async function deleteResult(id: number): Promise<void> {
  await db.runAsync('DELETE FROM results WHERE id = ?', id);
}
