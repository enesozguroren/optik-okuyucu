import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, Modal, ActivityIndicator, Vibration, Animated, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useStore } from '../store/useStore';
import { AnswerChoice } from '../types';

type ScanRoute = RouteProp<RootStackParamList, 'Scan'>;
type ScanNav   = StackNavigationProp<RootStackParamList>;

type ScanState = 'scanning' | 'processing' | 'result' | 'naming';

interface ResultData {
  bookletType:  AnswerChoice;   // A/B/C/D/E kitapçık türü
  adCropUri:    string | null;  // İsim alanı görseli
  sidCropUri:   string | null;  // Numara alanı görseli
  studentName:  string;
  answers:      AnswerChoice[];
  score:        number;
  correct:      number;
  wrong:        number;
  blank:        number;
}

const RESULT_DISPLAY_SEC = 5;

export default function ScanScreen() {
  const nav   = useNavigation<ScanNav>();
  const route = useRoute<ScanRoute>();
  const { quizId } = route.params;

  const { activeQuiz, saveResult } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [state,       setState]       = useState<ScanState>('scanning');
  const [result,      setResult]      = useState<ResultData | null>(null);
  const [countdown,   setCountdown]   = useState(RESULT_DISPLAY_SEC);
  const [manualName,  setManualName]  = useState('');
  const [autoCapture, setAutoCapture] = useState(false);

  const progressAnim  = useRef(new Animated.Value(1)).current;
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);

  // Otomatik çekim
  useEffect(() => {
    if (state !== 'scanning' || !autoCapture) return;
    const interval = setInterval(() => {
      if (!processingRef.current) handleCapture();
    }, 1500);
    return () => clearInterval(interval);
  }, [state, autoCapture]);

  // Sonuç geri sayımı
  useEffect(() => {
    if (state !== 'result') return;

    setCountdown(RESULT_DISPLAY_SEC);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: RESULT_DISPLAY_SEC * 1000,
      useNativeDriver: false,
    }).start();

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          handleNextScan();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [state, result]);

  if (!permission) return <ActivityIndicator style={{ flex: 1 }} color="#4472C4" />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Kamera izni gerekli</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!activeQuiz) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Sınav yüklenemedi</Text>
      </View>
    );
  }

  async function handleCapture() {
    if (processingRef.current || !cameraRef.current) return;
    processingRef.current = true;
    setState('processing');

    try {
      // 1. Fotoğrafı Çek ve Titreşim Ver
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error('Fotoğraf çekilemedi');
      Vibration.vibrate(50);

      // 2. Fotoğrafı Python Sunucusuna Göndermek İçin Hazırla
      const formData = new FormData();
      formData.append('photo', {
        uri: photo.uri,
        name: 'optik_form.jpg',
        type: 'image/jpeg',
      } as any);

      // Kendi bilgisayarının IPv4 Adresi (Burayı güncelledik)
      const BACKEND_URL = 'http://192.168.137.1:3000/upload';

      // 3. Python'a İsteği At
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Sunucu hatası');
      }

      // data.bookletType artık Python'dan geliyor
      const r: ResultData = {
      bookletType:  data.bookletType || '?', 
      adCropUri:    null,
      sidCropUri:   null,
      studentName:  '',
      answers:      [],
      score:        data.score,
      correct:      data.correct,
      wrong:        data.wrong,
      blank:        data.blank,
      };

      setResult(r);
      setManualName('');
      setState('naming');

    } catch (e: any) {
      console.error(e);
      // Artık Python'dan gelen GERÇEK hatayı (Köşeler bulunamadı vs.) ekrana yazdıracak
      Alert.alert('Okuma Başarısız', e.message || 'Bilinmeyen bir hata oluştu.');
      setState('scanning');
    } finally {
      processingRef.current = false;
    }
  }

  async function handleManualSave() {
    if (!result) return;
    const name = manualName.trim() || '—';
    await saveResult({
      quizId:        activeQuiz!.id,
      studentId:     null,
      studentName:   name,
      studentNumber: '',          
      answers:       result.answers,
      score:         result.score,
      correct:       result.correct,
      wrong:         result.wrong,
      blank:         result.blank,
      scannedAt:     new Date().toISOString(),
    });
    const updated = { ...result, studentName: name };
    setResult(updated);
    Vibration.vibrate(120);
    setState('result');
  }

  function handleNextScan() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResult(null);
    setState('scanning');
  }

  function handleDeleteResult() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResult(null);
    setState('scanning');
  }

  const scoreColor = result
    ? result.score >= 70 ? '#27ae60' : result.score >= 50 ? '#f39c12' : '#e74c3c'
    : '#fff';

  return (
    <View style={styles.container}>
      {/* Kamera her zaman arka planda */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* İşleniyor overlay */}
      {state === 'processing' && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Okunuyor...</Text>
        </View>
      )}

      {/* Tarama modu: kılavuz çerçeve */}
      {(state === 'scanning' || state === 'processing') && (
        <View style={styles.guideOverlay}>
          <View style={styles.guide}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <Text style={styles.guideText}>Formu çerçeve içine hizalayın</Text>
        </View>
      )}

      {/* Sonuç ekranı */}
      {state === 'result' && result && (
        <View style={styles.resultOverlay}>
          {/* Üst progress bar */}
          <View style={styles.progressBg}>
            <Animated.View
              style={[styles.progressBar, {
                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
              }]}
            />
          </View>

          <View style={styles.resultCard}>
            {/* Sınav adı */}
            <Text style={styles.resultQuizName}>{activeQuiz.title}</Text>

            {/* Puan - büyük */}
            <Text style={[styles.resultScore, { color: scoreColor }]}>
              {result.score.toFixed(1)}
            </Text>
            <Text style={styles.resultScoreLabel}>
              {result.correct} / {activeQuiz.questionCount} = %{result.score.toFixed(1)}
            </Text>

            {/* Öğrenci ve kitapçık bilgisi */}
            <View style={styles.resultInfoRow}>
              {/* Kitapçık türü */}
              <View style={styles.resultInfoItem}>
                <Text style={styles.resultInfoLabel}>Kitapçık</Text>
                <Text style={[styles.resultInfoValue, styles.bookletBadge]}>
                  {result.bookletType ?? '—'}
                </Text>
              </View>

              {/* Öğrenci adı */}
              <View style={[styles.resultInfoItem, { flex: 2 }]}>
                <Text style={styles.resultInfoLabel}>Ad</Text>
                <Text style={styles.resultInfoValue} numberOfLines={1}>
                  {result.studentName || '—'}
                </Text>
              </View>
            </View>

            {/* Numara crop görüntüsü */}
            {result.sidCropUri && (
              <View style={styles.cropContainer}>
                <Text style={styles.cropLabel}>Numara</Text>
                <Image
                  source={{ uri: result.sidCropUri }}
                  style={styles.cropImage}
                  resizeMode="contain"
                />
              </View>
            )}

            {/* İsim crop görüntüsü */}
            {result.adCropUri && (
              <View style={styles.cropContainer}>
                <Text style={styles.cropLabel}>Ad Soyad</Text>
                <Image
                  source={{ uri: result.adCropUri }}
                  style={[styles.cropImage, { height: 36 }]}
                  resizeMode="contain"
                />
              </View>
            )}

            {/* D / Y / B */}
            <View style={styles.dybRow}>
              <View style={[styles.dybItem, { backgroundColor: '#e8f8ef' }]}>
                <Text style={[styles.dybNum, { color: '#27ae60' }]}>{result.correct}</Text>
                <Text style={styles.dybLabel}>Doğru</Text>
              </View>
              <View style={[styles.dybItem, { backgroundColor: '#fdecea' }]}>
                <Text style={[styles.dybNum, { color: '#e74c3c' }]}>{result.wrong}</Text>
                <Text style={styles.dybLabel}>Yanlış</Text>
              </View>
              <View style={[styles.dybItem, { backgroundColor: '#f5f5f5' }]}>
                <Text style={[styles.dybNum, { color: '#888' }]}>{result.blank}</Text>
                <Text style={styles.dybLabel}>Boş</Text>
              </View>
            </View>

            {/* Aksiyonlar */}
            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.deleteResultBtn} onPress={handleDeleteResult}>
                <Text style={styles.deleteResultText}>Sil</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={handleNextScan}>
                <Text style={styles.nextBtnText}>Sonraki ({countdown})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* İsim girme modal */}
      <Modal visible={state === 'naming'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Öğrenci Bilgisi</Text>

            {result && (
              <>
                {/* Kitapçık türü badge */}
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Kitapçık Türü:</Text>
                  <View style={styles.modalBookletBadge}>
                    <Text style={styles.modalBookletText}>
                      {result.bookletType ?? '?'}
                    </Text>
                  </View>
                </View>

                {/* Numara crop */}
                {result.sidCropUri && (
                  <View style={styles.modalCropContainer}>
                    <Text style={styles.modalInfoLabel}>Numara:</Text>
                    <Image
                      source={{ uri: result.sidCropUri }}
                      style={styles.modalCropImage}
                      resizeMode="contain"
                    />
                  </View>
                )}

                {/* Ad crop */}
                {result.adCropUri && (
                  <View style={styles.modalCropContainer}>
                    <Text style={styles.modalInfoLabel}>Ad Soyad:</Text>
                    <Image
                      source={{ uri: result.adCropUri }}
                      style={[styles.modalCropImage, { height: 32 }]}
                      resizeMode="contain"
                    />
                  </View>
                )}

                <Text style={styles.modalSub}>
                  Puan: {result.score.toFixed(1)}{'   '}
                  D:{result.correct} Y:{result.wrong} B:{result.blank}
                </Text>
              </>
            )}

            <TextInput
              style={styles.input}
              placeholder="Öğrenci adını girin (opsiyonel)"
              value={manualName}
              onChangeText={setManualName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleManualSave}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setState('scanning'); setResult(null); }}
              >
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleManualSave}>
                <Text style={styles.confirmText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alt kontrol barı */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => nav.navigate('Results', { quizId })}
        >
          <Text style={styles.navBtnText}>📊</Text>
          <Text style={styles.navBtnLabel}>Sonuçlar</Text>
        </TouchableOpacity>

        {/* Büyük çekim butonu */}
        <TouchableOpacity
          style={[styles.captureBtn, state !== 'scanning' && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={state !== 'scanning'}
        >
          {state === 'processing'
            ? <ActivityIndicator color="#fff" size="small" />
            : <View style={styles.captureInner} />}
        </TouchableOpacity>

        {/* Otomatik mod toggle */}
        <TouchableOpacity
          style={[styles.navBtn, autoCapture && styles.navBtnActive]}
          onPress={() => setAutoCapture(p => !p)}
        >
          <Text style={styles.navBtnText}>⚡</Text>
          <Text style={styles.navBtnLabel}>{autoCapture ? 'Oto: Açık' : 'Oto: Kapalı'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const BORDER_W    = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  permText:  { fontSize: 16, color: '#333' },
  permBtn:   { backgroundColor: '#4472C4', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText: { color: '#fff', fontWeight: '600' },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  processingText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    paddingBottom: 80, // Alt menüye çarpmaması için
  },
  // Kılavuz kutusu: Formun tam oturması gereken alan
  guide: { 
    width: '90%', // Ekran genişliğinin %90'ı
    aspectRatio: 1 / 1.414, // A4 kağıt oranı (Yaklaşık 1.41)
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.05)', // Hafif şeffaf iç arka plan
  },

  corner:   { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
  tl: { top: 0, left: 0, borderTopWidth: BORDER_W, borderLeftWidth: BORDER_W, borderColor: '#fff' },
  tr: { top: 0, right: 0, borderTopWidth: BORDER_W, borderRightWidth: BORDER_W, borderColor: '#fff' },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER_W, borderLeftWidth: BORDER_W, borderColor: '#fff' },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER_W, borderRightWidth: BORDER_W, borderColor: '#fff' },
  guideText: { color: '#fff', marginTop: 14, fontSize: 13, opacity: 0.85, textAlign: 'center' },

  // Sonuç overlay
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  progressBg:  { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 16 },
  progressBar: { height: 4, backgroundColor: '#4472C4', borderRadius: 2 },

  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  resultQuizName:   { fontSize: 13, color: '#888', marginBottom: 4, textAlign: 'center' },
  resultScore:      { fontSize: 56, fontWeight: '700', textAlign: 'center', lineHeight: 64 },
  resultScoreLabel: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 16 },

  resultInfoRow:  { flexDirection: 'row', gap: 12, marginBottom: 12 },
  resultInfoItem: {
    flex: 1, backgroundColor: '#f8f9ff', borderRadius: 8, padding: 10, alignItems: 'center',
  },
  resultInfoLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  resultInfoValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  bookletBadge:    {
    fontSize: 18, fontWeight: '800', color: '#4472C4',
  },

  // Crop görselleri
  cropContainer: {
    marginBottom: 8,
    backgroundColor: '#f8f9ff',
    borderRadius: 8,
    padding: 6,
  },
  cropLabel: { fontSize: 10, color: '#888', marginBottom: 3 },
  cropImage: { width: '100%', height: 28, borderRadius: 4 },

  dybRow:   { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 4 },
  dybItem:  { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  dybNum:   { fontSize: 22, fontWeight: '700' },
  dybLabel: { fontSize: 11, color: '#555', marginTop: 2 },

  resultActions:    { flexDirection: 'row', gap: 10 },
  deleteResultBtn:  {
    paddingVertical: 12, paddingHorizontal: 18,
    borderRadius: 8, borderWidth: 1, borderColor: '#e74c3c', alignItems: 'center',
  },
  deleteResultText: { color: '#e74c3c', fontWeight: '600' },
  nextBtn:          {
    flex: 1, backgroundColor: '#4472C4', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Alt bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 32,
  },
  navBtn: {
    alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  navBtnActive: { backgroundColor: 'rgba(255,200,0,0.3)' },
  navBtnText:   { fontSize: 20 },
  navBtnLabel:  { fontSize: 10, color: '#ccc' },

  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#4472C4',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: '#fff',
  },
  captureBtnDisabled: { opacity: 0.4 },
  captureInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  modalSub:   { fontSize: 13, color: '#555', marginBottom: 12 },

  modalInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalInfoLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  modalBookletBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  modalBookletText: { fontSize: 18, fontWeight: '800', color: '#4472C4' },

  modalCropContainer: {
    marginBottom: 10,
    backgroundColor: '#f8f9ff',
    borderRadius: 8,
    padding: 8,
  },
  modalCropImage: { width: '100%', height: 40, borderRadius: 4 },

  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
    marginBottom: 12, color: '#1a1a1a',
  },
  modalBtns:  { flexDirection: 'row', gap: 12 },
  cancelBtn:  {
    flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#ccc',
    paddingVertical: 12, alignItems: 'center',
  },
  cancelText: { color: '#555', fontWeight: '600' },
  confirmBtn: { flex: 1, borderRadius: 8, backgroundColor: '#4472C4', paddingVertical: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '600' },
});