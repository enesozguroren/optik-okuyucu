import * as ImageManipulator from 'expo-image-manipulator';
import { AnswerChoice } from '../types';

// ─── Form referans boyutu ─────────────────────────────────────────────────────
const REF_W = 2550;
const REF_H = 3300;

// ─── Cevap bölgesi X sütunları (A,B,C,D,E seçenekleri) ───────────────────────
const B1_XS = [0.281, 0.307, 0.332, 0.358, 0.384]; // Sol blok
const B2_XS = [0.434, 0.463, 0.490, 0.516, 0.543]; // Orta blok
const B3_XS = [0.602, 0.631, 0.659, 0.685, 0.712]; // Sağ blok

// ─── Y grid'leri ─────────────────────────────────────────────────────────────
const UPPER_Y0 = 0.250;  // Üst yarı ilk soru merkezi
const UPPER_DY = 0.0236; // Üst yarı sorular arası
const LOWER_Y0 = 0.539;  // Alt yarı ilk soru merkezi
const LOWER_DY = 0.0239; // Alt yarı sorular arası

// ─── Kitapçık türü (KT) ───────────────────────────────────────────────────────
// KT_YS: A,B,C,D,E satırları (5 seçenek)
const KT_X  = 0.204;
const KT_YS = [0.259, 0.283, 0.308, 0.332, 0.356];

// ─── AD (isim) ve SID (numara) crop koordinatları ────────────────────────────
// Normalize 0–1 değerleri; crop için kullanılır
const AD_CROP  = { yMin: 0.0024, yMax: 0.0545 };                        // tam genişlik
// SID: 4 hane × 10 rakam (0–9), x=[0.281–0.384], y0=0.250 dy=0.0236
const SID_CROP = { xMin: 0.281, xMax: 0.384, yMin: 0.232, yMax: 0.474 };

// ─── 8 Bölge tanımı ──────────────────────────────────────────────────────────
// Her blok üst (10 soru) + alt (10 soru) = 2 bölge
// B1 üst: 1–10, B1 alt: 11–20
// B2 üst: 21–30, B2 alt: 31–40
// B3 üst: 41–50, B3 alt: 51–60
// (questionCount'a göre gerekmeyen bölgeler atlanır)
type Region = {
  firstQ: number;
  lastQ:  number;
  xs:     number[];
  y0:     number;
  dy:     number;
};

function buildRegions(): Region[] {
  return [
    { firstQ:  1, lastQ: 10, xs: B1_XS, y0: UPPER_Y0, dy: UPPER_DY },
    { firstQ: 11, lastQ: 20, xs: B1_XS, y0: LOWER_Y0, dy: LOWER_DY },
    { firstQ: 21, lastQ: 30, xs: B2_XS, y0: UPPER_Y0, dy: UPPER_DY },
    { firstQ: 31, lastQ: 40, xs: B2_XS, y0: LOWER_Y0, dy: LOWER_DY },
    { firstQ: 41, lastQ: 50, xs: B3_XS, y0: UPPER_Y0, dy: UPPER_DY },
    { firstQ: 51, lastQ: 60, xs: B3_XS, y0: LOWER_Y0, dy: LOWER_DY },
  ];
}

const OPTIONS: AnswerChoice[] = ['A', 'B', 'C', 'D', 'E'];

// ─── Eşik ve örnekleme ───────────────────────────────────────────────────────
const FILL_THRESHOLD = 200;
const SAMPLE_RADIUS  = 6;

// ─── Yardımcı: 1×1 JPEG crop ile parlaklık örnekle ───────────────────────────
async function sampleBrightness(
  uri: string,
  cx: number,
  cy: number,
  imgW: number,
  imgH: number
): Promise<number> {
  try {
    const r  = SAMPLE_RADIUS;
    const px = Math.round(cx * imgW);
    const py = Math.round(cy * imgH);

    const x0 = Math.max(0, px - r);
    const y0 = Math.max(0, py - r);
    const cw = Math.min(r * 2, imgW - x0);
    const ch = Math.min(r * 2, imgH - y0);

    const s = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX: x0, originY: y0, width: cw, height: ch } },
        { resize: { width: 1, height: 1 } },
      ],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1, base64: true }
    );

    if (!s.base64) return 255;
    return jpegBase64ToBrightness(s.base64);
  } catch {
    return 255;
  }
}

// 1×1 JPEG base64 uzunluğundan parlaklık tahmini
function jpegBase64ToBrightness(b64: string): number {
  const dark = 380, light = 700;
  const clamped = Math.max(dark, Math.min(light, b64.length));
  return Math.round(((clamped - dark) / (light - dark)) * 255);
}

async function isFilled(
  uri: string, cx: number, cy: number, imgW: number, imgH: number
): Promise<boolean> {
  const b = await sampleBrightness(uri, cx, cy, imgW, imgH);
  return b < FILL_THRESHOLD;
}

// ─── Kitapçık türü okuma ─────────────────────────────────────────────────────
async function readBookletType(uri: string, w: number, h: number): Promise<AnswerChoice> {
  for (let i = 0; i < KT_YS.length; i++) {
    if (await isFilled(uri, KT_X, KT_YS[i], w, h)) {
      return OPTIONS[i];
    }
  }
  return null;
}

// ─── AD crop (isim alanı) ────────────────────────────────────────────────────
async function cropAdArea(uri: string, w: number, h: number): Promise<string | null> {
  try {
    const originY = Math.round(AD_CROP.yMin * h);
    const height  = Math.round((AD_CROP.yMax - AD_CROP.yMin) * h);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX: 0, originY, width: w, height } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    );
    return result.uri;
  } catch {
    return null;
  }
}

// ─── SID crop (numara alanı) ─────────────────────────────────────────────────
async function cropSidArea(uri: string, w: number, h: number): Promise<string | null> {
  try {
    const originX = Math.round(SID_CROP.xMin * w);
    const originY = Math.round(SID_CROP.yMin * h);
    const width   = Math.round((SID_CROP.xMax - SID_CROP.xMin) * w);
    const height  = Math.round((SID_CROP.yMax - SID_CROP.yMin) * h);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX, originY, width, height } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    );
    return result.uri;
  } catch {
    return null;
  }
}

// ─── Cevap okuma ─────────────────────────────────────────────────────────────
async function readAnswers(
  uri: string, w: number, h: number, questionCount: number
): Promise<AnswerChoice[]> {
  const answers: AnswerChoice[] = new Array(questionCount).fill(null);
  const regions = buildRegions();

  for (let q = 1; q <= questionCount; q++) {
    const region = regions.find(r => q >= r.firstQ && q <= r.lastQ);
    if (!region) continue;

    const rowIdx = q - region.firstQ;
    const cy     = region.y0 + rowIdx * region.dy;

    let chosen: AnswerChoice = null;
    let filledCount = 0;

    for (let opt = 0; opt < OPTIONS.length; opt++) {
      if (await isFilled(uri, region.xs[opt], cy, w, h)) {
        chosen = OPTIONS[opt];
        filledCount++;
      }
    } 

    // Birden fazla işaretliyse geçersiz
    answers[q - 1] = filledCount === 1 ? chosen : null;
  }

  return answers;
}

// ─── Ana export ───────────────────────────────────────────────────────────────
export interface ProcessedForm {
  answers:      AnswerChoice[];
  bookletType:  AnswerChoice;   // A/B/C/D/E kitapçık türü
  adCropUri:    string | null;  // İsim alanı kırpılmış görsel URI
  sidCropUri:   string | null;  // Numara alanı kırpılmış görsel URI
}

export async function processFormImage(
  uri: string,
  questionCount: number
): Promise<ProcessedForm> {
  // Görüntüyü referans boyutuna getir
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: REF_W, height: REF_H } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
  );

  const ru = resized.uri;

  const [answers, bookletType, adCropUri, sidCropUri] = await Promise.all([
    readAnswers(ru, REF_W, REF_H, questionCount),
    readBookletType(ru, REF_W, REF_H),
    cropAdArea(ru, REF_W, REF_H),
    cropSidArea(ru, REF_W, REF_H),
  ]);

  return { answers, bookletType, adCropUri, sidCropUri };
}

// ─── Puan hesaplama ───────────────────────────────────────────────────────────
export interface ScoreResult {
  score:   number;
  correct: number;
  wrong:   number;
  blank:   number;
}

export function calculateScore(
  studentAnswers: AnswerChoice[],
  answerKey:      AnswerChoice[],
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
  const score = total > 0 ? Math.max(0, (raw / total) * 100) : 0;

  return { score: Math.round(score * 100) / 100, correct, wrong, blank };
}

// ─── Koordinat sabitleri (test/debug için export) ─────────────────────────────
export const SCANNER_COORDS = {
  B1_XS, B2_XS, B3_XS,
  UPPER_Y0, UPPER_DY,
  LOWER_Y0, LOWER_DY,
  KT_X, KT_YS,
  AD_CROP, SID_CROP,
};