import { create } from 'zustand';
import { Quiz, SchoolClass, Student, ScanResult } from '../types';
import * as DB from '../services/database';

interface AppState {
  // ─── Veri ────────────────────────────────────────────────────────────────
  quizzes: Quiz[];
  classes: SchoolClass[];
  students: Student[];
  results: ScanResult[];

  // ─── Aktif seçimler ───────────────────────────────────────────────────────
  activeQuiz: Quiz | null;
  activeClass: SchoolClass | null;

  // ─── UI durumu ────────────────────────────────────────────────────────────
  isLoading: boolean;
  error: string | null;

  // ─── Aksiyonlar ───────────────────────────────────────────────────────────
  loadQuizzes: () => Promise<void>;
  loadClasses: () => Promise<void>;
  loadStudents: (classId: number) => Promise<void>;
  loadResults: (quizId: number) => Promise<void>;

  setActiveQuiz: (quiz: Quiz | null) => void;
  setActiveClass: (cls: SchoolClass | null) => void;

  addQuiz: (
    title: string,
    questionCount: number,
    answerKey: import('../types').AnswerChoice[],
    negativeMarking: boolean,
    negativeValue: number
  ) => Promise<void>;

  addClass: (name: string, grade: string) => Promise<void>;
  addStudent: (classId: number, name: string, studentNumber: string) => Promise<void>;
  saveResult: (result: Omit<ScanResult, 'id'>) => Promise<void>;

  deleteQuiz: (id: number) => Promise<void>;
  deleteClass: (id: number) => Promise<void>;
  deleteStudent: (id: number) => Promise<void>;
  deleteResult: (id: number) => Promise<void>;

  clearError: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  quizzes: [],
  classes: [],
  students: [],
  results: [],
  activeQuiz: null,
  activeClass: null,
  isLoading: false,
  error: null,

  // ─── Load ──────────────────────────────────────────────────────────────────
  loadQuizzes: async () => {
    try {
      set({ isLoading: true });
      const quizzes = await DB.getAllQuizzes();
      set({ quizzes, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  loadClasses: async () => {
    try {
      set({ isLoading: true });
      const classes = await DB.getAllClasses();
      set({ classes, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  loadStudents: async (classId: number) => {
    try {
      set({ isLoading: true });
      const students = await DB.getStudentsByClass(classId);
      set({ students, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  loadResults: async (quizId: number) => {
    try {
      set({ isLoading: true });
      const results = await DB.getResultsByQuiz(quizId);
      set({ results, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  // ─── Setters ───────────────────────────────────────────────────────────────
  setActiveQuiz: (quiz) => set({ activeQuiz: quiz }),
  setActiveClass: (cls) => set({ activeClass: cls }),

  // ─── Create ────────────────────────────────────────────────────────────────
  addQuiz: async (title, questionCount, answerKey, negativeMarking, negativeValue) => {
    try {
      await DB.createQuiz(title, questionCount, answerKey, negativeMarking, negativeValue);
      await get().loadQuizzes();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  addClass: async (name, grade) => {
    try {
      await DB.createClass(name, grade);
      await get().loadClasses();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  addStudent: async (classId, name, studentNumber) => {
    try {
      await DB.createStudent(classId, name, studentNumber);
      await get().loadStudents(classId);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  saveResult: async (result) => {
    try {
      await DB.saveResult(result);
      await get().loadResults(result.quizId);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ─── Delete ────────────────────────────────────────────────────────────────
  deleteQuiz: async (id) => {
    try {
      await DB.deleteQuiz(id);
      await get().loadQuizzes();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteClass: async (id) => {
    try {
      await DB.deleteClass(id);
      await get().loadClasses();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteStudent: async (id) => {
    try {
      await DB.deleteStudent(id);
      const { activeClass } = get();
      if (activeClass) await get().loadStudents(activeClass.id);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteResult: async (id) => {
    try {
      await DB.deleteResult(id);
      const { activeQuiz } = get();
      if (activeQuiz) await get().loadResults(activeQuiz.id);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  clearError: () => set({ error: null }),
}));
