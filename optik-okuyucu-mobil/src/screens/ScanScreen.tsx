import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, Modal, ActivityIndicator, Vibration, Animated, Image, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useStore } from '../store/useStore';
import { AnswerChoice, GroupLabel } from '../types';
import { calculateScore } from '../services/scanner';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

type ScanRoute = RouteProp<RootStackParamList, 'Scan'>;
type ScanNav = StackNavigationProp<RootStackParamList>;

type ScanState = 'scanning' | 'processing' | 'result' | 'naming';

interface ResultData {
  bookletType: AnswerChoice;
  adCropUri: string | null;
  studentName: string;
  studentNumber: string;
  answers: AnswerChoice[];
  score: number;
  correct: number;
  wrong: number;
  blank: number;
}

const RESULT_DISPLAY_SEC = 5;
const API_BASE_URL = 'http://192.168.1.41:3000';
const ENABLE_CROP_DEBUG = __DEV__;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function ScanScreen() {
  const nav = useNavigation<ScanNav>();
  const route = useRoute<ScanRoute>();
  const { quizId } = route.params;

  const { activeQuiz, saveResult, findStudentByNumber } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [state, setState] = useState<ScanState>('scanning');
  const [result, setResult] = useState<ResultData | null>(null);
  const [countdown, setCountdown] = useState(RESULT_DISPLAY_SEC);
  const [manualName, setManualName] = useState('');
  const [autoCapture, setAutoCapture] = useState(false);

  type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

  const previewRef = useRef<View>(null);
  const guideRef = useRef<View>(null);
  const [previewLayout, setPreviewLayout] = useState<LayoutBox | null>(null);
  const [guideLayout, setGuideLayout] = useState<LayoutBox | null>(null);

  const progressAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (state !== 'scanning' || !autoCapture) return;

    const interval = setInterval(() => {
      if (!processingRef.current) {
        handleCapture();
      }
    }, 1800);

    return () => clearInterval(interval);
  }, [state, autoCapture]);

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

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [state]);

  if (!permission) {
    return <ActivityIndicator style={{ flex: 1 }} color="#4472C4" />;
  }

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

  async function base64ToFile(base64: string, prefix: string) {
    const uri = `${FileSystem.cacheDirectory}${prefix}_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
  }

  function measureView(ref: React.RefObject<View | null>): Promise<LayoutBox | null> {
    return new Promise(resolve => {
      if (!ref.current) {
        resolve(null);
        return;
      }

      ref.current.measureInWindow((x, y, width, height) => {
        if (!width || !height) {
          resolve(null);
          return;
        }

        resolve({ x, y, width, height });
      });
    });
  }

  async function syncCropLayouts() {
    const [measuredPreview, measuredGuide] = await Promise.all([
      measureView(previewRef),
      measureView(guideRef),
    ]);

    const nextPreviewLayout = measuredPreview ?? previewLayout;
    const nextGuideLayout =
      measuredPreview && measuredGuide
        ? {
            x: measuredGuide.x - measuredPreview.x,
            y: measuredGuide.y - measuredPreview.y,
            width: measuredGuide.width,
            height: measuredGuide.height,
          }
        : guideLayout;

    if (measuredPreview) {
      setPreviewLayout(measuredPreview);
    }

    if (nextGuideLayout) {
      setGuideLayout(nextGuideLayout);
    }

    return {
      preview: nextPreviewLayout,
      guide: nextGuideLayout,
    };
  }

  async function cropToGuideArea(photoUri: string) {
    {
      const img = await ImageManipulator.manipulateAsync(
        photoUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const layouts = await syncCropLayouts();
      const currentPreviewLayout = layouts.preview;
      const currentGuideLayout = layouts.guide;

      if (!currentGuideLayout || !currentPreviewLayout) {
        return photoUri;
      }

      const scale = Math.max(
        currentPreviewLayout.width / img.width,
        currentPreviewLayout.height / img.height
      );

      const displayedW = img.width * scale;
      const displayedH = img.height * scale;
      const offsetX = (displayedW - currentPreviewLayout.width) / 2;
      const offsetY = (displayedH - currentPreviewLayout.height) / 2;

      const trimLeft = 0;
      const trimRight = 0;
      const trimTop = 0;
      const trimBottom = 0;

      const cropGuideArea = {
        x: currentGuideLayout.x + trimLeft,
        y: currentGuideLayout.y + trimTop,
        width: currentGuideLayout.width - trimLeft - trimRight,
        height: currentGuideLayout.height - trimTop - trimBottom,
      };

      const cropX = Math.round((cropGuideArea.x + offsetX) / scale);
      const cropY = Math.round((cropGuideArea.y + offsetY) / scale);
      const cropW = Math.round(cropGuideArea.width / scale);
      const cropH = Math.round(cropGuideArea.height / scale);

      const safeCropX = Math.max(0, Math.min(cropX, img.width - 1));
      const safeCropY = Math.max(0, Math.min(cropY, img.height - 1));
      const safeCropW = Math.max(1, Math.min(cropW, img.width - safeCropX));
      const safeCropH = Math.max(1, Math.min(cropH, img.height - safeCropY));

      if (ENABLE_CROP_DEBUG) {
        console.log('[scan-crop]', {
          image: { width: img.width, height: img.height },
          preview: currentPreviewLayout,
          guide: currentGuideLayout,
          cropGuideArea,
          scale,
          offsetX,
          offsetY,
          trimTop,
          trimBottom,
          trimLeft,
          trimRight,
          safeCrop: {
            x: safeCropX,
            y: safeCropY,
            width: safeCropW,
            height: safeCropH,
          },
        });
      }

      const cropped = await ImageManipulator.manipulateAsync(
        photoUri,
        [
          {
            crop: {
              originX: safeCropX,
              originY: safeCropY,
              width: safeCropW,
              height: safeCropH,
            },
          },
        ],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
      );

      return cropped.uri;
    }
    /*
  const img = await ImageManipulator.manipulateAsync(
    photoUri,
    [],
    { format: ImageManipulator.SaveFormat.JPEG }
  );

  if (!guideLayout || !previewLayout) {
    return photoUri;
  }

  // Kamera preview, ekranda "cover" gibi davranıyor.
  // Bu yüzden gerçek fotoğraf ile preview arasında scale + offset hesaplıyoruz.
  const scale = Math.max(
    previewLayout.width / img.width,
    previewLayout.height / img.height
  );

  const displayedW = img.width * scale;
  const displayedH = img.height * scale;

  const offsetX = (displayedW - previewLayout.width) / 2;
  const offsetY = (displayedH - previewLayout.height) / 2;

  // Guide alanını biraz içeriden alıyoruz.
  // Özellikle alttan fazla aldığı için bottom trim daha yüksek.
  const trimLeft = guideLayout.width * 0.015;
  const trimRight = guideLayout.width * 0.015;
  const trimTop = guideLayout.height * 0.02;
  const trimBottom = guideLayout.height * 0.15;

  const gx = guideLayout.x + trimLeft;
  const gy = guideLayout.y + trimTop;
  const gw = guideLayout.width - trimLeft - trimRight;
  const gh = guideLayout.height - trimTop - trimBottom;

  const cropX = Math.round((gx + offsetX) / scale);
  const cropY = Math.round((gy + offsetY) / scale);
  const cropW = Math.round(gw / scale);
  const cropH = Math.round(gh / scale);

  const safeCropX = Math.max(0, Math.min(cropX, img.width - 1));
  const safeCropY = Math.max(0, Math.min(cropY, img.height - 1));
  const safeCropW = Math.max(1, Math.min(cropW, img.width - safeCropX));
  const safeCropH = Math.max(1, Math.min(cropH, img.height - safeCropY));

  const cropped = await ImageManipulator.manipulateAsync(
    photoUri,
    [
      {
        crop: {
          originX: safeCropX,
          originY: safeCropY,
          width: safeCropW,
          height: safeCropH,
        },
      },
    ],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
  );

  return cropped.uri;
  */
}

  async function handleCapture() {
    if (processingRef.current || !cameraRef.current || !activeQuiz) return;

    processingRef.current = true;
    setState('processing');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (!photo) {
        throw new Error('Fotoğraf çekilemedi');
      }

      Vibration.vibrate(50);

      const croppedUri = await cropToGuideArea(photo.uri);

      const formData = new FormData();
      formData.append('photo', {
        uri: croppedUri,
        name: 'optik_form.jpg',
        type: 'image/jpeg',
      } as any);

      const response = await fetch(`${API_BASE_URL}/upload`, {
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

      const bookletType = (data.bookletType || 'A') as AnswerChoice;

      const answers = Array.isArray(data.answers)
        ? data.answers.map((a: any) => {
            if (['A', 'B', 'C', 'D', 'E'].includes(a)) return a as AnswerChoice;
            return null;
          })
        : [];

      const validGroup: GroupLabel | null =
  bookletType && ['A', 'B', 'C', 'D', 'E'].includes(bookletType)
    ? (bookletType as GroupLabel)
    : null;

      const answerKey =
        activeQuiz.groupCount > 1 && validGroup
          ? activeQuiz.answerKeys[validGroup]
          : activeQuiz.answerKeys.A;

      const scoreResult = calculateScore(
        answers,
        answerKey,
        activeQuiz.negativeMarking,
        activeQuiz.negativeValue
      );

      const studentNumber = data.studentId ? String(data.studentId) : '';
      const matchedStudent = studentNumber
        ? await findStudentByNumber(studentNumber)
        : null;

      const adCropUri = data.nameCropBase64
        ? await base64ToFile(data.nameCropBase64, 'name_crop')
        : null;

      const r: ResultData = {
        bookletType,
        adCropUri,
        studentName: matchedStudent?.name || '',
        studentNumber,
        answers,
        score: scoreResult.score,
        correct: scoreResult.correct,
        wrong: scoreResult.wrong,
        blank: scoreResult.blank,
      };

      setResult(r);
      setManualName(matchedStudent?.name || '');
      setState('naming');
    } catch (e: any) {
      console.error(e);
      Alert.alert('Okuma Başarısız', e.message || 'Bilinmeyen bir hata oluştu.');
      setState('scanning');
    } finally {
      processingRef.current = false;
    }
  }

  async function handleManualSave() {
    if (!result || !activeQuiz) return;

    const finalName = manualName.trim() || result.studentName || '—';

    await saveResult({
      quizId: activeQuiz.id,
      studentId: null,
      studentName: finalName,
      studentNumber: result.studentNumber,
      group: result.bookletType as any,
      answers: result.answers,
      score: result.score,
      correct: result.correct,
      wrong: result.wrong,
      blank: result.blank,
      namePhotoUri: result.adCropUri,
      scannedAt: new Date().toISOString(),
    });

    setResult({ ...result, studentName: finalName });
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
    ? result.score >= 70
      ? '#27ae60'
      : result.score >= 50
      ? '#f39c12'
      : '#e74c3c'
    : '#fff';

  return (
    <View
      ref={previewRef}
      style={styles.container}
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        setPreviewLayout({ x, y, width, height });
      }}
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {state === 'processing' && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Okunuyor...</Text>
        </View>
      )}

      {(state === 'scanning' || state === 'processing') && (
        <View style={styles.guideOverlay}>
          <View style={styles.guideMaskTop} />
          <View style={styles.guideRow}>
            <View style={styles.guideMaskSide} />
            <View
              ref={guideRef}
              style={styles.guide}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                setGuideLayout({ x, y, width, height });
              }}
            >
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />

              <View style={[styles.markerTarget, styles.markerTopLeft]} />
              <View style={[styles.markerTarget, styles.markerTopRight]} />
              <View style={[styles.markerTarget, styles.markerBottomLeft]} />
              <View style={[styles.markerTarget, styles.markerBottomRight]} />

              <View style={styles.centerGuideVertical} />
              <View style={styles.centerGuideHorizontal} />
            </View>
            <View style={styles.guideMaskSide} />
          </View>
          <View style={styles.guideMaskBottom} />
          <Text style={styles.guideText}>
           Siyah referans kareleri çerçeveyle hizalayın
          </Text>
        </View>
      )}

      {state === 'result' && result && (
        <View style={styles.resultOverlay}>
          <View style={styles.progressBg}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultQuizName}>{activeQuiz.title}</Text>

            <Text style={[styles.resultScore, { color: scoreColor }]}>
              {result.score.toFixed(1)}
            </Text>

            <Text style={styles.resultScoreLabel}>
              {result.correct} / {activeQuiz.questionCount} = %{result.score.toFixed(1)}
            </Text>

            <View style={styles.resultInfoRow}>
              <View style={styles.resultInfoItem}>
                <Text style={styles.resultInfoLabel}>Kitapçık</Text>
                <Text style={[styles.resultInfoValue, styles.bookletBadge]}>
                  {result.bookletType ?? '—'}
                </Text>
              </View>

              <View style={[styles.resultInfoItem, { flex: 2 }]}>
                <Text style={styles.resultInfoLabel}>Öğrenci</Text>
                <Text style={styles.resultInfoValue} numberOfLines={1}>
                  {result.studentName || '—'}
                </Text>
              </View>
            </View>

            {!!result.studentNumber && (
              <Text style={styles.studentNumberText}>Numara: {result.studentNumber}</Text>
            )}

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

      <Modal visible={state === 'naming'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Öğrenci Bilgisi</Text>

            {result && (
              <>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Kitapçık Türü:</Text>
                  <View style={styles.modalBookletBadge}>
                    <Text style={styles.modalBookletText}>{result.bookletType ?? '?'}</Text>
                  </View>
                </View>

                {!!result.studentNumber && (
                  <Text style={styles.modalSub}>Numara: {result.studentNumber}</Text>
                )}

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
                  Puan: {result.score.toFixed(1)}   D:{result.correct} Y:{result.wrong} B:{result.blank}
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
                onPress={() => {
                  setState('scanning');
                  setResult(null);
                }}
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

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => nav.navigate('Results', { quizId })}>
          <Text style={styles.navBtnText}>📊</Text>
          <Text style={styles.navBtnLabel}>Sonuçlar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureBtn, state !== 'scanning' && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={state !== 'scanning'}
        >
          {state === 'processing'
            ? <ActivityIndicator color="#fff" size="small" />
            : <View style={styles.captureInner} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, autoCapture && styles.navBtnActive]}
          onPress={() => setAutoCapture(prev => !prev)}
        >
          <Text style={styles.navBtnText}>⚡</Text>
          <Text style={styles.navBtnLabel}>{autoCapture ? 'Oto: Açık' : 'Oto: Kapalı'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const BORDER_W = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  permText: { fontSize: 16, color: '#333' },
  permBtn: {
    backgroundColor: '#4472C4',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permBtnText: { color: '#fff', fontWeight: '600' },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  processingText: { color: '#fff', fontSize: 16, fontWeight: '600' },

guideOverlay: {
  ...StyleSheet.absoluteFillObject,
  justifyContent: 'center',
  alignItems: 'center',
  paddingBottom: 40,
},

  guideMaskTop: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.45)' },
  guideMaskBottom: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.45)' },
  guideRow: { flexDirection: 'row', alignItems: 'center' },
  guideMaskSide: {
    width: SCREEN_W * 0.05,
    height: SCREEN_W * 0.9 * 1.414,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  guide: {
   width: SCREEN_W * 0.88,
    height: SCREEN_W * 0.88 * 1.414,
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    transform: [{ translateY: -12 }],
  },

  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
  tl: { top: 0, left: 0, borderTopWidth: BORDER_W, borderLeftWidth: BORDER_W, borderColor: '#fff' },
  tr: { top: 0, right: 0, borderTopWidth: BORDER_W, borderRightWidth: BORDER_W, borderColor: '#fff' },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER_W, borderLeftWidth: BORDER_W, borderColor: '#fff' },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER_W, borderRightWidth: BORDER_W, borderColor: '#fff' },

markerTarget: {
  position: 'absolute',
  width: 34,
  height: 34,
  borderWidth: 3,
  borderColor: 'rgba(255,255,255,0.95)',
  backgroundColor: 'rgba(255,255,255,0.12)',
},

markerTopLeft: {
  top: '4.5%',
  left: '4.5%',
},

markerTopRight: {
  top: '4.5%',
  right: '4.5%',
},

markerBottomLeft: {
  bottom: '4.5%',
  left: '4.5%',
},

markerBottomRight: {
  bottom: '4.5%',
  right: '4.5%',
},

centerGuideVertical: {
  position: 'absolute',
  top: '8%',
  bottom: '8%',
  left: '50%',
  width: 1,
  backgroundColor: 'rgba(255,255,255,0.18)',
},

centerGuideHorizontal: {
  position: 'absolute',
  left: '8%',
  right: '8%',
  top: '50%',
  height: 1,
  backgroundColor: 'rgba(255,255,255,0.18)',
},
  guideText: {
  color: '#fff',
  marginTop: 14,
  fontSize: 13,
  opacity: 0.92,
  textAlign: 'center',
  paddingHorizontal: 24,
},

  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  progressBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 16,
  },
  progressBar: { height: 4, backgroundColor: '#4472C4', borderRadius: 2 },

  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  resultQuizName: { fontSize: 13, color: '#888', marginBottom: 4, textAlign: 'center' },
  resultScore: { fontSize: 56, fontWeight: '700', textAlign: 'center', lineHeight: 64 },
  resultScoreLabel: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 16 },

  resultInfoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  resultInfoItem: {
    flex: 1,
    backgroundColor: '#f8f9ff',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  resultInfoLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  resultInfoValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  bookletBadge: { fontSize: 18, fontWeight: '800', color: '#4472C4' },
  studentNumberText: { textAlign: 'center', color: '#666', marginBottom: 8 },

  cropContainer: {
    marginBottom: 8,
    backgroundColor: '#f8f9ff',
    borderRadius: 8,
    padding: 6,
  },
  cropLabel: { fontSize: 10, color: '#888', marginBottom: 3 },
  cropImage: { width: '100%', height: 28, borderRadius: 4 },

  dybRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 4 },
  dybItem: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  dybNum: { fontSize: 22, fontWeight: '700' },
  dybLabel: { fontSize: 11, color: '#555', marginTop: 2 },

  resultActions: { flexDirection: 'row', gap: 10 },
  deleteResultBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e74c3c',
    alignItems: 'center',
  },
  deleteResultText: { color: '#e74c3c', fontWeight: '600' },
  nextBtn: {
    flex: 1,
    backgroundColor: '#4472C4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 32,
  },
  navBtn: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  navBtnActive: { backgroundColor: 'rgba(255,200,0,0.3)' },
  navBtnText: { fontSize: 20 },
  navBtnLabel: { fontSize: 10, color: '#ccc' },

  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4472C4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureBtnDisabled: { opacity: 0.4 },
  captureInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  modalSub: { fontSize: 13, color: '#555', marginBottom: 12 },

  modalInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  modalInfoLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  modalBookletBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 12,
    color: '#1a1a1a',
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#555', fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#4472C4',
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '600' },
});
