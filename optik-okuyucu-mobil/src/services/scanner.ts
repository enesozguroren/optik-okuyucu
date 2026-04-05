import * as ImageManipulator from 'expo-image-manipulator';
import { AnswerChoice, GroupLabel } from '../types';

// ─── Referans boyut (görüntü bu boyuta ölçeklenir) ───────────────────────────
const REF_W = 1547;
const REF_H = 2110;

// ─── PDF 300DPI analizinden elde edilen kesin normalize koordinatlar ──────────
// Form köşe kareleri: TL=(485,605) TR=(2032,605) BL=(485,2715) BR=(2032,2715)
// Tüm koordinatlar form alanı içinde normalize (0-1)

// Baloncuk pitch: 54px (300dpi'da)
// Referans boyuta (1547x2110) ölçeklenince:
//   54/1547 ≈ 0.0349 normalize adım

const PITCH_N = 0.0349; // normalize pitch

// ── Bölge 1: Ad/Soyad crop koordinatları ─────────────────────────────────────
export const AD_SOYAD_CROP = { x1: 0.0517, y1: 0.0024, x2: 0.9935, y2: 0.0545 };

// ── Bölge 2: Kitapçık Türü (Grup) — A,B,C,D,E daireleri tek sütun ────────────
const KT_X   = 0.0356;
const KT_YS: number[] = [0.1493, 0.1886, 0.2280, 0.2673, 0.3066]; // A,B,C,D,E
const GROUP_LABELS: GroupLabel[] = ['A', 'B', 'C', 'D', 'E'];

// ── Bölge 3: Student ID crop koordinatları ────────────────────────────────────
export const STUDENT_ID_CROP = { x1: 0.1067, y1: 0.1137, x2: 0.3329, y2: 0.1374 };

// ── Bölgeler 4-8: Cevap balonları ────────────────────────────────────────────
// xs = A,B,C,D,E seçeneklerinin x merkezi (normalize)
// y0 = ilk sorunun y merkezi, dy = sorular arası y mesafesi

type Region = {
  firstQ: number; lastQ: number;
  xs:     number[];
  y0:     number; dy: number;
};

const REGIONS: Region[] = [
  // Bölge 4 — Üst sol: soru 1-10
  { firstQ: 1,  lastQ: 10,
    xs: [0.1222, 0.1571, 0.1920, 0.2269, 0.2618],
    y0: 0.1692, dy: 0.0393 },
  // Bölge 5 — Üst orta: soru 11-20
  { firstQ: 11, lastQ: 20,
    xs: [0.4480, 0.4829, 0.5178, 0.5527, 0.5876],
    y0: 0.1692, dy: 0.0393 },
  // Bölge 6 — Üst sağ: soru 31-40
  { firstQ: 31, lastQ: 40,
    xs: [0.7285, 0.7634, 0.7983, 0.8332, 0.8681],
    y0: 0.1692, dy: 0.0393 },
  // Bölge 7 — Alt orta: soru 21-30
  { firstQ: 21, lastQ: 30,
    xs: [0.4480, 0.4829, 0.5178, 0.5527, 0.5876],
    y0: 0.5872, dy: 0.0337 },
  // Bölge 8 — Alt sağ: soru 41-50
  { firstQ: 41, lastQ: 50,
    xs: [0.7285, 0.7634, 0.7983, 0.8332, 0.8681],
    y0: 0.5872, dy: 0.0337 },
];

// Doluluk eşiği: boş balon ~240 parlaklık, dolu ~100-160 → eşik 200
const FILL_THRESHOLD = 200;
const SAMPLE_R       = 10; // crop yarıçapı (px, REF boyutuna göre)

// ─── Yardımcı: 1×1 JPEG crop → parlaklık ────────────────────────────────────
async function sampleBrightness(
  uri: string, cx: number, cy: number, imgW: number, imgH: number
): Promise<number> {
  try {
    const px = Math.round(cx * imgW);
    const py = Math.round(cy * imgH);
    const x0 = Math.max(0, px - SAMPLE_R);
    const y0 = Math.max(0, py - SAMPLE_R);
    const cw = Math.min(SAMPLE_R * 2, imgW - x0);
    const ch = Math.min(SAMPLE_R * 2, imgH - y0);

    const s = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX: x0, originY: y0, width: cw, height: ch } },
        { resize: { width: 1, height: 1 } },
      ],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1, base64: true }
    );

    return s.base64 ? jpegLenToBrightness(s.base64.length) : 255;
  } catch { return 255; }
}

// 1×1 JPEG base64 karakter sayısından parlaklık tahmini
// Siyah ~380 karakter, Beyaz ~700 karakter
function jpegLenToBrightness(len: number): number {
  const dark = 380, light = 700;
  return Math.round(((Math.max(dark, Math.min(light, len)) - dark) / (light - dark)) * 255);
}

async function isFilled(
  uri: string, cx: number, cy: number, w: number, h: number
): Promise<boolean> {
  return (await sampleBrightness(uri, cx, cy, w, h)) < FILL_THRESHOLD;
}

// ─── Ana export ───────────────────────────────────────────────────────────────
export interface ProcessedForm {
  answers:       AnswerChoice[];
  group:         GroupLabel | null;
  namePhotoUri:  string | null;  // Ad/Soyad crop'u (base64 data URI değil, dosya URI)
}

export async function processFormImage(
  uri: string,
  questionCount: number
): Promise<ProcessedForm> {
  // 1. Referans boyuta ölçekle
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: REF_W, height: REF_H } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
  );
  const ru = resized.uri;

  // 2. Ad/Soyad bölgesini crop et (fotoğraf olarak sakla)
  const namePhotoUri = await cropRegion(
    uri, // orijinal (daha yüksek çözünürlük) kullan
    AD_SOYAD_CROP.x1, AD_SOYAD_CROP.y1,
    AD_SOYAD_CROP.x2, AD_SOYAD_CROP.y2
  );

  // 3. Kitapçık grubunu oku
  const group = await readGroup(ru, REF_W, REF_H);

  // 4. Cevapları oku
  const answers = await readAnswers(ru, REF_W, REF_H, questionCount);

  return { answers, group, namePhotoUri };
}

// ─── Ad/Soyad bölgesini crop et ───────────────────────────────────────────────
async function cropRegion(
  uri: string,
  nx1: number, ny1: number, nx2: number, ny2: number
): Promise<string | null> {
  try {
    // Orijinal görüntünün boyutunu al
    const info = await ImageManipulator.manipulateAsync(uri, [], { format: ImageManipulator.SaveFormat.JPEG });
    const iw = info.width;
    const ih = info.height;

    const cropX = Math.round(nx1 * iw);
    const cropY = Math.round(ny1 * ih);
    const cropW = Math.round((nx2 - nx1) * iw);
    const cropH = Math.round((ny2 - ny1) * ih);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    );
    return result.uri;
  } catch { return null; }
}

// ─── Grup okuma ───────────────────────────────────────────────────────────────
async function readGroup(uri: string, w: number, h: number): Promise<GroupLabel | null> {
  for (let i = 0; i < KT_YS.length; i++) {
    if (await isFilled(uri, KT_X, KT_YS[i], w, h)) {
      return GROUP_LABELS[i];
    }
  }
  return null;
}

// ─── Cevap okuma ──────────────────────────────────────────────────────────────
async function readAnswers(
  uri: string, w: number, h: number, questionCount: number
): Promise<AnswerChoice[]> {
  const answers: AnswerChoice[] = new Array(questionCount).fill(null);

  for (let q = 1; q <= questionCount; q++) {
    const region = REGIONS.find(r => q >= r.firstQ && q <= r.lastQ);
    if (!region) continue;

    const rowIdx = q - region.firstQ;
    const cy     = region.y0 + rowIdx * region.dy;

    let chosen: AnswerChoice = null;
    let filledCount = 0;

    for (let opt = 0; opt < 5; opt++) {
      if (await isFilled(uri, region.xs[opt], cy, w, h)) {
        chosen = (['A', 'B', 'C', 'D', 'E'] as AnswerChoice[])[opt];
        filledCount++;
      }
    }

    answers[q - 1] = filledCount === 1 ? chosen : null;
  }

  return answers;
}

// ─── Puan hesaplama ───────────────────────────────────────────────────────────
export interface ScoreResult {
  score: number; correct: number; wrong: number; blank: number;
}

export function calculateScore(
  studentAnswers:  AnswerChoice[],
  answerKey:       AnswerChoice[],
  negativeMarking: boolean,
  negativeValue:   number
): ScoreResult {
  let correct = 0, wrong = 0, blank = 0;

  for (let i = 0; i < answerKey.length; i++) {
    const s = studentAnswers[i] ?? null;
    const k = answerKey[i];
    if (s === null)   blank++;
    else if (s === k) correct++;
    else              wrong++;
  }

  const total = answerKey.length;
  const raw   = negativeMarking ? correct - wrong * negativeValue : correct;
  return {
    score:   total > 0 ? Math.round(Math.max(0, (raw / total) * 100) * 100) / 100 : 0,
    correct, wrong, blank,
  };
}
