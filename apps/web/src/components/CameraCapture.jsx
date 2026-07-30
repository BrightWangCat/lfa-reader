import { useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { Button, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { buildUploadPath } from "./cameraNavigation";

const { Text } = Typography;

// 引导框比例：宽:高 = 2:1（横向试剂盒）
const GUIDE_RATIO = 2;
// 引导框占屏幕宽度的比例
const GUIDE_WIDTH_PERCENT = 0.85;

/**
 * 检测当前环境是否支持 getUserMedia（需要安全上下文）
 */
function canUseGetUserMedia() {
  return !!(
    window.isSecureContext &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

/**
 * 全屏相机拍摄页面，带引导框叠加层。
 * 作为独立路由 /camera 使用，不包裹 Layout。
 * 拍摄确认后将图片数据存入 sessionStorage，导航回 /upload。
 */
export default function CameraCapture() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSecure = canUseGetUserMedia();
  const webcamRef = useRef(null);
  const [croppedPreview, setCroppedPreview] = useState(null);
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [useNativeCamera, setUseNativeCamera] = useState(() => !isSecure);

  const [nativeImage, setNativeImage] = useState(null);

  const uploadPath = buildUploadPath(location.search);

  const videoConstraints = useMemo(
    () => ({
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }),
    []
  );

  const handleClose = useCallback(() => {
    navigate(uploadPath, { state: { mode: "single" } });
  }, [navigate, uploadPath]);

  // 实时模式：拍照并裁剪到引导框区域
  const handleCapture = useCallback(() => {
    const webcam = webcamRef.current;
    if (!webcam || !webcam.video) return;

    const video = webcam.video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const containerW = video.clientWidth;
    const containerH = video.clientHeight;

    const videoAspect = vw / vh;
    const containerAspect = containerW / containerH;

    let displayW, displayH, offsetX, offsetY;
    if (videoAspect > containerAspect) {
      displayH = containerH;
      displayW = containerH * videoAspect;
      offsetX = (displayW - containerW) / 2;
      offsetY = 0;
    } else {
      displayW = containerW;
      displayH = containerW / videoAspect;
      offsetX = 0;
      offsetY = (displayH - containerH) / 2;
    }

    const guideW = containerW * GUIDE_WIDTH_PERCENT;
    const guideH = guideW / GUIDE_RATIO;
    const guideLeft = (containerW - guideW) / 2;
    const guideTop = (containerH - guideH) / 2;

    const scale = vw / displayW;
    const srcX = (guideLeft + offsetX) * scale;
    const srcY = (guideTop + offsetY) * scale;
    const srcW = guideW * scale;
    const srcH = guideH * scale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(srcW);
    canvas.height = Math.round(srcH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      video,
      Math.round(srcX),
      Math.round(srcY),
      Math.round(srcW),
      Math.round(srcH),
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCroppedBlob(blob);
        setCroppedPreview(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  }, []);

  // 降级模式：系统相机拍照
  const handleNativeFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setNativeImage(url);
  }, []);

  // 降级模式：裁剪
  const handleNativeCrop = useCallback(() => {
    if (!nativeImage) return;

    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      const guideW = iw * GUIDE_WIDTH_PERCENT;
      const guideH = guideW / GUIDE_RATIO;
      const guideX = (iw - guideW) / 2;
      const guideY = (ih - guideH) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(guideW);
      canvas.height = Math.round(guideH);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        Math.round(guideX),
        Math.round(guideY),
        Math.round(guideW),
        Math.round(guideH),
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setCroppedBlob(blob);
          setCroppedPreview(URL.createObjectURL(blob));
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = nativeImage;
  }, [nativeImage]);

  // 确认：将图片存入 sessionStorage 并导航回 upload 页面
  const handleConfirm = useCallback(() => {
    if (!croppedBlob) return;
    const reader = new FileReader();
    reader.onload = () => {
      sessionStorage.setItem("capturedImage", reader.result);
      navigate(uploadPath, { state: { mode: "single", fromCamera: true } });
    };
    reader.readAsDataURL(croppedBlob);
  }, [croppedBlob, navigate, uploadPath]);

  // 重新拍照
  const handleRetake = useCallback(() => {
    if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    if (nativeImage) URL.revokeObjectURL(nativeImage);
    setCroppedPreview(null);
    setCroppedBlob(null);
    setNativeImage(null);
  }, [croppedPreview, nativeImage]);

  const handleWebcamError = useCallback((err) => {
    console.error("Camera error:", err);
    setCameraError(err?.message || "Camera access failed");
    setUseNativeCamera(true);
  }, []);

  // 裁剪结果预览界面
  if (croppedPreview) {
    return (
      <div style={styles.page}>
        <div style={styles.previewContainer}>
          <div style={styles.previewImageWrap}>
            <img src={croppedPreview} alt="Preview" style={styles.previewImage} />
          </div>
          <div style={styles.previewActions}>
            <Button size="large" onClick={handleRetake} style={styles.retakeBtn}>
              Retake
            </Button>
            <Button
              type="primary"
              size="large"
              onClick={handleConfirm}
              style={styles.confirmBtn}
            >
              Confirm
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 降级模式
  if (useNativeCamera) {
    return (
      <div style={styles.page}>
        <Button
          type="text"
          icon={<CloseOutlined style={{ fontSize: 22, color: "#fff" }} />}
          onClick={handleClose}
          style={styles.closeBtn}
        />

        {!nativeImage ? (
          <div style={styles.nativePromptContainer}>
            {cameraError && (
              <Text style={styles.nativeHint}>
                Live camera is not available (HTTPS required).
                Using system camera instead.
              </Text>
            )}
            {!cameraError && (
              <Text style={styles.nativeHint}>
                Using system camera. Please keep the cassette centered when taking the photo, CLI facing up.
              </Text>
            )}
            <label style={styles.nativeCaptureLabel}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleNativeFile}
                style={{ display: "none" }}
              />
              <div style={styles.nativeCaptureBtn}>
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>
                  Open Camera
                </Text>
              </div>
            </label>
          </div>
        ) : (
          <div style={styles.nativeCropContainer}>
            <Text style={styles.nativeCropHint}>
              The highlighted area will be cropped. Tap Confirm to continue.
            </Text>
            <div style={styles.nativeCropImageWrap}>
              <img src={nativeImage} alt="Captured" style={styles.nativeCropImage} />
              <div style={styles.nativeCropOverlay}>
                <div style={styles.nativeCropGuideBox}>
                  <div style={{ ...styles.corner, ...styles.cornerTL }} />
                  <div style={{ ...styles.corner, ...styles.cornerTR }} />
                  <div style={{ ...styles.corner, ...styles.cornerBL }} />
                  <div style={{ ...styles.corner, ...styles.cornerBR }} />
                </div>
              </div>
            </div>
            <div style={styles.previewActions}>
              <Button size="large" onClick={handleRetake} style={styles.retakeBtn}>
                Retake
              </Button>
              <Button
                type="primary"
                size="large"
                onClick={handleNativeCrop}
                style={styles.confirmBtn}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 实时摄像头模式
  return (
    <div style={styles.page}>
      <Webcam
        ref={webcamRef}
        audio={false}
        videoConstraints={videoConstraints}
        playsInline
        onUserMediaError={handleWebcamError}
        style={styles.webcam}
      />

      <div style={styles.maskLayer}>
        <div style={styles.hintArea}>
          <Text style={styles.hintText}>
            Please place the cassette inside the frame, CLI facing up
          </Text>
        </div>
        <div style={styles.guideBox}>
          <div style={{ ...styles.corner, ...styles.cornerTL }} />
          <div style={{ ...styles.corner, ...styles.cornerTR }} />
          <div style={{ ...styles.corner, ...styles.cornerBL }} />
          <div style={{ ...styles.corner, ...styles.cornerBR }} />
        </div>
      </div>

      <Button
        type="text"
        icon={<CloseOutlined style={{ fontSize: 22, color: "#fff" }} />}
        onClick={handleClose}
        style={styles.closeBtn}
      />

      <div style={styles.captureArea}>
        <button onClick={handleCapture} style={styles.captureBtn} aria-label="Capture">
          <div style={styles.captureBtnInner} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CORNER_SIZE = 24;
const CORNER_WEIGHT = 3;

const styles = {
  // 独立页面：占满整个视口，纯黑背景
  page: {
    width: "100vw",
    height: "100vh",
    backgroundColor: "#000",
    position: "relative",
    overflow: "hidden",
  },

  webcam: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  maskLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  hintArea: {
    marginBottom: 16,
    textAlign: "center",
    padding: "0 24px",
  },

  hintText: {
    color: "#fff",
    fontSize: 15,
    textShadow: "0 1px 4px rgba(0,0,0,0.7)",
    fontWeight: 500,
  },

  guideBox: {
    position: "relative",
    width: `${GUIDE_WIDTH_PERCENT * 100}vw`,
    aspectRatio: `${GUIDE_RATIO}`,
    borderRadius: 12,
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
  },

  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: "#fff",
    borderStyle: "solid",
    borderWidth: 0,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WEIGHT,
    borderLeftWidth: CORNER_WEIGHT,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WEIGHT,
    borderRightWidth: CORNER_WEIGHT,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WEIGHT,
    borderLeftWidth: CORNER_WEIGHT,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WEIGHT,
    borderRightWidth: CORNER_WEIGHT,
    borderBottomRightRadius: 12,
  },

  closeBtn: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  captureArea: {
    position: "absolute",
    bottom: 100,
    left: 0,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    zIndex: 10,
  },

  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    border: "4px solid #fff",
    backgroundColor: "transparent",
    padding: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  captureBtnInner: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    backgroundColor: "#fff",
  },

  previewContainer: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#000",
  },

  previewImageWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    overflow: "hidden",
  },

  previewImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: 8,
    objectFit: "contain",
  },

  previewActions: {
    display: "flex",
    gap: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },

  retakeBtn: {
    minWidth: 120,
    borderColor: "#fff",
    color: "#fff",
    backgroundColor: "transparent",
  },

  confirmBtn: {
    minWidth: 120,
  },

  nativePromptContainer: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 32,
  },

  nativeHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: "1.6",
  },

  nativeCaptureLabel: {
    cursor: "pointer",
  },

  nativeCaptureBtn: {
    width: 160,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2b6cb0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  nativeCropContainer: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 16,
  },

  nativeCropHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    textAlign: "center",
  },

  nativeCropImageWrap: {
    position: "relative",
    flex: 1,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  nativeCropImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },

  nativeCropOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  nativeCropGuideBox: {
    position: "relative",
    width: `${GUIDE_WIDTH_PERCENT * 100}%`,
    aspectRatio: `${GUIDE_RATIO}`,
    borderRadius: 12,
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
  },
};
