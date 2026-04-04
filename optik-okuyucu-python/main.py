from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ============================================================================
# TEMPLATE / CANVAS
# Bu değerler ZipGrade PDF görüntüsüne göre ayarlandı.
# Aynı form kullanılacaksa sabit kalabilir.
# ============================================================================
WARP_W = 900
WARP_H = 1200

# Dış 4 marker'ın warp sonrası beklenen merkezleri
DST_MARKERS = np.array([
    [36, 35],     # top-left
    [863, 35],    # top-right
    [36, 1163],   # bottom-left
    [863, 1163],  # bottom-right
], dtype=np.float32)

# ============================================================================
# MARKER TESPİT AYARLARI
# ============================================================================
MARKER_MIN_AREA = 120
MARKER_MAX_AREA = 10000
MARKER_AR_MIN = 0.65
MARKER_AR_MAX = 1.35
MARKER_EXTENT_MIN = 0.60

# ============================================================================
# ROI TANIMLARI (900x1200 canvas için)
# ============================================================================
NAME = dict(bx=178, by=35, bw=355, bh=34)

KT = dict(bx=49, by=214, bw=30, bh=210)         # A-E
ID_BOX = dict(bx=150, by=201, bw=184, bh=436)

Q = {
    "1_10":   dict(bx=150, by=674, bw=184, bh=430),
    "11_20":  dict(bx=386, by=201, bw=184, bh=436),
    "21_30":  dict(bx=386, by=720, bw=184, bh=392),
    "31_40":  dict(bx=622, by=201, bw=184, bh=436),
    "41_50":  dict(bx=622, by=720, bw=184, bh=392),
}

SORU_BLOKLARI = [
    ("1_10",   1, 10),
    ("11_20", 11, 20),
    ("21_30", 21, 30),
    ("31_40", 31, 40),
    ("41_50", 41, 50),
]

CHOICES = ["A", "B", "C", "D", "E"]

# ============================================================================
# YARDIMCI FONKSİYONLAR
# ============================================================================

def order_points(pts):
    pts = np.array(pts, dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).reshape(-1)

    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(d)]
    bl = pts[np.argmax(d)]

    return np.array([tl, tr, bl, br], dtype=np.float32)


def detect_outer_markers(gray):
    """
    Orijinal fotoğrafta siyah marker karelerini bulur.
    Dış 4 köşeye en yakın 4 marker merkezi döner.
    """
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < MARKER_MIN_AREA or area > MARKER_MAX_AREA:
            continue

        x, y, w, h = cv2.boundingRect(c)
        ar = w / float(h)
        if not (MARKER_AR_MIN <= ar <= MARKER_AR_MAX):
            continue

        rect_area = w * h
        if rect_area <= 0:
            continue

        extent = area / rect_area
        if extent < MARKER_EXTENT_MIN:
            continue

        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.06 * peri, True)
        if len(approx) < 4 or len(approx) > 8:
            continue

        cx = x + w / 2.0
        cy = y + h / 2.0
        candidates.append((cx, cy, area, x, y, w, h))

    if len(candidates) < 4:
        return None, th

    pts = np.array([(c[0], c[1]) for c in candidates], dtype=np.float32)
    h_img, w_img = gray.shape[:2]

    tl_target = np.array([0, 0], dtype=np.float32)
    tr_target = np.array([w_img, 0], dtype=np.float32)
    bl_target = np.array([0, h_img], dtype=np.float32)
    br_target = np.array([w_img, h_img], dtype=np.float32)

    tl = pts[np.argmin(np.linalg.norm(pts - tl_target, axis=1))]
    tr = pts[np.argmin(np.linalg.norm(pts - tr_target, axis=1))]
    bl = pts[np.argmin(np.linalg.norm(pts - bl_target, axis=1))]
    br = pts[np.argmin(np.linalg.norm(pts - br_target, axis=1))]

    src = np.array([tl, tr, bl, br], dtype=np.float32)
    src = order_points(src)

    return src, th


def warp_by_markers(gray):
    src, marker_thresh = detect_outer_markers(gray)
    if src is None:
        return None, None, marker_thresh

    dst = DST_MARKERS.copy()
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(gray, M, (WARP_W, WARP_H))

    return warped, src, marker_thresh


def make_binary_for_reading(warped_gray):
    """
    Balon okumaya uygun binary üretir.
    Burada amaç çember kenarını değil, mümkün olduğunca dolu merkezin baskın çıkması.
    """
    blur = cv2.GaussianBlur(warped_gray, (5, 5), 0)

    th = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        8
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)

    return th

def central_darkness_score(gray_cell, radius_ratio=0.18):
    if gray_cell.size == 0:
        return 0.0

    h, w = gray_cell.shape
    cx, cy = w // 2, h // 2
    radius = max(3, int(min(w, h) * radius_ratio))

    mask = np.zeros_like(gray_cell, dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)

    pixels = gray_cell[mask == 255]
    if pixels.size == 0:
        return 0.0

    mean_val = np.mean(pixels) / 255.0
    darkness = 1.0 - mean_val
    return darkness


def read_bubble_block(gray_img, bx, by, bw, bh, rows=10, cols=5):
    roi = gray_img[by:by+bh, bx:bx+bw]
    row_h = bh / rows
    col_w = bw / cols

    answers = []

    for r in range(rows):
        scores = []

        for c in range(cols):
            y1 = int(r * row_h)
            y2 = int((r + 1) * row_h)
            x1 = int(c * col_w)
            x2 = int((c + 1) * col_w)

            cell = roi[y1:y2, x1:x2]
            score = central_darkness_score(cell, radius_ratio=0.18)
            scores.append(score)

        max_s = max(scores)
        sorted_scores = sorted(scores, reverse=True)
        second_s = sorted_scores[1] if len(sorted_scores) > 1 else 0.0

        if max_s < 0.36:
            answers.append("BOŞ")
        elif second_s > max_s * 0.92:
            answers.append("HATALI")
        else:
            answers.append(CHOICES[int(np.argmax(scores))])

    return answers


def get_student_id(gray_img, bx, by, bw, bh, cols=5):
    roi = gray_img[by:by+bh, bx:bx+bw]
    row_h = bh / 10
    col_w = bw / cols
    digits_order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

    out = ""

    for c in range(cols):
        scores = []

        for r in range(10):
            y1 = int(r * row_h)
            y2 = int((r + 1) * row_h)
            x1 = int(c * col_w)
            x2 = int((c + 1) * col_w)

            cell = roi[y1:y2, x1:x2]
            score = central_darkness_score(cell, radius_ratio=0.16)
            scores.append(score)

        max_s = max(scores)
        sorted_scores = sorted(scores, reverse=True)
        second_s = sorted_scores[1] if len(sorted_scores) > 1 else 0.0

        if max_s < 0.28 or second_s > max_s * 0.90:
            out += "?"
        else:
            out += str(digits_order[int(np.argmax(scores))])

    return out


def get_booklet_type(gray_img, bx, by, bw, bh):
    roi = gray_img[by:by+bh, bx:bx+bw]
    row_h = bh / 5
    scores = []

    for r in range(5):
        y1 = int(r * row_h)
        y2 = int((r + 1) * row_h)
        cell = roi[y1:y2, :]
        scores.append(central_darkness_score(cell, radius_ratio=0.16))

    max_s = max(scores)
    sorted_scores = sorted(scores, reverse=True)
    second_s = sorted_scores[1] if len(sorted_scores) > 1 else 0.0

    if max_s < 0.28 or second_s > max_s * 0.90:
        return "?"

    return CHOICES[int(np.argmax(scores))]

def draw_debug(warped_color):
    rects = [
        (KT["bx"], KT["by"], KT["bw"], KT["bh"], (0, 0, 255), "KT"),
        (ID_BOX["bx"], ID_BOX["by"], ID_BOX["bw"], ID_BOX["bh"], (0, 255, 0), "ID"),
        (NAME["bx"], NAME["by"], NAME["bw"], NAME["bh"], (255, 0, 0), "Name"),
        (Q["1_10"]["bx"], Q["1_10"]["by"], Q["1_10"]["bw"], Q["1_10"]["bh"], (0, 255, 255), "Q1-10"),
        (Q["11_20"]["bx"], Q["11_20"]["by"], Q["11_20"]["bw"], Q["11_20"]["bh"], (0, 165, 255), "Q11-20"),
        (Q["21_30"]["bx"], Q["21_30"]["by"], Q["21_30"]["bw"], Q["21_30"]["bh"], (255, 0, 255), "Q21-30"),
        (Q["31_40"]["bx"], Q["31_40"]["by"], Q["31_40"]["bw"], Q["31_40"]["bh"], (0, 255, 0), "Q31-40"),
        (Q["41_50"]["bx"], Q["41_50"]["by"], Q["41_50"]["bw"], Q["41_50"]["bh"], (255, 0, 128), "Q41-50"),
    ]

    for x, y, w, h, color, label in rects:
        cv2.rectangle(warped_color, (x, y), (x + w, y + h), color, 2)
        cv2.putText(warped_color, label, (x, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

    return warped_color


# ============================================================================
# API
# ============================================================================

@app.get("/")
def read_root():
    return {"message": f"Optik okuyucu hazır. OpenCV={cv2.__version__}"}


@app.post("/upload")
async def upload_image(photo: UploadFile = File(...)):
    try:
        contents = await photo.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Fotoğraf okunamadı"}

        cv2.imwrite("gelen_orijinal_foto.jpg", img)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        warped_gray, src_markers, marker_thresh = warp_by_markers(gray)

        if warped_gray is None:
            cv2.imwrite("marker_thresh.jpg", marker_thresh)
            return {"error": "Dış marker kareleri bulunamadı. Kağıdı daha düz ve tamamı görünecek şekilde çek."}

        warped_thresh = make_binary_for_reading(warped_gray)

        cv2.imwrite("warped_gray.jpg", warped_gray)
        cv2.imwrite("warped_thresh.jpg", warped_thresh)

        detected_kt = get_booklet_type(warped_gray, **KT)
        student_id = get_student_id(warped_gray, **ID_BOX)

        nx, ny, nw, nh = NAME["bx"], NAME["by"], NAME["bw"], NAME["bh"]
        name_crop = warped_gray[ny:ny+nh, nx:nx+nw]
        cv2.imwrite("ogrenci_isim_crop.jpg", name_crop)

        blok_sonuclari = {}
        for blok_key, q_start, q_end in SORU_BLOKLARI:
            bd = Q[blok_key]
            blok_sonuclari[(q_start, q_end)] = read_bubble_block(
            warped_gray,
            bd["bx"], bd["by"], bd["bw"], bd["bh"]
            )

        tum_cevaplar = []
        for q_start, q_end in sorted(blok_sonuclari.keys()):
            tum_cevaplar.extend(blok_sonuclari[(q_start, q_end)])

        warped_color = cv2.cvtColor(warped_gray, cv2.COLOR_GRAY2BGR)
        warped_color = draw_debug(warped_color)
        cv2.imwrite("debug_tum_okumalar.jpg", warped_color)

        boslar = tum_cevaplar.count("BOŞ")
        hatalilar = tum_cevaplar.count("HATALI")
        dolu = len(tum_cevaplar) - boslar - hatalilar

        print(f"📖 Kitapçık Türü : {detected_kt}")
        print(f"🆔 Öğrenci ID    : {student_id}")
        print(f"📝 Toplam Cevap  : {len(tum_cevaplar)} | Dolu: {dolu} | Boş: {boslar} | Hatalı: {hatalilar}")
        for i, c in enumerate(tum_cevaplar, 1):
            print(f"  Soru {i:2d}: {c}")

        return {
            "message": "Form başarıyla okundu",
            "bookletType": detected_kt,
            "studentId": student_id,
            "answers": tum_cevaplar,
            "score": 0,
            "correct": 0,
            "wrong": 0,
            "blank": boslar,
            "multiMark": hatalilar,
            "markerCount": 4
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)