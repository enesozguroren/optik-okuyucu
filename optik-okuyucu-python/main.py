from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import base64
import cv2
import numpy as np

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# TEMPLATE / CANVAS
# ============================================================================
WARP_W = 900
WARP_H = 1200

DST_MARKERS = np.array([
    [36, 35],     # top-left
    [863, 35],    # top-right
    [36, 1163],   # bottom-left
    [863, 1163],  # bottom-right
], dtype=np.float32)

# ============================================================================
# MARKER DETECTION
# ============================================================================
MARKER_MIN_AREA = 120
MARKER_MAX_AREA = 10000
MARKER_AR_MIN = 0.65
MARKER_AR_MAX = 1.35
MARKER_EXTENT_MIN = 0.60

# ============================================================================
# ROIS FOR 900x1200 WARP CANVAS
# ============================================================================
NAME = dict(bx=178, by=35, bw=355, bh=34)

KT = dict(bx=49, by=214, bw=30, bh=210)
ID_BOX = dict(bx=150, by=201, bw=184, bh=436)

Q = {
    "1_10": dict(bx=150, by=674, bw=184, bh=430),
    "11_20": dict(bx=386, by=201, bw=184, bh=436),
    "21_30": dict(bx=386, by=720, bw=184, bh=392),
    "31_40": dict(bx=622, by=201, bw=184, bh=436),
    "41_50": dict(bx=622, by=720, bw=184, bh=392),
}

SORU_BLOKLARI = [
    ("1_10", 1, 10),
    ("11_20", 11, 20),
    ("21_30", 21, 30),
    ("31_40", 31, 40),
    ("41_50", 41, 50),
]

CHOICES = ["A", "B", "C", "D", "E"]
BLANK_LABEL = "BO\u015e"
MULTI_LABEL = "HATALI"

CELL_DEBUG_FILES = {
    "1_10": "cell_debug_q1_10.jpg",
    "11_20": "cell_debug_q11_20.jpg",
    "21_30": "cell_debug_q21_30.jpg",
    "31_40": "cell_debug_q31_40.jpg",
    "41_50": "cell_debug_q41_50.jpg",
    "ID": "cell_debug_id.jpg",
    "KT": "cell_debug_kt.jpg",
}


# ============================================================================
# HELPERS
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


def clamp_box(x, y, w, h, img_shape):
    img_h, img_w = img_shape[:2]

    x = int(round(x))
    y = int(round(y))
    w = int(round(w))
    h = int(round(h))

    x = max(0, x)
    y = max(0, y)
    w = max(1, min(w, img_w - x))
    h = max(1, min(h, img_h - y))

    return x, y, w, h


def expand_box(box, img_shape, pad_x_ratio=0.08, pad_y_ratio=0.06):
    pad_x = int(round(box["bw"] * pad_x_ratio))
    pad_y = int(round(box["bh"] * pad_y_ratio))
    return clamp_box(
        box["bx"] - pad_x,
        box["by"] - pad_y,
        box["bw"] + pad_x * 2,
        box["bh"] + pad_y * 2,
        img_shape,
    )


def detect_outer_markers(gray):
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < MARKER_MIN_AREA or area > MARKER_MAX_AREA:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        ar = w / float(h)
        if not (MARKER_AR_MIN <= ar <= MARKER_AR_MAX):
            continue

        rect_area = w * h
        if rect_area <= 0:
            continue

        extent = area / rect_area
        if extent < MARKER_EXTENT_MIN:
            continue

        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.06 * peri, True)
        if len(approx) < 4 or len(approx) > 8:
            continue

        cx = x + w / 2.0
        cy = y + h / 2.0
        candidates.append((cx, cy))

    if len(candidates) < 4:
        return None, th

    pts = np.array(candidates, dtype=np.float32)
    h_img, w_img = gray.shape[:2]

    tl_target = np.array([0, 0], dtype=np.float32)
    tr_target = np.array([w_img, 0], dtype=np.float32)
    bl_target = np.array([0, h_img], dtype=np.float32)
    br_target = np.array([w_img, h_img], dtype=np.float32)

    tl = pts[np.argmin(np.linalg.norm(pts - tl_target, axis=1))]
    tr = pts[np.argmin(np.linalg.norm(pts - tr_target, axis=1))]
    bl = pts[np.argmin(np.linalg.norm(pts - bl_target, axis=1))]
    br = pts[np.argmin(np.linalg.norm(pts - br_target, axis=1))]

    src = order_points(np.array([tl, tr, bl, br], dtype=np.float32))
    return src, th


def warp_by_markers(gray):
    src, marker_thresh = detect_outer_markers(gray)
    if src is None:
        return None, None, marker_thresh

    dst = DST_MARKERS.copy()
    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(gray, matrix, (WARP_W, WARP_H))
    return warped, src, marker_thresh


def make_binary_for_reading(warped_gray):
    blur = cv2.GaussianBlur(warped_gray, (5, 5), 0)
    th = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        8,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)
    return th


def image_to_base64(path):
    try:
        with open(path, "rb") as file_obj:
            return base64.b64encode(file_obj.read()).decode("utf-8")
    except Exception:
        return None


def dedupe_circle_candidates(points, min_dist):
    if len(points) == 0:
        return np.empty((0, 3), dtype=np.float32)

    min_dist_sq = float(min_dist * min_dist)
    kept = []
    for x, y, r in sorted(points, key=lambda item: item[2], reverse=True):
        is_duplicate = False
        for kx, ky, _ in kept:
            if (x - kx) ** 2 + (y - ky) ** 2 < min_dist_sq:
                is_duplicate = True
                break
        if not is_duplicate:
            kept.append((float(x), float(y), float(r)))

    kept.sort(key=lambda item: (item[1], item[0]))
    return np.array(kept, dtype=np.float32)


def detect_circle_candidates(roi_gray, roi_bin, approx_pitch):
    candidates = []
    proc = cv2.GaussianBlur(roi_gray, (5, 5), 0)
    proc = cv2.equalizeHist(proc)

    min_dist = max(12, int(round(approx_pitch * 0.65)))
    min_radius = max(6, int(round(approx_pitch * 0.22)))
    max_radius = max(min_radius + 2, int(round(approx_pitch * 0.44)))

    circles = cv2.HoughCircles(
        proc,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=80,
        param2=14,
        minRadius=min_radius,
        maxRadius=max_radius,
    )
    if circles is not None:
        for x, y, r in circles[0]:
            candidates.append((x, y, r))

    contours, _ = cv2.findContours(roi_bin, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    area_min = approx_pitch * approx_pitch * 0.10
    area_max = approx_pitch * approx_pitch * 1.60
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < area_min or area > area_max:
            continue

        peri = cv2.arcLength(contour, True)
        if peri <= 0:
            continue

        circularity = (4.0 * np.pi * area) / (peri * peri)
        if circularity < 0.35:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        if h <= 0:
            continue

        ar = w / float(h)
        if not (0.6 <= ar <= 1.4):
            continue

        candidates.append((x + w / 2.0, y + h / 2.0, (w + h) / 4.0))

    return dedupe_circle_candidates(candidates, max(8, approx_pitch * 0.35))


def refine_axis_centers(approx_centers, detected_values, tolerance):
    approx = np.array(approx_centers, dtype=np.float32)
    detected_values = np.array(detected_values, dtype=np.float32)
    matched_mask = np.zeros(len(approx), dtype=bool)
    refined = approx.copy()

    if detected_values.size == 0:
        return refined, matched_mask

    for index, approx_center in enumerate(approx):
        close_values = detected_values[np.abs(detected_values - approx_center) <= tolerance]
        if close_values.size > 0:
            refined[index] = float(np.median(close_values))
            matched_mask[index] = True

    valid_idx = np.where(matched_mask)[0]
    if len(valid_idx) >= 2:
        slope, intercept = np.polyfit(valid_idx, refined[valid_idx], 1)
        fitted = intercept + slope * np.arange(len(approx), dtype=np.float32)
        fitted[valid_idx] = 0.35 * fitted[valid_idx] + 0.65 * refined[valid_idx]
        refined = fitted.astype(np.float32)
    elif len(valid_idx) == 1:
        shift = refined[valid_idx[0]] - approx[valid_idx[0]]
        refined = approx + shift

    refined = np.clip(refined, 0, max(approx[-1] + tolerance, 1))

    for index in range(1, len(refined)):
        if refined[index] <= refined[index - 1]:
            refined[index] = refined[index - 1] + 1.0

    return refined, matched_mask


def build_grid_geometry(gray_img, binary_img, block_name, box, rows, cols):
    ex, ey, ew, eh = expand_box(box, gray_img.shape)
    roi_gray = gray_img[ey:ey + eh, ex:ex + ew]
    roi_bin = binary_img[ey:ey + eh, ex:ex + ew]

    local_left = box["bx"] - ex
    local_top = box["by"] - ey
    approx_pitch_x = box["bw"] / float(max(cols, 1))
    approx_pitch_y = box["bh"] / float(max(rows, 1))

    approx_x_centers = local_left + (np.arange(cols, dtype=np.float32) + 0.5) * approx_pitch_x
    approx_y_centers = local_top + (np.arange(rows, dtype=np.float32) + 0.5) * approx_pitch_y

    approx_pitch = min(approx_pitch_x, approx_pitch_y)
    candidates = detect_circle_candidates(roi_gray, roi_bin, approx_pitch)

    x_centers_local, x_mask = refine_axis_centers(
        approx_x_centers,
        candidates[:, 0] if len(candidates) else np.array([]),
        tolerance=max(10.0, approx_pitch_x * 0.45),
    )
    y_centers_local, y_mask = refine_axis_centers(
        approx_y_centers,
        candidates[:, 1] if len(candidates) else np.array([]),
        tolerance=max(10.0, approx_pitch_y * 0.45),
    )

    x_centers_local = np.clip(x_centers_local, 0, max(ew - 1, 0)).astype(np.float32)
    y_centers_local = np.clip(y_centers_local, 0, max(eh - 1, 0)).astype(np.float32)

    pitch_x = float(np.median(np.diff(x_centers_local))) if cols > 1 else approx_pitch_x
    pitch_y = float(np.median(np.diff(y_centers_local))) if rows > 1 else approx_pitch_y

    center_rx = max(5, int(round(pitch_x * 0.23)))
    center_ry = max(5, int(round(pitch_y * 0.23)))
    cell_half_w = max(center_rx + 4, int(round(pitch_x * 0.36)))
    cell_half_h = max(center_ry + 4, int(round(pitch_y * 0.36)))

    return {
        "block_name": block_name,
        "orig_box": box,
        "expanded_box": {"bx": ex, "by": ey, "bw": ew, "bh": eh},
        "roi_gray": roi_gray,
        "roi_bin": roi_bin,
        "x_centers_local": x_centers_local,
        "y_centers_local": y_centers_local,
        "x_centers_global": x_centers_local + ex,
        "y_centers_global": y_centers_local + ey,
        "pitch_x": pitch_x,
        "pitch_y": pitch_y,
        "center_rx": center_rx,
        "center_ry": center_ry,
        "cell_half_w": cell_half_w,
        "cell_half_h": cell_half_h,
        "circle_candidates": candidates,
        "x_match_count": int(np.sum(x_mask)),
        "y_match_count": int(np.sum(y_mask)),
    }


def score_bubble_at_center(roi_gray, roi_bin, cx, cy, rx, ry):
    h, w = roi_gray.shape[:2]
    x1 = max(0, int(round(cx - rx * 2.2)))
    x2 = min(w, int(round(cx + rx * 2.2 + 1)))
    y1 = max(0, int(round(cy - ry * 2.2)))
    y2 = min(h, int(round(cy + ry * 2.2 + 1)))

    cell_gray = roi_gray[y1:y2, x1:x2]
    cell_bin = roi_bin[y1:y2, x1:x2]
    if cell_gray.size == 0:
        return 0.0, x1, y1, x2, y2

    local_cx = int(round(cx - x1))
    local_cy = int(round(cy - y1))

    inner_mask = np.zeros(cell_gray.shape, dtype=np.uint8)
    core_mask = np.zeros(cell_gray.shape, dtype=np.uint8)

    cv2.ellipse(inner_mask, (local_cx, local_cy), (rx, ry), 0, 0, 360, 255, -1)
    cv2.ellipse(
        core_mask,
        (local_cx, local_cy),
        (max(3, int(round(rx * 0.60))), max(3, int(round(ry * 0.60)))),
        0,
        0,
        360,
        255,
        -1,
    )

    inner_pixels = cell_bin[inner_mask == 255]
    core_bin_pixels = cell_bin[core_mask == 255]
    core_gray_pixels = cell_gray[core_mask == 255]

    if inner_pixels.size == 0 or core_bin_pixels.size == 0 or core_gray_pixels.size == 0:
        return 0.0, x1, y1, x2, y2

    inner_fill = float(np.mean(inner_pixels) / 255.0)
    core_fill = float(np.mean(core_bin_pixels) / 255.0)
    darkness = float(1.0 - (np.mean(core_gray_pixels) / 255.0))

    score = (0.45 * core_fill) + (0.35 * inner_fill) + (0.20 * darkness)
    return score, x1, y1, x2, y2


def classify_row_scores(scores, labels):
    scores = np.array(scores, dtype=np.float32)
    if scores.size == 0:
        return BLANK_LABEL, 0, 0.0, 0.0, 0.0

    max_index = int(np.argmax(scores))
    max_score = float(scores[max_index])
    sorted_scores = np.sort(scores)[::-1]
    second_score = float(sorted_scores[1]) if len(sorted_scores) > 1 else 0.0
    baseline = float(np.median(scores))
    peak_gain = max_score - baseline
    second_gain = second_score - baseline

    if max_score < 0.18 or peak_gain < 0.12:
        return BLANK_LABEL, max_index, max_score, second_score, baseline

    if len(scores) > 1 and second_gain > max(0.10, peak_gain * 0.82):
        return MULTI_LABEL, max_index, max_score, second_score, baseline

    return labels[max_index], max_index, max_score, second_score, baseline


def make_block_debug_image(geometry, row_results, title):
    roi_debug = cv2.cvtColor(geometry["roi_gray"], cv2.COLOR_GRAY2BGR)

    for x, y, r in geometry["circle_candidates"]:
        cv2.circle(roi_debug, (int(round(x)), int(round(y))), int(round(r)), (255, 255, 0), 1)

    for cx in geometry["x_centers_local"]:
        cv2.line(
            roi_debug,
            (int(round(cx)), 0),
            (int(round(cx)), roi_debug.shape[0] - 1),
            (70, 70, 70),
            1,
        )
    for cy in geometry["y_centers_local"]:
        cv2.line(
            roi_debug,
            (0, int(round(cy))),
            (roi_debug.shape[1] - 1, int(round(cy))),
            (70, 70, 70),
            1,
        )

    for row_result in row_results:
        row_index = row_result["row_index"]
        chosen_index = row_result["chosen_index"]
        answer = row_result["answer"]
        color = (120, 120, 120)
        if answer == MULTI_LABEL:
            color = (0, 165, 255)
        elif answer != BLANK_LABEL:
            color = (0, 255, 0)

        for col_index, cell_box in enumerate(row_result["cell_boxes"]):
            x1, y1, x2, y2 = cell_box
            outline = (255, 0, 0) if col_index == chosen_index else (180, 180, 180)
            cv2.rectangle(roi_debug, (x1, y1), (x2, y2), outline, 1)
            cv2.ellipse(
                roi_debug,
                (int(round(geometry["x_centers_local"][col_index])), int(round(geometry["y_centers_local"][row_index]))),
                (geometry["center_rx"], geometry["center_ry"]),
                0,
                0,
                360,
                color,
                1,
            )

        score_text = "/".join(f"{score:.2f}" for score in row_result["scores"])
        text_y = min(roi_debug.shape[0] - 8, int(round(geometry["y_centers_local"][row_index] + geometry["cell_half_h"])))
        cv2.putText(
            roi_debug,
            f"{row_result['display_index']:>2}: {row_result['answer']} [{score_text}]",
            (4, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.36,
            color,
            1,
            cv2.LINE_AA,
        )

    cv2.putText(roi_debug, title, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1, cv2.LINE_AA)
    return roi_debug


def read_choice_grid(gray_img, binary_img, block_name, box, rows, cols, labels, start_index=1, debug_filename=None):
    geometry = build_grid_geometry(gray_img, binary_img, block_name, box, rows, cols)

    print(
        f"[{block_name}] roi={geometry['expanded_box']} shape={geometry['roi_gray'].shape} "
        f"row_h={geometry['pitch_y']:.2f} col_w={geometry['pitch_x']:.2f} "
        f"x_matches={geometry['x_match_count']} y_matches={geometry['y_match_count']}"
    )
    print(f"[{block_name}] x_centers={np.round(geometry['x_centers_global'], 1).tolist()}")
    print(f"[{block_name}] y_centers={np.round(geometry['y_centers_global'], 1).tolist()}")

    outputs = []
    row_results = []

    for row_index in range(rows):
        scores = []
        cell_boxes = []

        cy = geometry["y_centers_local"][row_index]
        for col_index in range(cols):
            cx = geometry["x_centers_local"][col_index]
            score, x1, y1, x2, y2 = score_bubble_at_center(
                geometry["roi_gray"],
                geometry["roi_bin"],
                cx,
                cy,
                geometry["center_rx"],
                geometry["center_ry"],
            )
            scores.append(float(score))
            cell_boxes.append((x1, y1, x2, y2))

        answer, chosen_index, max_score, second_score, baseline = classify_row_scores(scores, labels)
        display_index = start_index + row_index
        print(
            f"[{block_name}] row={display_index} scores={[round(score, 3) for score in scores]} "
            f"baseline={baseline:.3f} max={max_score:.3f} second={second_score:.3f} -> {answer}"
        )

        outputs.append(answer)
        row_results.append({
            "row_index": row_index,
            "display_index": display_index,
            "scores": scores,
            "answer": answer,
            "chosen_index": chosen_index,
            "cell_boxes": cell_boxes,
        })

    if debug_filename:
        debug_img = make_block_debug_image(geometry, row_results, block_name)
        cv2.imwrite(debug_filename, debug_img)

    return outputs, geometry, row_results


def get_student_id(gray_img, binary_img, box):
    digits_order = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
    geometry = build_grid_geometry(gray_img, binary_img, "ID", box, rows=10, cols=5)

    print(
        f"[ID] roi={geometry['expanded_box']} shape={geometry['roi_gray'].shape} "
        f"row_h={geometry['pitch_y']:.2f} col_w={geometry['pitch_x']:.2f}"
    )

    output = ""
    row_labels = [str(index) for index in range(10)]
    _, _, row_results = read_choice_grid(
        gray_img,
        binary_img,
        "ID",
        box,
        rows=10,
        cols=5,
        labels=row_labels,
        start_index=1,
        debug_filename=CELL_DEBUG_FILES["ID"],
    )

    for col_index in range(5):
        col_scores = [row_results[row_index]["scores"][col_index] for row_index in range(10)]
        answer, selected_row, max_score, second_score, baseline = classify_row_scores(col_scores, digits_order)
        print(
            f"[ID] col={col_index + 1} scores={[round(score, 3) for score in col_scores]} "
            f"baseline={baseline:.3f} max={max_score:.3f} second={second_score:.3f} -> {answer}"
        )
        output += "?" if answer in {BLANK_LABEL, MULTI_LABEL} else answer

    return output


def get_booklet_type(gray_img, binary_img, box):
    _, _, _ = read_choice_grid(
        gray_img,
        binary_img,
        "KT",
        box,
        rows=5,
        cols=1,
        labels=CHOICES,
        start_index=1,
        debug_filename=CELL_DEBUG_FILES["KT"],
    )

    # `read_choice_grid` returns one answer per row. For KT we need the strongest row.
    # Recompute directly from the single column to keep the API stable.
    geometry = build_grid_geometry(gray_img, binary_img, "KT", box, rows=5, cols=1)
    row_scores = []
    for row_index in range(5):
        score, _, _, _, _ = score_bubble_at_center(
            geometry["roi_gray"],
            geometry["roi_bin"],
            geometry["x_centers_local"][0],
            geometry["y_centers_local"][row_index],
            geometry["center_rx"],
            geometry["center_ry"],
        )
        row_scores.append(float(score))

    answer, _, _, _, _ = classify_row_scores(row_scores, CHOICES)
    return "?" if answer in {BLANK_LABEL, MULTI_LABEL} else answer


def draw_roi_summary(base_img, geometries):
    debug_img = base_img.copy()

    for label, geometry in geometries.items():
        box = geometry["orig_box"]
        expanded = geometry["expanded_box"]

        cv2.rectangle(
            debug_img,
            (box["bx"], box["by"]),
            (box["bx"] + box["bw"], box["by"] + box["bh"]),
            (0, 255, 255),
            2,
        )
        cv2.rectangle(
            debug_img,
            (expanded["bx"], expanded["by"]),
            (expanded["bx"] + expanded["bw"], expanded["by"] + expanded["bh"]),
            (255, 0, 255),
            1,
        )
        cv2.putText(
            debug_img,
            label,
            (box["bx"], max(18, box["by"] - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 255),
            1,
            cv2.LINE_AA,
        )

        for cx in geometry["x_centers_global"]:
            for cy in geometry["y_centers_global"]:
                cv2.circle(debug_img, (int(round(cx)), int(round(cy))), 2, (0, 0, 255), -1)

    return debug_img


def draw_answer_overlay(base_img, answer_debug):
    debug_img = base_img.copy()
    color_map = {
        "1_10": (0, 255, 255),
        "11_20": (0, 165, 255),
        "21_30": (255, 0, 255),
        "31_40": (0, 255, 0),
        "41_50": (255, 0, 128),
    }

    for block_name, block_data in answer_debug.items():
        geometry = block_data["geometry"]
        color = color_map.get(block_name, (0, 255, 255))

        box = geometry["orig_box"]
        cv2.rectangle(
            debug_img,
            (box["bx"], box["by"]),
            (box["bx"] + box["bw"], box["by"] + box["bh"]),
            color,
            2,
        )
        cv2.putText(
            debug_img,
            block_name,
            (box["bx"], max(18, box["by"] - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            1,
            cv2.LINE_AA,
        )

        for row_result in block_data["rows"]:
            chosen_index = row_result["chosen_index"]
            if row_result["answer"] not in {BLANK_LABEL, MULTI_LABEL}:
                cx = int(round(geometry["x_centers_global"][chosen_index]))
                cy = int(round(geometry["y_centers_global"][row_result["row_index"]]))
                cv2.circle(debug_img, (cx, cy), max(8, geometry["center_rx"] + 2), color, 2)

    return debug_img


# ============================================================================
# API
# ============================================================================

@app.get("/")
def read_root():
    return {"message": f"Optik okuyucu hazir. OpenCV={cv2.__version__}"}


@app.post("/upload")
async def upload_image(photo: UploadFile = File(...)):
    try:
        contents = await photo.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Fotograf okunamadi"}

        cv2.imwrite("gelen_orijinal_foto.jpg", img)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        warped_gray, src_markers, marker_thresh = warp_by_markers(gray)

        if marker_thresh is not None:
            cv2.imwrite("marker_thresh.jpg", marker_thresh)

        if warped_gray is None:
            return {"error": "Dis marker kareleri bulunamadi. Kagidi daha duz ve tam gorunecek sekilde cek."}

        warped_thresh = make_binary_for_reading(warped_gray)
        warped_color = cv2.cvtColor(warped_gray, cv2.COLOR_GRAY2BGR)

        cv2.imwrite("warped_gray.jpg", warped_gray)
        cv2.imwrite("warped_thresh.jpg", warped_thresh)
        cv2.imwrite("oriented_warp.jpg", warped_color)

        detected_kt = get_booklet_type(warped_gray, warped_thresh, KT)
        student_id = get_student_id(warped_gray, warped_thresh, ID_BOX)

        nx, ny, nw, nh = NAME["bx"], NAME["by"], NAME["bw"], NAME["bh"]
        name_crop = warped_gray[ny:ny + nh, nx:nx + nw]
        cv2.imwrite("ogrenci_isim_crop.jpg", name_crop)

        block_outputs = {}
        answer_debug = {}
        roi_geometries = {
            "KT": build_grid_geometry(warped_gray, warped_thresh, "KT", KT, rows=5, cols=1),
            "ID": build_grid_geometry(warped_gray, warped_thresh, "ID", ID_BOX, rows=10, cols=5),
        }

        for block_name, q_start, q_end in SORU_BLOKLARI:
            answers, geometry, row_results = read_choice_grid(
                warped_gray,
                warped_thresh,
                block_name,
                Q[block_name],
                rows=10,
                cols=5,
                labels=CHOICES,
                start_index=q_start,
                debug_filename=CELL_DEBUG_FILES[block_name],
            )
            block_outputs[(q_start, q_end)] = answers
            answer_debug[block_name] = {
                "geometry": geometry,
                "rows": row_results,
            }
            roi_geometries[f"Q{q_start}_{q_end}"] = geometry

        all_answers = []
        for q_start, q_end in sorted(block_outputs.keys()):
            all_answers.extend(block_outputs[(q_start, q_end)])

        roi_debug = draw_roi_summary(warped_color.copy(), roi_geometries)
        cv2.imwrite("roi_debug.jpg", roi_debug)

        answer_overlay = draw_answer_overlay(warped_color.copy(), answer_debug)
        cv2.imwrite("debug_tum_okumalar.jpg", answer_overlay)

        blanks = all_answers.count(BLANK_LABEL)
        multi_marks = all_answers.count(MULTI_LABEL)
        filled = len(all_answers) - blanks - multi_marks

        print(f"Kitapcik Turu : {detected_kt}")
        print(f"Ogrenci ID    : {student_id}")
        print(f"Toplam Cevap  : {len(all_answers)} | Dolu: {filled} | Bos: {blanks} | Hatali: {multi_marks}")
        for index, answer in enumerate(all_answers, 1):
            print(f"  Soru {index:2d}: {answer}")

        name_crop_b64 = image_to_base64("ogrenci_isim_crop.jpg")

        return {
            "message": "Form basariyla okundu",
            "bookletType": detected_kt,
            "studentId": student_id,
            "answers": all_answers,
            "score": 0,
            "correct": 0,
            "wrong": 0,
            "blank": blanks,
            "multiMark": multi_marks,
            "markerCount": 4 if src_markers is not None else 0,
            "nameCropBase64": name_crop_b64,
        }

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return {"error": str(exc)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
