import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { AnswerChoice } from '../types';

const OPTIONS: AnswerChoice[] = ['A', 'B', 'C', 'D', 'E'];

export default function CreateQuizScreen() {
  const nav = useNavigation();
  const { addQuiz } = useStore();

  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState('10');
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [negativeValue, setNegativeValue] = useState('0.25');
  const [answerKey, setAnswerKey] = useState<AnswerChoice[]>(
    Array(50).fill(null)
  );

  const count = Math.min(50, Math.max(1, parseInt(questionCount) || 0));

  function selectAnswer(qIndex: number, choice: AnswerChoice) {
    setAnswerKey(prev => {
      const next = [...prev];
      next[qIndex] = next[qIndex] === choice ? null : choice;
      return next;
    });
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Hata', 'Sınav başlığı giriniz');
      return;
    }
    if (count < 1) {
      Alert.alert('Hata', 'Soru sayısı en az 1 olmalı');
      return;
    }
    const key = answerKey.slice(0, count);
    await addQuiz(
      title.trim(),
      count,
      key,
      negativeMarking,
      parseFloat(negativeValue) || 0
    );
    nav.goBack();
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.label}>Sınav Başlığı</Text>
        <TextInput
          style={styles.input}
          placeholder="örn. 10-A Matematik Sınavı"
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#bbb"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Soru Sayısı (maks 50)</Text>
        <TextInput
          style={[styles.input, { width: 100 }]}
          keyboardType="number-pad"
          value={questionCount}
          onChangeText={setQuestionCount}
          maxLength={2}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>Yanlış Kesinti</Text>
          <Switch
            value={negativeMarking}
            onValueChange={setNegativeMarking}
            trackColor={{ true: '#4472C4' }}
          />
        </View>
        {negativeMarking && (
          <View style={[styles.row, { marginTop: 8 }]}>
            <Text style={styles.sublabel}>Her yanlış için düşülecek:</Text>
            <TextInput
              style={[styles.input, { width: 80, marginBottom: 0 }]}
              keyboardType="decimal-pad"
              value={negativeValue}
              onChangeText={setNegativeValue}
            />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Cevap Anahtarı</Text>
        <Text style={styles.sublabel}>Her soru için doğru cevabı seçin</Text>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.questionRow}>
            <Text style={styles.qNum}>{i + 1}</Text>
            <View style={styles.options}>
              {OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.optBtn,
                    answerKey[i] === opt && styles.optBtnSelected,
                  ]}
                  onPress={() => selectAnswer(i, opt)}
                >
                  <Text style={[
                    styles.optText,
                    answerKey[i] === opt && styles.optTextSelected,
                  ]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Sınavı Kaydet</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  section: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  label: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 10 },
  sublabel: { fontSize: 13, color: '#888', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    backgroundColor: '#fafafa', color: '#1a1a1a', marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  qNum: { width: 30, fontSize: 14, fontWeight: '600', color: '#555' },
  options: { flexDirection: 'row', gap: 8 },
  optBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  optBtnSelected: { backgroundColor: '#4472C4', borderColor: '#4472C4' },
  optText: { fontSize: 14, fontWeight: '600', color: '#555' },
  optTextSelected: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#4472C4', marginHorizontal: 16, marginTop: 24,
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
