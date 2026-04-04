import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useStore } from '../store/useStore';
import { exportResultsToExcel } from '../services/exporter';

type ResultsRoute = RouteProp<RootStackParamList, 'Results'>;

export default function ResultsScreen() {
  const route = useRoute<ResultsRoute>();
  const { quizId } = route.params;
  const { results, activeQuiz, isLoading, loadResults, deleteResult } = useStore();
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadResults(quizId); }, []);

  const scores = results.map(r => r.score);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest = scores.length > 0 ? Math.min(...scores) : 0;

  async function handleExport() {
    if (!activeQuiz) return;
    setExporting(true);
    try {
      await exportResultsToExcel(activeQuiz, results);
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color="#4472C4" />;

  return (
    <View style={styles.container}>
      {/* İstatistik kartları */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{results.length}</Text>
          <Text style={styles.statLabel}>Öğrenci</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#4472C4' }]}>{avg.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Ortalama</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#27ae60' }]}>{highest.toFixed(1)}</Text>
          <Text style={styles.statLabel}>En Yüksek</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#e74c3c' }]}>{lowest.toFixed(1)}</Text>
          <Text style={styles.statLabel}>En Düşük</Text>
        </View>
      </View>

      {/* Excel export butonu */}
      {results.length > 0 && (
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.exportBtnText}>📤 Excel'e Aktar</Text>}
        </TouchableOpacity>
      )}

      {/* Sonuç listesi */}
      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>Henüz tarama yok</Text>
          <Text style={styles.emptySubtext}>Geri dönüp optik tarabilirsiniz</Text>
        </View>
      ) : (
        <FlatList
          data={[...results].sort((a, b) => b.score - a.score)}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item, index }) => (
            <View style={styles.resultCard}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.studentName}</Text>
                <Text style={styles.resultNum}>No: {item.studentNumber}</Text>
                <View style={styles.resultStats}>
                  <Text style={styles.dStats}>D: {item.correct}</Text>
                  <Text style={styles.yStats}>Y: {item.wrong}</Text>
                  <Text style={styles.bStats}>B: {item.blank}</Text>
                </View>
              </View>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreText}>{item.score.toFixed(1)}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => Alert.alert('Sil', 'Bu sonuç silinsin mi?', [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: () => deleteResult(item.id) },
                ])}
              >
                <Text style={{ color: '#e74c3c', fontSize: 16 }}>×</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  statsRow: {
    flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderColor: '#e0e0e0',
  },
  statCard: {
    flex: 1, alignItems: 'center', backgroundColor: '#f8f9ff',
    borderRadius: 10, paddingVertical: 12,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  exportBtn: {
    backgroundColor: '#27ae60', margin: 16, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptySubtext: { fontSize: 14, color: '#888' },
  resultCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#e8f0fe',
    justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '700', color: '#4472C4' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  resultNum: { fontSize: 12, color: '#888' },
  resultStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dStats: { fontSize: 12, color: '#27ae60', fontWeight: '600' },
  yStats: { fontSize: 12, color: '#e74c3c', fontWeight: '600' },
  bStats: { fontSize: 12, color: '#888', fontWeight: '600' },
  scoreBox: {
    backgroundColor: '#4472C4', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  scoreText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  deleteBtn: { padding: 4 },
});
