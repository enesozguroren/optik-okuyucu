import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ScanResult, Quiz } from '../types';

export async function exportResultsToExcel(
  quiz: Quiz,
  results: ScanResult[]
): Promise<void> {

  const scores  = results.map(r => r.score);
  const avg     = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest  = scores.length > 0 ? Math.min(...scores) : 0;

  // ─── CSV oluştur ─────────────────────────────────────────────────────────────
  const header = [
    'Sıra', 'Öğrenci No', 'Ad Soyad',
    'Doğru', 'Yanlış', 'Boş', 'Puan',
    ...Array.from({ length: quiz.questionCount }, (_, i) => `S${i + 1}`),
  ].join(',');

  const keyRow = [
    '', '', 'CEVAP ANAHTARI', '', '', '', '',
    ...quiz.answerKey.slice(0, quiz.questionCount).map(a => a ?? ''),
  ].join(',');

  const dataRows = results
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => [
      idx + 1,
      r.studentNumber,
      `"${r.studentName}"`,
      r.correct,
      r.wrong,
      r.blank,
      r.score.toFixed(2),
      ...r.answers.map(a => a ?? ''),
    ].join(','));

  const statsBlock = [
    '',
    '--- İSTATİSTİKLER ---',
    `"Sınav","${quiz.title}"`,
    `"Soru Sayısı",${quiz.questionCount}`,
    `"Öğrenci Sayısı",${results.length}`,
    `"Ortalama",${avg.toFixed(2)}`,
    `"En Yüksek",${highest.toFixed(2)}`,
    `"En Düşük",${lowest.toFixed(2)}`,
    '',
    '"Soru","Yanlış Yapan (%)"',
    ...Array.from({ length: quiz.questionCount }, (_, i) => {
      const wrong = results.filter(
        r => r.answers[i] !== null && r.answers[i] !== quiz.answerKey[i]
      ).length;
      const pct = results.length > 0 ? ((wrong / results.length) * 100).toFixed(1) : '0';
      return `"Soru ${i + 1}","${pct}"`;
    }),
  ].join('\n');

  // UTF-8 BOM ekle (Excel Türkçe karakterleri doğru açsın)
  const csvContent = '\uFEFF' + [header, keyRow, ...dataRows, statsBlock].join('\n');

  // ─── Dosyayı kaydet ve paylaş ─────────────────────────────────────────────
  const fileName = `${quiz.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const fileUri  = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Paylaşım bu cihazda desteklenmiyor');

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: `${quiz.title} - Dışa Aktar`,
  });
}
