import React, { useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useStore } from '../store/useStore';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Quiz } from '../types';

type Nav = StackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { quizzes, isLoading, loadQuizzes, deleteQuiz, setActiveQuiz } = useStore();

  useEffect(() => { loadQuizzes(); }, []);

  function handleDelete(quiz: Quiz) {
    Alert.alert('Sil', `"${quiz.title}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteQuiz(quiz.id) },
    ]);
  }

  function handleScan(quiz: Quiz) {
    setActiveQuiz(quiz);
    nav.navigate('Scan', { quizId: quiz.id });
  }

  function handleResults(quiz: Quiz) {
    setActiveQuiz(quiz);
    nav.navigate('Results', { quizId: quiz.id });
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color="#4472C4" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sınavlar</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => nav.navigate('CreateQuiz')}>
          <Text style={styles.addBtnText}>+ Yeni</Text>
        </TouchableOpacity>
      </View>

      {quizzes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>Henüz sınav yok</Text>
          <Text style={styles.emptySubtext}>Yeni sınav oluşturmak için + Yeni'ye basın</Text>
        </View>
      ) : (
        <FlatList
          data={quizzes}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>{item.questionCount} soru</Text>
              </View>
              {item.negativeMarking && (
                <Text style={styles.negTag}>Yanlış kesintili</Text>
              )}
              <Text style={styles.cardDate}>
                {new Date(item.createdAt).toLocaleDateString('tr-TR')}
              </Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.scanBtn} onPress={() => handleScan(item)}>
                  <Text style={styles.scanBtnText}>📷 Tara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resultBtn} onPress={() => handleResults(item)}>
                  <Text style={styles.resultBtnText}>📊 Sonuçlar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#4472C4', paddingHorizontal: 16, paddingVertical: 14,
    paddingTop: 52,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  addBtn: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#4472C4', fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptySubtext: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  cardMeta: { fontSize: 13, color: '#4472C4', fontWeight: '600' },
  negTag: {
    fontSize: 11, color: '#c0392b', backgroundColor: '#fdecea',
    alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6,
    paddingVertical: 2, marginTop: 4,
  },
  cardDate: { fontSize: 12, color: '#aaa', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  scanBtn: {
    flex: 1, backgroundColor: '#4472C4', borderRadius: 8,
    paddingVertical: 9, alignItems: 'center',
  },
  scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  resultBtn: {
    flex: 1, backgroundColor: '#f0f4ff', borderRadius: 8,
    paddingVertical: 9, alignItems: 'center',
    borderWidth: 0.5, borderColor: '#4472C4',
  },
  resultBtnText: { color: '#4472C4', fontWeight: '600', fontSize: 13 },
  deleteBtn: {
    backgroundColor: '#fdecea', borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center',
  },
  deleteBtnText: { fontSize: 16 },
});
