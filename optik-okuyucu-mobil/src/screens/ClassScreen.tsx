import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';

export default function ClassScreen() {
  const {
    classes, students, isLoading,
    loadClasses, loadStudents,
    addClass, addStudent,
    deleteClass, deleteStudent,
    activeClass, setActiveClass,
  } = useStore();

  const [classModal,   setClassModal]   = useState(false);
  const [studentModal, setStudentModal] = useState(false);
  const [className,    setClassName]    = useState('');
  const [classGrade,   setClassGrade]   = useState('');
  const [studentName,  setStudentName]  = useState('');
  const [studentNo,    setStudentNo]    = useState('');
  const [importing,    setImporting]    = useState(false);

  useEffect(() => { loadClasses(); }, []);

  async function handleAddClass() {
    if (!className.trim()) return;
    await addClass(className.trim(), classGrade.trim());
    setClassName(''); setClassGrade('');
    setClassModal(false);
  }

  async function handleAddStudent() {
    if (!studentName.trim() || !studentNo.trim() || !activeClass) return;
    await addStudent(activeClass.id, studentName.trim(), studentNo.trim());
    setStudentName(''); setStudentNo('');
    setStudentModal(false);
  }

  function handleSelectClass(cls: typeof classes[0]) {
    setActiveClass(cls);
    loadStudents(cls.id);
  }

  // ─── CSV / Excel import ───────────────────────────────────────────────────
  // Beklenen format: her satır "Ad Soyad,Numara" veya "Numara,Ad Soyad"
  // Numara sadece rakamlardan oluşan sütun, ad ise diğeri
  async function handleImportCSV() {
    if (!activeClass) {
      Alert.alert('Önce sınıf seçin');
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;

      setImporting(true);
      const fileUri = res.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // CSV parse
      const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      let added = 0;
      let skipped = 0;

      for (const line of lines) {
        // Virgül veya noktalı virgül ayırıcı
        const parts = line.split(/[,;]/).map(p => p.replace(/"/g, '').trim());
        if (parts.length < 2) { skipped++; continue; }

        // Numara olan sütunu bul (sadece rakam)
        let name = '', number = '';
        for (const p of parts) {
          if (/^\d+$/.test(p) && p.length >= 3) {
            number = p.slice(0, 5); // en fazla 5 hane
          } else if (p.length > 1 && !/^\d+$/.test(p)) {
            name = p;
          }
        }

        if (!name || !number) { skipped++; continue; }

        await addStudent(activeClass.id, name, number);
        added++;
      }

      Alert.alert(
        'İçe Aktarma Tamamlandı',
        `${added} öğrenci eklendi${skipped > 0 ? `, ${skipped} satır atlandı` : ''}.`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Dosya okunamadı. CSV formatını kontrol edin.');
    } finally {
      setImporting(false);
    }
  }

  if (isLoading || importing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#4472C4" />
        {importing && <Text style={{ marginTop: 8, color: '#888' }}>İçe aktarılıyor...</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sınıflar</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setClassModal(true)}>
          <Text style={styles.addBtnText}>+ Sınıf</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Sol: sınıf listesi */}
        <View style={styles.classList}>
          {classes.length === 0 && (
            <Text style={[styles.emptyText, { padding: 12, fontSize: 12 }]}>
              Sınıf yok
            </Text>
          )}
          {classes.map(cls => (
            <TouchableOpacity
              key={cls.id}
              style={[styles.classItem, activeClass?.id === cls.id && styles.classItemActive]}
              onPress={() => handleSelectClass(cls)}
              onLongPress={() => Alert.alert('Sil', `"${cls.name}" silinsin mi?`, [
                { text: 'İptal', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: () => deleteClass(cls.id) },
              ])}
            >
              <Text style={[styles.classItemText, activeClass?.id === cls.id && styles.classItemTextActive]}>
                {cls.name}
              </Text>
              {cls.grade ? <Text style={styles.classGrade}>{cls.grade}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* Sağ: öğrenci listesi */}
        <View style={styles.studentList}>
          {activeClass ? (
            <>
              <View style={styles.studentHeader}>
                <Text style={styles.studentTitle}>{activeClass.name}</Text>
                <View style={styles.studentHeaderBtns}>
                  <TouchableOpacity
                    style={styles.importBtn}
                    onPress={handleImportCSV}
                  >
                    <Text style={styles.importBtnText}>📂 CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStudentModal(true)}>
                    <Text style={styles.addStudentBtn}>+ Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* CSV format ipucu */}
              <Text style={styles.csvHint}>
                CSV format: Ad Soyad, Numara (her satır bir öğrenci)
              </Text>

              <FlatList
                data={students}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <View style={styles.studentItem}>
                    <View>
                      <Text style={styles.studentName}>{item.name}</Text>
                      <Text style={styles.studentNum}>{item.studentNumber}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteStudent(item.id)}>
                      <Text style={{ color: '#e74c3c', fontSize: 20 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Öğrenci yok{'\n'}+ Ekle veya 📂 CSV ile aktar</Text>
                }
              />
            </>
          ) : (
            <Text style={styles.emptyText}>Sol taraftan sınıf seçin</Text>
          )}
        </View>
      </View>

      {/* Sınıf ekleme modal */}
      <Modal visible={classModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Yeni Sınıf</Text>
            <TextInput style={styles.input} placeholder="Sınıf adı (örn. 10-A)" value={className} onChangeText={setClassName} />
            <TextInput style={styles.input} placeholder="Şube / Seviye (isteğe bağlı)" value={classGrade} onChangeText={setClassGrade} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setClassModal(false)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAddClass}>
                <Text style={styles.confirmBtnText}>Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Öğrenci ekleme modal */}
      <Modal visible={studentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Yeni Öğrenci</Text>
            <TextInput style={styles.input} placeholder="Ad Soyad" value={studentName} onChangeText={setStudentName} />
            <TextInput
              style={styles.input}
              placeholder="Okul Numarası (5 hane)"
              value={studentNo}
              onChangeText={setStudentNo}
              keyboardType="number-pad"
              maxLength={5}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStudentModal(false)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAddStudent}>
                <Text style={styles.confirmBtnText}>Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#4472C4', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 52,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  addBtn: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#4472C4', fontWeight: '600', fontSize: 14 },
  body: { flex: 1, flexDirection: 'row' },
  classList: { width: 110, backgroundColor: '#fff', borderRightWidth: 0.5, borderColor: '#e0e0e0', paddingTop: 8 },
  classItem: { paddingVertical: 12, paddingHorizontal: 10 },
  classItemActive: { backgroundColor: '#e8f0fe' },
  classItemText: { fontSize: 12, fontWeight: '600', color: '#333' },
  classItemTextActive: { color: '#4472C4' },
  classGrade: { fontSize: 10, color: '#aaa', marginTop: 2 },
  studentList: { flex: 1, padding: 12 },
  studentHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  studentHeaderBtns: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  studentTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  importBtn: {
    backgroundColor: '#e8f0fe', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  importBtnText: { color: '#4472C4', fontSize: 12, fontWeight: '600' },
  addStudentBtn: { color: '#4472C4', fontWeight: '600', fontSize: 13 },
  csvHint: { fontSize: 10, color: '#bbb', marginBottom: 10 },
  studentItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6,
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  studentName: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  studentNum: { fontSize: 11, color: '#888', marginTop: 1 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 13, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
    marginBottom: 12, color: '#1a1a1a',
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: 8, backgroundColor: '#4472C4', paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '600' },
});
