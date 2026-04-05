export type AnswerChoice = 'A' | 'B' | 'C' | 'D' | 'E' | null;
export type GroupLabel  = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Quiz {
  id:              number;
  title:           string;
  questionCount:   number;
  // Tek grup → answerKeys[0], çok grup → answerKeys[A..E]
  answerKeys:      Record<GroupLabel, AnswerChoice[]>; // her zaman 5 key, kullanılmayan boş dizi
  groupCount:      number;   // 1 = grup yok, 2-5 = A,B,C... grupları
  negativeMarking: boolean;
  negativeValue:   number;
  createdAt:       string;
}

export interface SchoolClass {
  id:        number;
  name:      string;
  grade:     string;
  createdAt: string;
}

export interface Student {
  id:            number;
  classId:       number;
  name:          string;
  studentNumber: string;
}

export interface ScanResult {
  id:            number;
  quizId:        number;
  studentId:     number | null;
  studentName:   string;
  studentNumber: string;
  group:         GroupLabel | null;  // hangi kitapçık grubuna ait
  answers:       AnswerChoice[];
  score:         number;
  correct:       number;
  wrong:         number;
  blank:         number;
  namePhotoUri:  string | null;      // Ad/Soyad bölgesi crop fotoğrafı
  scannedAt:     string;
}

export interface QuizStats {
  average:       number;
  highest:       number;
  lowest:        number;
  questionStats: { questionNo: number; wrongCount: number; blankCount: number }[];
}

// Yardımcı: tüm grup etiketleri
export const ALL_GROUPS: GroupLabel[] = ['A', 'B', 'C', 'D', 'E'];

// Boş answerKeys şablonu
export function emptyAnswerKeys(questionCount: number): Record<GroupLabel, AnswerChoice[]> {
  const empty = Array(questionCount).fill(null) as AnswerChoice[];
  return { A: [...empty], B: [...empty], C: [...empty], D: [...empty], E: [...empty] };
}
