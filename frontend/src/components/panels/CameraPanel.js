import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, Camera, CameraOff } from 'lucide-react';

const CameraPanel = ({ onFaceDataCapture, isActive }) => {
  const videoRef = useRef(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [videoVisible, setVideoVisible] = useState(true);
  const [faceLandmarker, setFaceLandmarker] = useState(null);
  const [gestureRecognizer, setGestureRecognizer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestAnimationRef = useRef(null);
  const webcamRunningRef = useRef(false);

  useEffect(() => {
    webcamRunningRef.current = webcamRunning;
  }, [webcamRunning]);

  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs');
        const { GestureRecognizer, FaceLandmarker, FilesetResolver } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          numFaces: 1
        });

        const gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        setFaceLandmarker(landmarker);
        setGestureRecognizer(gestureRecognizer);
        setIsLoading(false);
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        setIsLoading(false);
      }
    };
    
    initializeMediaPipe();
    
    return () => {
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current);
        requestAnimationRef.current = null;
      }
    };
  }, []);

  const updateCameraInput = useCallback(() => {    
    try {
      if (!videoRef.current || !faceLandmarker) {
        requestAnimationRef.current = window.requestAnimationFrame(updateCameraInput);
        return;
      }
      
      const video = videoRef.current;      
      const videoWidth = 160;
      const ratio = video.videoHeight / video.videoWidth;
      video.style.width = videoWidth + "px";
      video.style.height = videoWidth * ratio + "px";
      
      let startTimeMs = performance.now();
      
      try {
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const gestureResults = gestureRecognizer.recognizeForVideo(video, startTimeMs);
        
        if (onFaceDataCapture && faceResults.faceLandmarks) {
          onFaceDataCapture({
            faceLandmarks: faceResults.faceLandmarks,
            gestures: gestureResults.gestures
          });
        }
      } catch (error) {
        console.error("Error in animation frame:", error);
      }
      
      if (webcamRunningRef.current) {
        requestAnimationRef.current = window.requestAnimationFrame(updateCameraInput);
      }
    } catch (error) {
      console.error("Error in animation frame:", error);
    }
  }, [faceLandmarker, gestureRecognizer, onFaceDataCapture]);

  const toggleWebcam = useCallback(async () => {
    if (!faceLandmarker) {
      console.log("Wait! Face landmarker not loaded yet.");
      return;
    }
    
    if (webcamRunning) {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current);
        requestAnimationRef.current = null;
      }
      
      setWebcamRunning(false);
    } else {
      try {
        const constraints = { video: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            requestAnimationRef.current = null;
            updateCameraInput();
          };
        }
        
        setWebcamRunning(true);
      } catch (error) {
        console.error("Error starting webcam:", error);
      }
    }
  }, [faceLandmarker, webcamRunning, updateCameraInput]);

  useEffect(() => {
    if (isActive && !webcamRunning && !isLoading) {
      toggleWebcam();
    } else if (!isActive && webcamRunning) {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      setWebcamRunning(false);
    }
  }, [isActive, isLoading, webcamRunning, toggleWebcam]);
  
  const toggleVideoVisibility = () => {
    setVideoVisible(!videoVisible);
  };

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full p-4 bg-white rounded-lg">
      <div className="mb-4 flex flex-col items-end">
        <div className={`relative w-full max-w-mdborder-gray-300 mb-4 ${!videoVisible && webcamRunning ? 'h-8 overflow-hidden' : ''}`}>
          <video
            ref={videoRef}
            className="w-full"
            autoPlay
            playsInline
            style={{ display: webcamRunning ? 'block' : 'none', opacity: videoVisible ? 1 : 0, position: videoVisible ? 'relative' : 'absolute' }}
          ></video>
        </div>
        
        <div className="flex space-x-2">
          <button
            className={`px-4 py-2 rounded-md text-white ${webcamRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-500 hover:bg-gray-600'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={toggleWebcam}
            disabled={isLoading}
          >
            {webcamRunning ? <CameraOff className="w-5 h-5 align-middle" /> : <Camera className="w-5 h-5 align-middle" />}
          </button>
          
          {webcamRunning && (
            <button
              className="px-4 py-2 rounded-md text-white bg-gray-500 hover:bg-gray-600"
              onClick={toggleVideoVisibility}
            >
              {videoVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraPanel;