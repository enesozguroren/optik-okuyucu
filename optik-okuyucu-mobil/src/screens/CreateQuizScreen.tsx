import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { AnswerChoice, GroupLabel, ALL_GROUPS, emptyAnswerKeys } from '../types';

const OPTIONS: AnswerChoice[] = ['A', 'B', 'C', 'D', 'E'];
const GROUP_COLORS: Record<GroupLabel, string> = {
  A: '#4472C4', B: '#27ae60', C: '#e67e22', D: '#8e44ad', E: '#c0392b',
};
const GROUP_BG: Record<GroupLabel, string> = {
  A: '#e8f0fe', B: '#e8f8ef', C: '#fef3e8', D: '#f3e8fe', E: '#fee8e8',
};

export default function CreateQuizScreen() {
  const nav = useNavigation();
  const { addQuiz } = useStore();

  const [title,           setTitle]           = useState('');
  const [questionCount,   setQuestionCount]   = useState('10');
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [negativeValue,   setNegativeValue]   = useState('0.25');
  const [groupCount,      setGroupCount]      = useState(1);
  const [activeGroup,     setActiveGroup]     = useState<GroupLabel>('A');
  const [answerKeys,      setAnswerKeys]      = useState<Record<GroupLabel, AnswerChoice[]>>(
    emptyAnswerKeys(50)
  );

  const count = Math.min(50, Math.max(1, parseInt(questionCount) || 0));
  const activeGroups = ALL_GROUPS.slice(0, groupCount);

  // Cevap seç
  const selectAnswer = useCallback((group: GroupLabel, qIndex: number, choice: AnswerChoice) => {
    setAnswerKeys(prev => {
      const next = { ...prev, [group]: [...prev[group]] };
      next[group][qIndex] = next[group][qIndex] === choice ? null : choice;
      return next;
    });
  }, []);

  // Grup sayısı değişince aktif grubu sıfırla
  function handleGroupCountChange(n: number) {
    setGroupCount(n);
    setActiveGroup('A');
    // Yeni grup sayısından fazla grupları temizle
    setAnswerKeys(prev => {
      const next = { ...prev };
      ALL_GROUPS.forEach((g, i) => { if (i >= n) next[g] = Array(50).fill(null); });
      return next;
    });
  }

  async function handleSave() {
  try {
    if (!title.trim()) {
      Alert.alert('Hata', 'Sınav başlığı giriniz');
      return;
    }

    if (count < 1) {
      Alert.alert('Hata', 'Soru sayısı en az 1 olmalı');
      return;
    }

    const finalKeys = { ...emptyAnswerKeys(count) };
    activeGroups.forEach(g => {
      finalKeys[g] = answerKeys[g].slice(0, count);
    });

    await addQuiz(
      title.trim(),
      count,
      finalKeys,
      groupCount,
      negativeMarking,
      parseFloat(negativeValue) || 0
    );

    Alert.alert('Başarılı', 'Sınav oluşturuldu');
    nav.goBack();
  } catch (e: any) {
    Alert.alert('Kayıt Hatası', e.message || 'Sınav kaydedilemedi');
  }
}

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

      {/* Sınav Başlığı */}
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

      {/* Soru Sayısı */}
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

      {/* Yanlış Kesinti */}
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
          <View style={[styles.row, { marginTop: 10 }]}>
            <Text style={styles.sublabel}>Her yanlış için düşülecek puan:</Text>
            <TextInput
              style={[styles.input, { width: 80, marginBottom: 0 }]}
              keyboardType="decimal-pad"
              value={negativeValue}
              onChangeText={setNegativeValue}
            />
          </View>
        )}
      </View>

      {/* ── Grup Sayısı ── */}
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.label}>Grup / Kitapçık</Text>
          <Switch
            value={groupCount > 1}
            onValueChange={v => handleGroupCountChange(v ? 2 : 1)}
            trackColor={{ true: '#4472C4' }}
          />
        </View>

        {groupCount > 1 && (
          <>
            <Text style={styles.sublabel}>Grup sayısı (maks 5)</Text>
            <View style={styles.groupCountRow}>
              {[2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.groupCountBtn, groupCount === n && styles.groupCountBtnActive]}
                  onPress={() => handleGroupCountChange(n)}
                >
                  <Text style={[
                    styles.groupCountText,
                    groupCount === n && styles.groupCountTextActive,
                  ]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Grup seçici tab'ları */}
            <View style={styles.groupTabs}>
              {activeGroups.map(g => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.groupTab,
                    { borderColor: GROUP_COLORS[g] },
                    activeGroup === g && { backgroundColor: GROUP_COLORS[g] },
                  ]}
                  onPress={() => setActiveGroup(g)}
                >
                  <Text style={[
                    styles.groupTabText,
                    { color: activeGroup === g ? '#fff' : GROUP_COLORS[g] },
                  ]}>
                    Grup {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Cevap Anahtarı ── */}
      <View style={[styles.section, groupCount > 1 && { borderLeftWidth: 4, borderLeftColor: GROUP_COLORS[activeGroup] }]}>
        <View style={styles.row}>
          <Text style={styles.label}>Cevap Anahtarı</Text>
          {groupCount > 1 && (
            <View style={[styles.groupBadge, { backgroundColor: GROUP_BG[activeGroup] }]}>
              <Text style={[styles.groupBadgeText, { color: GROUP_COLORS[activeGroup] }]}>
                Grup {activeGroup}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.sublabel}>
          {groupCount > 1
            ? `Grup ${activeGroup} için doğru cevapları seçin`
            : 'Her soru için doğru cevabı seçin'}
        </Text>

        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.questionRow}>
            <Text style={styles.qNum}>{i + 1}</Text>
            <View style={styles.optionsRow}>
              {OPTIONS.map(opt => {
                const selected = answerKeys[activeGroup][i] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.optBtn,
                      selected && { backgroundColor: GROUP_COLORS[activeGroup], borderColor: GROUP_COLORS[activeGroup] },
                    ]}
                    onPress={() => selectAnswer(activeGroup, i, opt)}
                  >
                    <Text style={[styles.optText, selected && styles.optTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {/* Tüm grupları doldur yardımcısı */}
      {groupCount > 1 && (
        <View style={styles.groupHelperCard}>
          <Text style={styles.groupHelperTitle}>Grup özeti</Text>
          <View style={styles.groupHelperRow}>
            {activeGroups.map(g => {
              const filled = answerKeys[g].slice(0, count).filter(a => a !== null).length;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.groupSummaryItem, { backgroundColor: GROUP_BG[g] }]}
                  onPress={() => setActiveGroup(g)}
                >
                  <Text style={[styles.groupSummaryLabel, { color: GROUP_COLORS[g] }]}>
                    Grup {g}
                  </Text>
                  <Text style={[styles.groupSummaryCount, { color: GROUP_COLORS[g] }]}>
                    {filled}/{count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Sınavı Kaydet</Text>
      </TouchableOpacity>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f5' },

  section: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, padding: 16,
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  label:    { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 10 },
  sublabel: { fontSize: 13, color: '#888', marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    backgroundColor: '#fafafa', color: '#1a1a1a', marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Grup sayısı seçici
  groupCountRow: { flexDirection: 'row', gap: 10, marginBottom: 14, marginTop: 4 },
  groupCountBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  groupCountBtnActive: { backgroundColor: '#4472C4', borderColor: '#4472C4' },
  groupCountText:      { fontSize: 16, fontWeight: '600', color: '#555' },
  groupCountTextActive:{ color: '#fff' },

  // Grup tab'ları
  groupTabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  groupTab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
  },
  groupTabText: { fontSize: 13, fontWeight: '700' },

  // Cevap anahtarı
  groupBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12,
  },
  groupBadgeText: { fontSize: 12, fontWeight: '700' },

  questionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  qNum:        { width: 32, fontSize: 14, fontWeight: '600', color: '#555' },
  optionsRow:  { flexDirection: 'row', gap: 8 },
  optBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  optText:         { fontSize: 14, fontWeight: '600', color: '#555' },
  optTextSelected: { color: '#fff' },

  // Grup özet
  groupHelperCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  groupHelperTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 10 },
  groupHelperRow:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  groupSummaryItem: {
    flex: 1, minWidth: 60, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  groupSummaryLabel: { fontSize: 12, fontWeight: '700' },
  groupSummaryCount: { fontSize: 18, fontWeight: '700', marginTop: 2 },

  saveBtn: {
    backgroundColor: '#4472C4', marginHorizontal: 16, marginTop: 20,
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
