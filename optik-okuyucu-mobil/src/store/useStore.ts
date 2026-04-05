import { create } from 'zustand';
import { Quiz, SchoolClass, Student, ScanResult, AnswerChoice, GroupLabel } from '../types';
import * as DB from '../services/database';

interface AppState {
  quizzes: Quiz[];
  classes: SchoolClass[];
  students: Student[];
  results: ScanResult[];
  activeQuiz: Quiz | null;
  activeClass: SchoolClass | null;
  isLoading: boolean;
  error: string | null;

  loadQuizzes: () => Promise<void>;
  loadClasses: () => Promise<void>;
  loadStudents: (classId: number) => Promise<void>;
  loadResults: (quizId: number) => Promise<void>;

  setActiveQuiz: (quiz: Quiz | null) => void;
  setActiveClass: (cls: SchoolClass | null) => void;

  addQuiz: (
    title: string,
    questionCount: number,
    answerKeys: Record<GroupLabel, AnswerChoice[]>,
    groupCount: number,
    negativeMarking: boolean,
    negativeValue: number
  ) => Promise<number>;

  addClass: (name: string, grade: string) => Promise<void>;
  addStudent: (classId: number, name: string, studentNumber: string) => Promise<void>;
  saveResult: (result: Omit<ScanResult, 'id'>) => Promise<void>;

  deleteQuiz: (id: number) => Promise<void>;
  deleteClass: (id: number) => Promise<void>;
  deleteStudent: (id: number) => Promise<void>;
  deleteResult: (id: number) => Promise<void>;

  findStudentByNumber: (studentNumber: string) => Promise<Student | null>;

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

  loadStudents: async (classId) => {
    try {
      set({ isLoading: true });
      const students = await DB.getStudentsByClass(classId);
      set({ students, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  loadResults: async (quizId) => {
    try {
      set({ isLoading: true });
      const results = await DB.getResultsByQuiz(quizId);
      set({ results, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  setActiveQuiz: (quiz) => set({ activeQuiz: quiz }),
  setActiveClass: (cls) => set({ activeClass: cls }),

  addQuiz: async (title, questionCount, answerKeys, groupCount, negativeMarking, negativeValue) => {
    try {
      const quizId = await DB.createQuiz(
        title,
        questionCount,
        answerKeys,
        groupCount,
        negativeMarking,
        negativeValue
      );
      await get().loadQuizzes();
      return quizId;
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  addClass: async (name, grade) => {
    try {
      await DB.createClass(name, grade);
      await get().loadClasses();
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  addStudent: async (classId, name, studentNumber) => {
    try {
      await DB.createStudent(classId, name, studentNumber);
      await get().loadStudents(classId);
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  saveResult: async (result) => {
    try {
      await DB.saveResult(result);
      await get().loadResults(result.quizId);
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  deleteQuiz: async (id) => {
    try {
      await DB.deleteQuiz(id);
      await get().loadQuizzes();
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  deleteClass: async (id) => {
    try {
      await DB.deleteClass(id);
      await get().loadClasses();
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  deleteStudent: async (id) => {
    try {
      await DB.deleteStudent(id);
      const { activeClass } = get();
      if (activeClass) {
        await get().loadStudents(activeClass.id);
      }
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  deleteResult: async (id) => {
    try {
      await DB.deleteResult(id);
      const { activeQuiz } = get();
      if (activeQuiz) {
        await get().loadResults(activeQuiz.id);
      }
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  findStudentByNumber: async (studentNumber) => {
  try {
    return await DB.findStudentByNumber(studentNumber);
  } catch (e: any) {
    set({ error: e.message });
    return null;
  }
},

  clearError: () => set({ error: null }),
}));