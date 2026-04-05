import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, Modal,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useStore } from '../store/useStore';
import { exportResultsToExcel } from '../services/exporter';
import { GroupLabel } from '../types';

type ResultsRoute = RouteProp<RootStackParamList, 'Results'>;

const GROUP_COLORS: Record<string, string> = {
  A: '#4472C4', B: '#27ae60', C: '#e67e22', D: '#8e44ad', E: '#c0392b',
};
const GROUP_BG: Record<string, string> = {
  A: '#e8f0fe', B: '#e8f8ef', C: '#fef3e8', D: '#f3e8fe', E: '#fee8e8',
};

export default function ResultsScreen() {
  const route  = useRoute<ResultsRoute>();
  const { quizId } = route.params;
  const { results, activeQuiz, isLoading, loadResults, deleteResult } = useStore();

  const [exporting,  setExporting]  = useState(false);
  const [filterGroup, setFilterGroup] = useState<GroupLabel | 'ALL'>('ALL');
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  useEffect(() => { loadResults(quizId); }, []);

  const scores  = results.map(r => r.score);
  const avg     = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highest = scores.length > 0 ? Math.max(...scores) : 0;
  const lowest  = scores.length > 0 ? Math.min(...scores) : 0;

  // Grup filtreleme
  const filtered = filterGroup === 'ALL'
    ? results
    : results.filter(r => r.group === filterGroup);

  // Mevcut gruplar
  const presentGroups = [...new Set(results.map(r => r.group).filter(Boolean))] as GroupLabel[];
  const showGroupFilter = activeQuiz && activeQuiz.groupCount > 1 && presentGroups.length > 0;

  async function handleExport() {
    if (!activeQuiz) return;
    setExporting(true);
    try { await exportResultsToExcel(activeQuiz, results); }
    catch (e: any) { Alert.alert('Hata', e.message); }
    finally { setExporting(false); }
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color="#4472C4" />;

  return (
    <View style={styles.container}>
      {/* İstatistik kartları */}
      <View style={styles.statsRow}>
        {[
          { label: 'Öğrenci', value: results.length, color: '#1a1a1a' },
          { label: 'Ortalama', value: avg.toFixed(1),     color: '#4472C4' },
          { label: 'En Yüksek', value: highest.toFixed(1), color: '#27ae60' },
          { label: 'En Düşük',  value: lowest.toFixed(1),  color: '#e74c3c' },
        ].map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Grup filtresi */}
      {showGroupFilter && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filterGroup === 'ALL' && styles.filterBtnActive]}
            onPress={() => setFilterGroup('ALL')}
          >
            <Text style={[styles.filterText, filterGroup === 'ALL' && styles.filterTextActive]}>
              Tümü
            </Text>
          </TouchableOpacity>
          {presentGroups.map(g => (
            <TouchableOpacity
              key={g}
              style={[
                styles.filterBtn,
                filterGroup === g && { backgroundColor: GROUP_COLORS[g], borderColor: GROUP_COLORS[g] },
              ]}
              onPress={() => setFilterGroup(g)}
            >
              <Text style={[
                styles.filterText,
                filterGroup === g && { color: '#fff' },
                filterGroup !== g && { color: GROUP_COLORS[g] },
              ]}>
                Grup {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Export butonu */}
      {results.length > 0 && (
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.exportBtnText}>📤 CSV'ye Aktar</Text>}
        </TouchableOpacity>
      )}

      {/* Liste */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>
            {results.length === 0 ? 'Henüz tarama yok' : 'Bu grupta sonuç yok'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...filtered].sort((a, b) => b.score - a.score)}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item, index }) => (
            <View style={styles.resultCard}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>

              <View style={styles.resultInfo}>
                {/* Ad fotoğrafı — tıklanınca büyür */}
                {item.namePhotoUri ? (
                  <TouchableOpacity onPress={() => setPhotoModal(item.namePhotoUri)}>
                    <Image
                      source={{ uri: item.namePhotoUri }}
                      style={styles.nameThumb}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.resultName}>{item.studentName || '—'}</Text>
                )}
                <Text style={styles.resultNum}>No: {item.studentNumber}</Text>
                <View style={styles.resultStats}>
                  <Text style={styles.dStats}>D:{item.correct}</Text>
                  <Text style={styles.yStats}>Y:{item.wrong}</Text>
                  <Text style={styles.bStats}>B:{item.blank}</Text>
                  {item.group && (
                    <View style={[styles.groupMini, { backgroundColor: GROUP_BG[item.group] }]}>
                      <Text style={[styles.groupMiniText, { color: GROUP_COLORS[item.group] }]}>
                        {item.group}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={[styles.scoreBox, item.group && { backgroundColor: GROUP_COLORS[item.group] }]}>
                <Text style={styles.scoreText}>{item.score.toFixed(1)}</Text>
              </View>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => Alert.alert('Sil', 'Bu sonuç silinsin mi?', [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: () => deleteResult(item.id) },
                ])}
              >
                <Text style={{ color: '#e74c3c', fontSize: 18 }}>×</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Ad fotoğrafı büyütme modal */}
      <Modal visible={!!photoModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.photoModalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoModal(null)}
        >
          {photoModal && (
            <Image
              source={{ uri: photoModal }}
              style={styles.photoModalImg}
              resizeMode="contain"
            />
          )}
          <Text style={styles.photoModalHint}>Kapatmak için dokun</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f5f5f5' },
  statsRow:      { flexDirection:'row', padding:10, gap:6, backgroundColor:'#fff', borderBottomWidth:0.5, borderColor:'#e0e0e0' },
  statCard:      { flex:1, alignItems:'center', backgroundColor:'#f8f9ff', borderRadius:10, paddingVertical:10 },
  statValue:     { fontSize:18, fontWeight:'700', color:'#1a1a1a' },
  statLabel:     { fontSize:10, color:'#888', marginTop:2 },

  filterRow:     { flexDirection:'row', paddingHorizontal:12, paddingVertical:8, gap:8, flexWrap:'wrap', backgroundColor:'#fff', borderBottomWidth:0.5, borderColor:'#e0e0e0' },
  filterBtn:     { paddingHorizontal:14, paddingVertical:6, borderRadius:16, borderWidth:1.5, borderColor:'#ccc' },
  filterBtnActive:{ backgroundColor:'#4472C4', borderColor:'#4472C4' },
  filterText:    { fontSize:12, fontWeight:'600', color:'#555' },
  filterTextActive:{ color:'#fff' },

  exportBtn:     { backgroundColor:'#27ae60', margin:12, borderRadius:10, paddingVertical:13, alignItems:'center' },
  exportBtnText: { color:'#fff', fontWeight:'700', fontSize:15 },

  empty:         { flex:1, justifyContent:'center', alignItems:'center', gap:8 },
  emptyIcon:     { fontSize:48 },
  emptyText:     { fontSize:16, color:'#888' },

  resultCard:    { backgroundColor:'#fff', borderRadius:10, padding:12, flexDirection:'row', alignItems:'center', gap:10, borderWidth:0.5, borderColor:'#e0e0e0' },
  rankBadge:     { width:28, height:28, borderRadius:14, backgroundColor:'#e8f0fe', justifyContent:'center', alignItems:'center' },
  rankText:      { fontSize:12, fontWeight:'700', color:'#4472C4' },
  resultInfo:    { flex:1 },
  nameThumb:     { width:'100%', height:28, borderRadius:4, backgroundColor:'#f5f5f5', marginBottom:2 },
  resultName:    { fontSize:14, fontWeight:'600', color:'#1a1a1a' },
  resultNum:     { fontSize:12, color:'#888' },
  resultStats:   { flexDirection:'row', gap:8, marginTop:4, alignItems:'center' },
  dStats:        { fontSize:12, color:'#27ae60', fontWeight:'600' },
  yStats:        { fontSize:12, color:'#e74c3c', fontWeight:'600' },
  bStats:        { fontSize:12, color:'#888',    fontWeight:'600' },
  groupMini:     { borderRadius:6, paddingHorizontal:6, paddingVertical:2 },
  groupMiniText: { fontSize:11, fontWeight:'700' },
  scoreBox:      { backgroundColor:'#4472C4', borderRadius:8, paddingHorizontal:12, paddingVertical:8 },
  scoreText:     { color:'#fff', fontWeight:'700', fontSize:18 },
  deleteBtn:     { padding:4 },

  photoModalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center', padding:24 },
  photoModalImg:     { width:'100%', height:120, borderRadius:8 },
  photoModalHint:    { color:'rgba(255,255,255,0.5)', fontSize:13, marginTop:16 },
});
