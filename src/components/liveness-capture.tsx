'use client';

import { useEffect, useEffectEvent, useRef, useState } from "react";

type LivenessCaptureProps = {
  onComplete: (result: { score: number; fileName: string; preview: string }) => void;
};

type Challenge = "center" | "left" | "right" | "complete";

export function LivenessCapture({ onComplete }: LivenessCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ estimateFaces: (input: HTMLVideoElement, returnTensors: boolean) => Promise<unknown[]> } | null>(null);
  const frameRef = useRef<number | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge>("center");
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState("Turn the camera on and complete the liveness prompts.");
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFileName, setCapturedFileName] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [assessmentPending, setAssessmentPending] = useState(false);
  const runAssessment = useEffectEvent(() => {
    beginAssessment();
  });

  useEffect(() => {
    return () => {
      stopCamera();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cameraOn || !assessmentPending || !videoRef.current || !streamRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;

    const start = async () => {
      try {
        await video.play();
        runAssessment();
      } catch {
        setError("The camera stream opened, but the preview could not start. Retry the capture.");
      } finally {
        setAssessmentPending(false);
      }
    };

    void start();
  }, [assessmentPending, cameraOn]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraOn(true);
      setAssessmentPending(true);
      setError(null);
      await ensureDetector();
    } catch {
      setError("Camera access was blocked. Allow browser camera permissions to capture the selfie.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    setAssessmentPending(false);
  }

  async function ensureDetector() {
    if (detectorRef.current) return;
    setLoadingModel(true);
    try {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      await tf.setBackend("webgl").catch(() => tf.setBackend("cpu"));
      const blazeface = await import("@tensorflow-models/blazeface");
      detectorRef.current = await blazeface.load();
    } catch {
      setError("Face detection model failed to load. Refresh the page and retry the liveness capture.");
    } finally {
      setLoadingModel(false);
    }
  }

  function beginAssessment() {
    setChallenge("center");
    setScore(0);
    setPassed(false);
    setStatus("Center your face in the frame.");

    const progress = { center: false, left: false, right: false };

    const loop = async () => {
      if (!videoRef.current || !detectorRef.current || !cameraOn) return;
      const faces = await detectorRef.current.estimateFaces(videoRef.current, false);
      const face = normalizeFace(faces[0]);

      if (!face) {
        setStatus("No face detected. Move closer to the camera.");
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      const yaw = estimateYaw(face);
      const centered = isCentered(face, videoRef.current);

      if (!progress.center && centered) {
        progress.center = true;
        setScore(0.35);
        setChallenge("left");
        setStatus("Turn your head slightly to the left.");
      } else if (progress.center && !progress.left && yaw < -0.06) {
        progress.left = true;
        setScore(0.58);
        setChallenge("right");
        setStatus("Now turn your head slightly to the right.");
      } else if (progress.left && !progress.right && yaw > 0.06) {
        progress.right = true;
        const finalScore = calculateLivenessScore(face, videoRef.current);
        setScore(finalScore);
        const dataUrl = captureFrame(videoRef.current);
        const fileName = `selfie-${Date.now()}.jpg`;
        setPreview(dataUrl);
        setCapturedFileName(fileName);
        setChallenge("complete");
        setPassed(finalScore >= 0.75);
        setStatus(finalScore >= 0.75 ? "Liveness passed. You can continue." : "Liveness failed. Retake the selfie.");
        onComplete({ score: finalScore, fileName, preview: dataUrl });
        stopCamera();
        return;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
  }

  return (
    <div className="px-6 py-8">
      <h2 className="text-3xl font-semibold text-[#112a43]">Selfie + Liveness</h2>
      <p className="mt-3 text-lg leading-8 text-[#6c8298]">Use the laptop camera to capture a live selfie and score liveness against the 0.75 threshold.</p>

      <div className="mt-8 rounded-[1.75rem] border border-dashed border-[#b9cadd] bg-[#f8fbfe] p-5">
        {cameraOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="h-72 w-full rounded-[1.25rem] bg-black object-cover" />
        ) : preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Captured selfie" className="h-72 w-full rounded-[1.25rem] object-cover" />
          </>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-[1.25rem] bg-white text-sm text-[#748aa0]">
            Camera preview will appear here.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#17324a]">Challenge: {challenge === "complete" ? "completed" : challenge}</p>
            <p className="mt-1 text-sm text-[#64788f]">{status}</p>
          </div>
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${score >= 0.75 ? "bg-[#dcfce5] text-[#15703d]" : "bg-[#fff3c6] text-[#9d6500]"}`}>
            Liveness score: {score.toFixed(2)}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {!cameraOn ? (
            <button type="button" onClick={startCamera} disabled={loadingModel} className="rounded-full bg-[#0f2f3a] px-5 py-3 text-sm font-semibold text-white disabled:bg-[#8ca1b6]">
              {loadingModel ? "Loading model..." : "Turn Camera On"}
            </button>
          ) : (
            <button type="button" onClick={stopCamera} className="rounded-full border border-[#cbd8e4] px-5 py-3 text-sm font-semibold text-[#29445d]">
              Stop Camera
            </button>
          )}
          {preview && (
            <button type="button" onClick={() => {
              setPreview(null);
              setCapturedFileName(null);
              setPassed(false);
              setScore(0);
              setStatus("Turn the camera on and complete the liveness prompts.");
            }} className="rounded-full border border-[#cbd8e4] px-5 py-3 text-sm font-semibold text-[#29445d]">
              Retake
            </button>
          )}
        </div>

        {capturedFileName && (
          <p className="mt-4 text-sm text-[#64788f]">
            Captured file: <span className="font-semibold text-[#17324a]">{capturedFileName}</span>
          </p>
        )}
        <p className="mt-3 text-sm text-[#64788f]">Rule: fail the KYC case automatically when liveness score is below 0.75.</p>
        {error && <p className="mt-3 text-sm text-[#be2323]">{error}</p>}
        {preview && !passed && <p className="mt-2 text-sm text-[#be2323]">This capture is below the liveness threshold. Retake before continuing.</p>}
      </div>
    </div>
  );
}

type DetectedFace = {
  topLeft: [number, number];
  bottomRight: [number, number];
  landmarks: Array<[number, number]>;
};

function estimateYaw(face: DetectedFace) {
  const [rightEye, leftEye, nose] = face.landmarks;
  if (!leftEye || !rightEye || !nose) return 0;
  const eyeMidpoint = (leftEye[0] + rightEye[0]) / 2;
  const eyeDistance = Math.max(Math.abs(leftEye[0] - rightEye[0]), 1);
  return (nose[0] - eyeMidpoint) / eyeDistance;
}

function isCentered(face: DetectedFace, video: HTMLVideoElement) {
  const width = face.bottomRight[0] - face.topLeft[0];
  const height = face.bottomRight[1] - face.topLeft[1];
  const centerX = face.topLeft[0] + width / 2;
  const centerY = face.topLeft[1] + height / 2;
  const deltaX = Math.abs(centerX - video.videoWidth / 2) / video.videoWidth;
  const deltaY = Math.abs(centerY - video.videoHeight / 2) / video.videoHeight;
  const sizeRatio = width / Math.max(video.videoWidth, 1);
  return deltaX < 0.12 && deltaY < 0.12 && sizeRatio > 0.18;
}

function calculateLivenessScore(face: DetectedFace, video: HTMLVideoElement) {
  const centeredBonus = isCentered(face, video) ? 0.25 : 0.12;
  const width = face.bottomRight[0] - face.topLeft[0];
  const height = face.bottomRight[1] - face.topLeft[1];
  const sizeRatio = width / Math.max(video.videoWidth, 1);
  const sizeBonus = Math.min(0.2, sizeRatio);
  const widthHeightRatio = width / Math.max(height, 1);
  const naturalFaceBonus = widthHeightRatio > 0.55 && widthHeightRatio < 0.95 ? 0.2 : 0.1;
  return Math.min(0.96, Number((0.35 + centeredBonus + sizeBonus + naturalFaceBonus).toFixed(2)));
}

function captureFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  context?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function normalizeFace(face: unknown): DetectedFace | null {
  if (!face || typeof face !== "object") return null;
  const candidate = face as {
    topLeft?: [number, number] | { arraySync?: () => [number, number] };
    bottomRight?: [number, number] | { arraySync?: () => [number, number] };
    landmarks?: Array<[number, number] | { arraySync?: () => [number, number] }>;
  };

  const topLeft = normalizePoint(candidate.topLeft);
  const bottomRight = normalizePoint(candidate.bottomRight);
  const landmarks = (candidate.landmarks ?? []).map(normalizePoint).filter(Boolean) as Array<[number, number]>;

  if (!topLeft || !bottomRight || landmarks.length < 3) return null;

  return {
    topLeft,
    bottomRight,
    landmarks,
  };
}

function normalizePoint(point: [number, number] | { arraySync?: () => [number, number] } | undefined) {
  if (!point) return null;
  if (Array.isArray(point)) return [Number(point[0]), Number(point[1])] as [number, number];
  if (typeof point === "object" && typeof point.arraySync === "function") {
    const value = point.arraySync();
    return [Number(value[0]), Number(value[1])] as [number, number];
  }
  return null;
}
