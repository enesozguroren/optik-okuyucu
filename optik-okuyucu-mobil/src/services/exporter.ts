import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ScanResult, Quiz, ALL_GROUPS } from '../types';

export async function exportResultsToExcel(
  quiz: Quiz,
  results: ScanResult[]
): Promise<void> {
  const scores  = results.map(r => r.score);
  const avg     = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest  = scores.length > 0 ? Math.min(...scores) : 0;

  const hasGroups = quiz.groupCount > 1;

  // ─── Başlık satırı ─────────────────────────────────────────────────────────
  const headers = [
    'Sıra', 'Öğrenci No', 'Ad Soyad',
    ...(hasGroups ? ['Grup'] : []),
    'Doğru', 'Yanlış', 'Boş', 'Puan',
    ...Array.from({ length: quiz.questionCount }, (_, i) => `S${i + 1}`),
  ].join(',');

  // ─── Cevap anahtarı satırları ───────────────────────────────────────────────
  const keyRows: string[] = [];
  if (hasGroups) {
    // Her grup için ayrı satır
    ALL_GROUPS.slice(0, quiz.groupCount).forEach(g => {
      const key = quiz.answerKeys[g] ?? [];
      keyRows.push([
        '', '', `CEVAP ANAHTARI - Grup ${g}`,
        g, '', '', '', '',
        ...key.slice(0, quiz.questionCount).map(a => a ?? ''),
      ].join(','));
    });
  } else {
    const key = quiz.answerKeys['A'] ?? [];
    keyRows.push([
      '', '', 'CEVAP ANAHTARI',
      '', '', '', '',
      ...key.slice(0, quiz.questionCount).map(a => a ?? ''),
    ].join(','));
  }

  // ─── Veri satırları ─────────────────────────────────────────────────────────
  const dataRows = [...results]
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => [
      idx + 1,
      r.studentNumber,
      `"${r.studentName}"`,
      ...(hasGroups ? [r.group ?? '?'] : []),
      r.correct,
      r.wrong,
      r.blank,
      r.score.toFixed(2),
      ...r.answers.map(a => a ?? ''),
    ].join(','));

  // ─── İstatistik bloğu ───────────────────────────────────────────────────────
  const statsLines = [
    '',
    '--- İSTATİSTİKLER ---',
    `"Sınav","${quiz.title}"`,
    `"Soru Sayısı",${quiz.questionCount}`,
    `"Grup Sayısı",${quiz.groupCount}`,
    `"Öğrenci Sayısı",${results.length}`,
    `"Ortalama",${avg.toFixed(2)}`,
    `"En Yüksek",${highest.toFixed(2)}`,
    `"En Düşük",${lowest.toFixed(2)}`,
    '',
  ];

  // Grup bazlı istatistik
  if (hasGroups) {
    ALL_GROUPS.slice(0, quiz.groupCount).forEach(g => {
      const gResults = results.filter(r => r.group === g);
      if (gResults.length === 0) return;
      const gScores = gResults.map(r => r.score);
      const gAvg = gScores.reduce((a, b) => a + b, 0) / gScores.length;
      statsLines.push(`"Grup ${g} Ortalama",${gAvg.toFixed(2)}`);
      statsLines.push(`"Grup ${g} Öğrenci",${gResults.length}`);
    });
    statsLines.push('');
  }

  // Soru bazlı hata analizi
  statsLines.push('"Soru","Yanlış Yapan (%)"');
  for (let i = 0; i < quiz.questionCount; i++) {
    const wrongCount = results.filter(r => {
      const key = hasGroups && r.group
        ? (quiz.answerKeys[r.group]?.[i] ?? null)
        : (quiz.answerKeys['A']?.[i] ?? null);
      return r.answers[i] !== null && r.answers[i] !== key;
    }).length;
    const pct = results.length > 0
      ? ((wrongCount / results.length) * 100).toFixed(1)
      : '0';
    statsLines.push(`"Soru ${i + 1}","${pct}"`);
  }

  // ─── CSV birleştir ve kaydet ─────────────────────────────────────────────────
  const csvContent = '\uFEFF' + [headers, ...keyRows, ...dataRows, ...statsLines].join('\n');

  const fileName = `${quiz.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  const fileUri  = FileSystem.documentDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Paylaşım bu cihazda desteklenmiyor');

  await Sharing.shareAsync(fileUri, {
    mimeType:    'text/csv',
    dialogTitle: `${quiz.title} - Dışa Aktar`,
  });
}
