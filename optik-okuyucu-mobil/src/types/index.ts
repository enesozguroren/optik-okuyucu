export type AnswerChoice = 'A' | 'B' | 'C' | 'D' | 'E' | null;

export interface Quiz {
  id: number;
  title: string;
  questionCount: number;
  answerKey: AnswerChoice[];
  negativeMarking: boolean;
  negativeValue: number;
  createdAt: string;
}

export interface SchoolClass {
  id: number;
  name: string;
  grade: string;
  createdAt: string;
}

export interface Student {
  id: number;
  classId: number;
  name: string;
  studentNumber: string;
}

export interface ScanResult {
  id: number;
  quizId: number;
  studentId: number | null;
  studentName: string;
  studentNumber: string;
  answers: AnswerChoice[];
  score: number;
  correct: number;
  wrong: number;
  blank: number;
  scannedAt: string;
}

export interface QuizStats {
  average: number;
  highest: number;
  lowest: number;
  questionStats: { questionNo: number; wrongCount: number; blankCount: number }[];
}
