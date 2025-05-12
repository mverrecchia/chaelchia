import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, WifiOff, Power, Music, Activity, Play, Pause, Waves, Brush, ArrowLeft, Camera, LightbulbOff, Lightbulb, Info, Volume2, VolumeX, Lock, Unlock, Square } from 'lucide-react';
import { useMQTT } from '../contexts/MQTTClient';
import { getWallflowerConfigFromDatabase, saveWallflowerConfigToDatabase } from '../services/api';
import { getStoolConfigFromDatabase, saveStoolConfigToDatabase } from '../services/api';
import { getFlipFrameConfigFromDatabase, saveFlipFrameConfigToDatabase } from '../services/api';
import { getDiscoKnobConfigFromDatabase, saveDiscoKnobConfigToDatabase } from '../services/api';
import { getLightSwitchConfigFromDatabase, saveLightSwitchConfigToDatabase } from '../services/api';

import SceneManager from '../pages/shared/SceneManager';

import WallFlowerVisualization from '../pages/shared/WallFlowerVisualization';
import StoolVisualization from '../pages/shared/StoolVisualization';
import FlipDiscVisualization from '../pages/shared/FlipDiscVisualization';
import NeonVisualization from './shared/NeonVisualization.js';
import DiscoKnobVisualization from './shared/DiscoKnobVisualization.js';

import ProfilePanel from '../components/panels/ProfilePanel';
import AudioConfigPanel from '../components/panels/AudioConfigPanel';
import ManualControlPanel from '../components/panels/ManualControlPanel';
import PatternPanel from '../components/panels/PatternPanel';
import DrawPanel from '../components/panels/DrawPanel';
import CameraPanel from '../components/panels/CameraPanel';
import DiscoPanel from '../components/panels/DiscoPanel';

import * as THREE from 'three';

const UnifiedDashboard = () => {
  const sceneManagerRef = useRef(null);
  const wallFlowerRef = useRef(null);
  const stoolRef = useRef(null);
  const flipFrameRef = useRef(null);
  const neonRef = useRef(null);
  const discoKnobRef = useRef(null);
  const lightSwitchHitboxRef = useRef(null);
  
  // WallFlower 
  const wallFlowerNumControllers = 3;
  const [wallFlowerAudioManager, setWallFlowerAudioManager] = useState(null);
  const [isWallFlowerAudioPlaying, setIsWallFlowerAudioPlaying] = useState(false);
  const [wallFlowerConnected, setWallflowerConnected] = useState(false);
  
  // Stool
  const stoolNumControllers = 1;
  const [stoolAudioManager, setStoolAudioManager] = useState(null);
  const [isStoolAudioPlaying, setIsStoolAudioPlaying] = useState(false);
  const [stoolConnected, setStoolConnected] = useState(false);

  // FlipFrame
  const gridSize = 28;
  const [patternRequest, setPatternRequest] = useState(null)
  const [drawGridData, setDrawGridData] = useState(Array(gridSize).fill().map(() => Array(gridSize).fill(0)));
  const [cameraData, setCameraData] = useState(null);
  const [flipframeConnected, setFlipframeConnected] = useState(false);
  
  // Neon state
  // TBD

  // Discoknob
  const [discoData, setDiscoData] = useState(null);
  const [discoConnected, setDiscoConnected] = useState(false);
  
  const [lightingEnabled, setLightingEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const currentInfoProjectRef = useRef(null);

  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  
  const { 
    mqttConnected,
    stoolManagerState,
    wallflowerManagerState,
    flipdiscManagerState,
    discoKnobManagerState,
    lastMessages,
    deviceLocks,
    requestDeviceLock,
    releaseDeviceLock,
    hasValidClientId
  } = useMQTT();

  const connectionCheckIntervalRef = useRef(null);

  useEffect(() => {
    const checkConnections = () => {
      const currentTime = Date.now();
      const TIMEOUT = 3000;

      try {
        const wallflowerStatus = lastMessages[`wallflower/manager/status`];
        const wallflowerActive = wallflowerStatus?.payload?.status === 'online' &&
          wallflowerStatus?.timestamp && (currentTime - wallflowerStatus.timestamp < TIMEOUT);
        setWallflowerConnected(wallflowerActive || false);

        const stoolStatus = lastMessages[`stool/manager/status`];
        const stoolActive = stoolStatus?.payload?.status === 'online' &&
          stoolStatus?.timestamp && (currentTime - stoolStatus.timestamp < TIMEOUT);
        setStoolConnected(stoolActive || false);

        const flipframeStatus = lastMessages[`flip/manager/status`];
        const flipframeActive = flipframeStatus?.payload?.status === 'online' &&
          flipframeStatus?.payload?.timestamp && (currentTime - (flipframeStatus.payload.timestamp * 1000) < TIMEOUT);
        setFlipframeConnected(flipframeActive || false);

        const discoknobStatus = lastMessages['smartknob/manager/status'];
        const discoknobActive = discoknobStatus?.payload?.status === 'online' &&
          discoknobStatus?.timestamp && (currentTime - discoknobStatus.timestamp < TIMEOUT);
        setDiscoConnected(discoknobActive || false);
      } catch (error) {
        console.error('Error checking connection status:', error);
      }
    };

    checkConnections();

    if (connectionCheckIntervalRef.current) {
      clearInterval(connectionCheckIntervalRef.current);
    }

    // check every second
    connectionCheckIntervalRef.current = setInterval(checkConnections, 1000);

    return () => {
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
        connectionCheckIntervalRef.current = null;
      }
    };
  }, [mqttConnected, lastMessages, stoolManagerState, wallflowerManagerState, flipdiscManagerState, discoKnobManagerState]);
  
  useEffect(() => {
    const loadLightingState = async () => {
      try {
        const lightsOn = await getLightSwitchConfigFromDatabase();
        setLightingEnabled(lightsOn);
        if (sceneManagerRef.current) {
          sceneManagerRef.current.setLighting(lightsOn);
        }
      } catch (error) {
        console.error('Error loading lighting state:', error);
      }
    };
    
    loadLightingState();
  }, []);

  useEffect(() => {
    if (!sceneManagerRef.current) return;

    const scene = sceneManagerRef.current.scene;
    if (!scene) return;

    // create light switch hitbox for the room
    const lightSwitchHitbox = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.13),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: false
      })
    );
    lightSwitchHitbox.position.set(-1.725, 2.31, 2.545);
    lightSwitchHitbox.rotation.set(0, Math.PI/2, 0);
    lightSwitchHitbox.userData = {
      isHitbox: true,
      projectId: 'lightswitch',
      isHovered: false
    };

    scene.add(lightSwitchHitbox);
    lightSwitchHitboxRef.current = lightSwitchHitbox;

    // Add click handler
    const handleClick = async (event) => {
      if (!sceneManagerRef.current) return;
      
      const raycaster = sceneManagerRef.current.raycaster;
      const camera = sceneManagerRef.current.camera;
      const container = sceneManagerRef.current.container;
      
      if (!raycaster || !camera || !container) return;

      const mouse = new THREE.Vector2(
        (event.clientX / container.clientWidth) * 2 - 1,
        -(event.clientY / container.clientHeight) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(lightSwitchHitbox);

      if (intersects.length > 0) {
        const newLightingState = !lightingEnabled;
        setLightingEnabled(newLightingState);
        
        if (sceneManagerRef.current) {
          sceneManagerRef.current.setLighting(newLightingState);
        }

        try {
          await saveLightSwitchConfigToDatabase(newLightingState);
        } catch (error) {
          console.error('Error saving lighting state:', error);
        }
      }
    };

    const container = sceneManagerRef.current.container;
    if (container) {
      container.addEventListener('click', handleClick);
    }

    return () => {
      if (container) {
        container.removeEventListener('click', handleClick);
      }
      if (scene && lightSwitchHitbox) {
        scene.remove(lightSwitchHitbox);
      }
    };
  }, [lightingEnabled]);

  const returnToOverview = useCallback(() => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.focusOn(null);
    }
    setActiveProject(null);
    setActiveTab(null);
    setShowInfoModal(false);
  }, []);

  const toggleGlobalAudio = useCallback(() => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.muted = newMutedState;
    });
    
    if (newMutedState) {
      if (wallFlowerAudioManager && isWallFlowerAudioPlaying) {
        wallFlowerAudioManager.stop();
        setIsWallFlowerAudioPlaying(false);
      }
      if (stoolAudioManager && isStoolAudioPlaying) {
        stoolAudioManager.stop();
        setIsStoolAudioPlaying(false);
      }
    }
    
    if (flipFrameRef.current) {
      const manager = flipFrameRef.current.getManager();
      if (manager && typeof manager.toggleSound === 'function') {
        manager.toggleSound(!newMutedState);
      }
    }
  }, [isMuted, wallFlowerAudioManager, isWallFlowerAudioPlaying, stoolAudioManager, isStoolAudioPlaying]);

  const toggleLighting = useCallback(async () => {
    const newLightingState = !lightingEnabled;
    setLightingEnabled(newLightingState);
    
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setLighting(newLightingState);
    }

    try {
      await saveLightSwitchConfigToDatabase(newLightingState);
    } catch (error) {
      console.error('Error saving lighting state:', error);
    }
  }, [lightingEnabled]);
  
  const handleFocusChange = useCallback((projectId, isHitbox = false) => {    
    if (projectId) {
      setActiveProject(projectId);
      
      if (isHitbox) {
        if (currentInfoProjectRef.current === projectId) {
          setShowInfoModal(prev => !prev);
        } else {
          currentInfoProjectRef.current = projectId;
          setShowInfoModal(true);
        }
      }
    } else {
      setActiveProject(null);
      currentInfoProjectRef.current = null;
      setShowInfoModal(false);
    }
  }, []); 

  const toggleTab = useCallback((tabName) => {
    if (activeTab === tabName) {
      setActiveTab(null);
    } else {
      setActiveTab(tabName);
    }
  }, [activeTab]);
  
  const handleWallFlowerManagerInitialized = useCallback((manager) => {
    if (manager && manager.audioAnalyzer) {
      setWallFlowerAudioManager(manager.audioAnalyzer);
      setIsWallFlowerAudioPlaying(manager.audioAnalyzer.isPlaying);
    }
  }, []);

  const toggleWallFlowerAudio = useCallback(() => {
    if (!wallFlowerAudioManager) return;
    
    if (isWallFlowerAudioPlaying) {
      wallFlowerAudioManager.stop();
      setIsWallFlowerAudioPlaying(false);
    } else {
      wallFlowerAudioManager.play();
      setIsWallFlowerAudioPlaying(true);
    }
  }, [wallFlowerAudioManager, isWallFlowerAudioPlaying]);

  const handleWallFlowerManualControl = useCallback((controller, index) => {
    const manager = wallFlowerRef.current?.getManager();
    if (!manager) {
        console.warn('WallFlower manager not available');
        return;
    }
    
    try {
        manager.handleManualRequest(controller, index);
    } catch (error) {
        console.error('Error handling wallflower manual control:', error);
    }
  }, []);

  const handleWallFlowerProfileControl = useCallback((profileData) => {
      const manager = wallFlowerRef.current?.getManager();
      if (!manager) {
          console.warn('WallFlower manager not available');
          return;
      }
      
      try {
          manager.handleProfileRequest(profileData);
      } catch (error) {
          console.error('Error handling wallflower profile control:', error);
      }
  }, []);
  
  const handleWallFlowerAudioControl = useCallback((audioData) => {
      const manager = wallFlowerRef.current?.getManager();
      if (!manager) {
          console.warn('WallFlower manager not available');
          return;
      }
      
      try {
          manager.handleAudioConfigRequest(audioData);
      } catch (error) {
          console.error('Error handling wallflower audio control:', error);
      }
  }, []);

  const handleStoolManagerInitialized = useCallback((manager) => {
    if (manager && manager.audioAnalyzer) {
      setStoolAudioManager(manager.audioAnalyzer);
      setIsStoolAudioPlaying(manager.audioAnalyzer.isPlaying);
    }
  }, []);

  const toggleStoolAudio = useCallback(() => {
    if (!stoolAudioManager) return;
    
    if (isStoolAudioPlaying) {
      stoolAudioManager.stop();
      setIsStoolAudioPlaying(false);
    } else {
      stoolAudioManager.play();
      setIsStoolAudioPlaying(true);
    }
  }, [stoolAudioManager, isStoolAudioPlaying]);

  const handleStoolManualControl = useCallback((controller, index) => {
    const manager = stoolRef.current?.getManager();
    if (!manager) {
        console.warn('Stool manager not available');
        return;
    }
    
    try {
        manager.handleManualRequest(controller, index);
    } catch (error) {
        console.error('Error handling stool manual control:', error);
    }
}, []);

const handleStoolProfileControl = useCallback((profileData) => {
    const manager = stoolRef.current?.getManager();
    if (!manager) {
        console.warn('Stool manager not available');
        return;
    }
    
    try {
        manager.handleProfileRequest(profileData);
    } catch (error) {
        console.error('Error handling stool profile control:', error);
    }
}, []);

const handleStoolAudioControl = useCallback((audioData) => {
    const manager = stoolRef.current?.getManager();
    if (!manager) {
        console.warn('Stool manager not available');
        return;
    }
    
    try {
        manager.handleAudioConfigRequest(audioData);
    } catch (error) {
        console.error('Error handling stool audio control:', error);
    }
}, []);
  
  const handleDrawSubmit = useCallback((grid) => {
    setDrawGridData(grid);
  }, [patternRequest]);

  const handlePatternSelected = useCallback((pattern) => {
    setPatternRequest({
      id: pattern.id,
      name: pattern.name,
      enable: pattern.name !== null,
      speed: pattern.speed || 2.0,
      params: pattern.params || {}
    });
  }, []);

  const handleFaceDataCapture = useCallback((faceData) => {
    setCameraData({
      faceLandmarks: faceData.faceLandmarks,
      gestures: faceData.gestures
    });
  }, []);

const handleDiscoKnobManagerInitialized = useCallback((manager) => {
  if (manager) {
    // placeholder, nothing for now
  }
}, []);

  const handleDiscoManualControl = useCallback((controlData) => {
    setDiscoData({
      rotation: {
        enabled: controlData.rotation.enabled,
        speed: controlData.rotation.speed,
        direction: controlData.rotation.direction
      },
      spotlights: {
        enabled: controlData.spotlights.enabled,
        color: controlData.spotlights.color,
        mode: controlData.spotlights.mode,
        mode_speed: controlData.spotlights.mode_speed
      }
    });
  }, []);

  const renderProjectInfoModal = () => {
    if (!showInfoModal) return null;
    
    return (
      <div className="fixed left-6 top-6 w-[450px] bg-white shadow-lg rounded-xl z-20">
        <div className="p-6">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-base font-medium text-gray-600">
              chaelchia
            </h2>
            <button 
              onClick={() => setShowInfoModal(false)}
              className="text-gray-500 hover:text-gray-700"
            >
            </button>
          </div>
          
          <h3 className="text-xl  mb-4 flex items-baseline gap-2">
            <span className="font-semibold italic">
              {activeProject === 'wallflower' && 'WallFlower,'}
              {activeProject === 'stool' && 'StoolTwo,'}
              {activeProject === 'flipframe' && 'FlipFrame,'}
              {activeProject === 'neon' && 'Neon Displays,'}
              {activeProject === 'discoKnob' && 'DiscoKnob,'}
            </span>
            <span className="text-xl">
              {activeProject === 'wallflower' && '2025'}
              {activeProject === 'stool' && '2024'}
              {activeProject === 'flipframe' && '2024'}
              {activeProject === 'neon' && '2023-2025'}
              {activeProject === 'discoKnob' && '2025'}
            </span>
          </h3>
          {activeProject === 'wallflower' && (
             <div className="mt-2 text-gray-800">
              <ul className="list-none font-semibold pl-0 space-y-1 text-sm">
                 <li>NeonRotator (x3), borosilicate glass, argon</li>
               </ul>
              <ul className="list-none pl-0 space-y-1 text-sm">
                <li>Neon can flicker, neon can dim, but how often does it rotate? Through the use of NeonRotators, WallFlower delivers a kinetic flare to what is typically a static medium.</li>
              </ul>
              <p><a href="https://github.com/mverrecchia/wallflower" className="italic text-blue-500 hover:underline">Github</a></p>
            </div>
          )}
          
          {activeProject === 'stool' && (
            <div className="mt-2 text-gray-800">
               <ul className="list-none font-semibold pl-0 space-y-1 text-sm">
                <li>NeonBox, galvanized steel, borosilicate glass, neon</li>
              </ul>
              <ul className="list-none pl-0 space-y-1 text-sm">
                <li>As the first installment of "Why is everything...neon?", this was an experiment in integrating neon into everyday objects, enabling an imagination of how the world could otherwise look.</li>
              </ul>
              <p><a href="https://github.com/mverrecchia/stool" className="italic text-blue-500 hover:underline">Github</a></p>
            </div>
          )}
          
          {activeProject === 'flipframe' && (
            <div className="mt-2 text-gray-800">
              <ul className="list-none font-semibold pl-0 space-y-1 text-sm">
                <li>AlfaZeta XY5 (x2), RPI5, plywood, PLA, acrylic</li>
              </ul>
              <ul className="list-none pl-0 space-y-1 text-sm">
                <li>Draw on it, use it as a mirror, admire from afar - FlipFrame is intended to bring any wall to life with it's interactivity.</li>
              </ul>
              <p><a href="https://github.com/mverrecchia/flipframe" className="italic text-blue-500 hover:underline">Github</a></p>
            </div>
          )}
          {activeProject === 'neon' && (
            <div className="mt-2 text-gray-800">
              <ul className="list-none font-semibold pl-0 space-y-1 text-sm">
                <li>Borosilicate glass, argon, neon</li>
              </ul>
              <ul className="list-none pl-0 space-y-1 text-sm">
                <li>This is a collection of pieces made over the last few years. Today, they live either in my home or in other's.</li>
              </ul>
              <p className="mt-6 text-sm italic text-gray-600">
                Coming soon...
              </p>
            </div>
          )}
          {activeProject === 'discoKnob' && (
            <div className="mt-2 text-gray-800">
              <ul className="list-none font-semibold pl-0 space-y-1 text-sm">
                <li>Smartknob, PLA</li>
              </ul>
              <ul className="list-none pl-0 space-y-1 text-sm">
                <li>A repackaged and reenvisioned take on Scott Bezek's/Seeed Studio's SmartKnob - this Nest-like wall switch serves primarily as a remote control for the living room's discoball. </li>
              </ul>
              <p><a href="https://github.com/mverrecchia/discoknob" className="italic text-blue-500 hover:underline">Github</a></p>
            </div>
          )}
        </div>
      </div>
    );
  };

const renderWelcomeModal = () => {
   if (!showWelcomeModal) return null;
   
   return (
     <div 
       className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-30"
       onClick={(e) => {
         if (e.target === e.currentTarget) {
           setShowWelcomeModal(false);
         }
       }}
     >
       <div className="bg-white rounded-xl shadow-lg w-[500px] mx-4">
         <div className="p-6">
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-2xl font-semibold">Welcome!</h2>
           </div>
           
           <div className="space-y-4 text-gray-600">
              <p>This is an in-progress showcase of a few projects I've worked on in the last few months.</p>
              <p>Click on the glowing <Square className="w-5 h-5 inline-block align-middle" />'s to bring a project into focus, and navigate through the panels to interact with it.</p>
              <p><span className="font-bold">Added bonus:</span> you're controlling the actual hardware!</p>
              <p className="font-bold">Navigation controls:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Left click + drag to rotate</li>
                <li>Right click + drag to pan</li>
                <li>Scroll to zoom</li>
              </ul>
              <p className="font-bold">Notable buttons:</p>
              <p><Lightbulb className="w-5 h-5 inline-block align-middle" /> Switch the lights on and off</p>
              <p><ArrowLeft className="w-5 h-5 inline-block align-middle" /> Return to the room view</p>
              <p><Lock className="w-5 h-5 inline-block align-middle" /> Lock device for exclusive device control</p>
              <p><a href="https://github.com/mverrecchia/chaelchia" className="italic text-blue-500 hover:underline">Github</a></p>
           </div>
         </div>
       </div>
     </div>
    );
  };

  const renderControlTabs = () => {
    if (!activeProject) return null;

    const renderConnectionStatus = () => {
      let deviceType = null;
      
      if (activeProject === 'wallflower') deviceType = 'wallflower';
      else if (activeProject === 'stool') deviceType = 'stool';
      else if (activeProject === 'flipframe') deviceType = 'flipframe';
      else if (activeProject === 'discoKnob') deviceType = 'discoKnob';
      
      const deviceLock = deviceType ? deviceLocks[deviceType] : null;
      
      return (
        <>
            <div className="flex flex-col items-center justify-center w-11 h-10">
              {mqttConnected ? 
                <Wifi className="w-5 h-5 text-blue-500" /> : 
                <WifiOff className="w-5 h-5 text-red-500" />
              }
              <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>MQTT</span>
            </div>

            {activeProject === 'wallflower' && (
              <div className="flex flex-col items-center justify-center w-11 h-10">
                {wallFlowerConnected ? 
                  <Wifi className="w-5 h-5 text-blue-500" /> : 
                  <WifiOff className="w-5 h-5 text-red-500" />
                }
                <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>ESP32</span>
              </div>
            )}
            {activeProject === 'stool' && (
              <div className="flex flex-col items-center justify-center w-11 h-10">
                {stoolConnected ? 
                  <Wifi className="w-5 h-5 text-blue-500" /> : 
                  <WifiOff className="w-5 h-5 text-red-500" />
                }
                <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>ESP32</span>
              </div>
            )}
            {activeProject === 'flipframe' && (
              <div className="flex flex-col items-center justify-center w-11 h-10">
                {flipframeConnected ? 
                  <Wifi className="w-5 h-5 text-blue-500" /> : 
                  <WifiOff className="w-5 h-5 text-red-500" />
                }
                <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>RPI</span>
              </div>
            )}
            {activeProject === 'discoKnob' && (
              <div className="flex flex-col items-center justify-center w-11 h-10">
                {discoConnected ? 
                  <Wifi className="w-5 h-5 text-blue-500" /> : 
                  <WifiOff className="w-5 h-5 text-red-500" />
                }
                <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>ESP32</span>
              </div>
            )}

            {deviceType && deviceLock && hasValidClientId && (
              <div className="flex flex-col items-center justify-center w-11 h-10" 
                   onClick={() => {
                     // check if we own the lock
                     if (deviceLock.isOwner && deviceLock.locked) {
                       const success = releaseDeviceLock(deviceType);
                     } 
                     // if device is locked by another user or not locked at all, try to acquire it
                     else {
                       const success = requestDeviceLock(deviceType);
                     }
                   }}
                   title={deviceLock.locked 
                    ? (deviceLock.isOwner ? "You control this device - click to release" : "Device locked by another user - click to request access") 
                    : "Device is available - click to lock for your exclusive use"}
                   style={{cursor: 'pointer'}}
              >
                {deviceLock.locked ? (
                  deviceLock.isOwner ? (
                    <Lock className="w-5 h-5 text-green-500" />  // we own the lock
                  ) : (
                    <Lock className="w-5 h-5 text-red-500" />    // someone else owns the lock
                  )
                ) : (
                  <Unlock className="w-5 h-5 text-blue-500" />   // available
                )}
                <span className={`text-sm ${lightingEnabled ? "text-white" : "text-black-600"}`}>
                  {deviceLock.locked 
                    ? (deviceLock.isOwner ? "Yours!" : "Locked") 
                    : "Free"}
                </span>
              </div>
            )}
            {/* Show loading message when still waiting for client ID */}
            {deviceType && deviceLock && !hasValidClientId && (
              <div className="flex flex-col items-center justify-center w-11 h-10">
                <div className="animate-pulse">
                  <Lock className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-sm text-gray-400">loading</span>
              </div>
            )}
        </>
      );
    };
    switch (activeProject) {
      case 'wallflower':
        return (
          <div className="fixed top-0 right-0 p-6">
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => toggleTab('manual')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'manual' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Power className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('profile')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'profile' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Activity className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('audio')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'audio' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Music className="w-5 h-5" />
              </button>
              {wallFlowerAudioManager && (
                <button 
                  onClick={toggleWallFlowerAudio}
                  className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100"
                >
                  {isWallFlowerAudioPlaying ? (<Pause className="w-5 h-5" />) : (<Play className="w-5 h-5" />)}
                </button>
              )}
              <button
                onClick={returnToOverview}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100 mt-6"
                >
                <ArrowLeft className="h-5 w-5" />
               </button>
               <div className="h-1" />
               {renderConnectionStatus()}
            </div>
          </div>
        );
      
      case 'stool':
        return (
          <div className="fixed top-0 right-0 p-6">
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => toggleTab('manual')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'manual' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Power className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('profile')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'profile' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Activity className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('audio')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'audio' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Music className="w-5 h-5" />
              </button>
              {stoolAudioManager && (
              <button 
                onClick={toggleStoolAudio}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100"
                >
                {isStoolAudioPlaying ? (<Pause className="w-5 h-5" />) : (<Play className="w-5 h-5" />)}
                </button>
                )}
              <button
                onClick={returnToOverview}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100 mt-6"
                >
                <ArrowLeft className="h-5 w-5" />
               </button>
               <div className="h-1" />
               {renderConnectionStatus()}
            </div>
          </div>
        );
      
      case 'flipframe':
        return (
          <div className="fixed top-0 right-0 p-6">
          <div className="flex flex-col space-y-2 items-center" style={{ width: '44px' }}>
              <button 
                onClick={() => toggleTab('pattern')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                    activeTab === 'pattern' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Waves className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('draw')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'draw' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Brush className="w-5 h-5" />
              </button>
              <button 
                onClick={() => toggleTab('camera')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'camera' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                onClick={returnToOverview}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100 mt-6"
                >
                <ArrowLeft className="h-5 w-5" />
               </button>
               <div className="h-1" />
               {renderConnectionStatus()}
            </div>
          </div>
        );

      case 'discoKnob':
        return (
          <div className="fixed top-0 right-0 p-6">
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => toggleTab('manual')}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-center ${
                  activeTab === 'manual' 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-gray-500 border-gray-300'
                }`}
              >
                <Power className="w-5 h-5" />
              </button>
              <button
                onClick={returnToOverview}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100 mt-6"
                >
                <ArrowLeft className="h-5 w-5" />
               </button>
               <div className="h-1" />
               {renderConnectionStatus()}
            </div>
          </div>
        );

      case 'neon':
        return (
          <div className="fixed top-0 right-0 p-6">
            <div className="flex flex-col space-y-2">
            <button
                onClick={returnToOverview}
                className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center bg-white text-gray-500 border-gray-300 hover:bg-gray-100 mt-6"
                >
                <ArrowLeft className="h-5 w-5" />
               </button>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  const renderControlPanel = () => {
    if (!activeTab) return null;

    return (
      <div className="fixed top-0 right-0 mt-6 mr-20">
        <div className="bg-white rounded-xl shadow-lg p-6" style={{ width: 'auto', maxWidth: '100%', minHeight: '400px', maxHeight: 'calc(100vh - 10rem)' }}>
          {/* Controller Status Row for WallFlower */}
          {['wallflower'].includes(activeProject) && (
            <div className="grid grid-cols-3 gap-1 mb-4">
              {Array(wallFlowerNumControllers).fill(0).map((_, index) => {
                const wallflowerStatus = lastMessages['wallflower/manager/status'];
                return (
                  <div key={index} className="text-sm font-medium text-center text-gray-700 flex items-center justify-center">
                    {wallFlowerConnected && 
                     wallflowerStatus?.payload?.controllers && wallflowerStatus.payload.controllers[index]?.connected ? (
                      <>
                        <Wifi className="w-6 h-6 mr-2 text-blue-500" />
                        {wallflowerStatus.payload.controllers[index]?.mac || ''}
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-6 h-6 mr-3 text-red-500" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Panel content based on active project and tab */}
          <div className="flex-1" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
            {/* Lock Status Notification */}
            {(() => {
              let deviceType = null;
              if (activeProject === 'wallflower') deviceType = 'wallflower';
              else if (activeProject === 'stool') deviceType = 'stool';
              else if (activeProject === 'flipframe') deviceType = 'flipframe';
              else if (activeProject === 'discoKnob') deviceType = 'discoKnob';
              const deviceLock = deviceType && deviceLocks ? deviceLocks[deviceType] : null;
              
              // Camera data doesn't pass through to the hardware
              if (activeTab === 'camera') {
                return null;
              }
              
              if (deviceLock?.locked && !deviceLock?.isOwner) {
                return (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600">
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5" />
                      <p className="text-sm">
                        Device locked! Commands will update webpage only, not the device
                      </p>
                    </div>
                  </div>
                );
              }
              else if (!deviceLock?.locked) {
                return (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-600">
                    <div className="flex items-center gap-2">
                      <p className="text-sm"> Press <Unlock className="w-5 h-5 inline-block" /> for exclusive device control</p>
                    </div>
                  </div>
                );
              }
              else {
                return null;
              }
            })()}
            
            {/* WallFlower Panels */}
            {activeProject === 'wallflower' && activeTab === 'manual' && (
                <ManualControlPanel 
                    onSubmit={handleWallFlowerManualControl}
                    numControllers={wallFlowerNumControllers}
                    getConfigFromDatabase={getWallflowerConfigFromDatabase}
                    saveConfigToDatabase={saveWallflowerConfigToDatabase}
                    configType="wallflower"
                    features={["supply0", "supply1", "motor"]}
                    managerState={wallflowerManagerState}
                    isActive={true}
                />
            )}

            {activeProject === 'wallflower' && activeTab === 'profile' && (
                <ProfilePanel 
                    onSubmit={handleWallFlowerProfileControl}
                    numControllers={wallFlowerNumControllers}
                    getConfigFromDatabase={getWallflowerConfigFromDatabase}
                    saveConfigToDatabase={saveWallflowerConfigToDatabase}
                    configType="wallflower"
                    isActive={true}
                />
            )}

            {activeProject === 'wallflower' && activeTab === 'audio' && (
                <AudioConfigPanel 
                    onSubmit={handleWallFlowerAudioControl}
                    numControllers={wallFlowerNumControllers}
                    getConfigFromDatabase={getWallflowerConfigFromDatabase}
                    saveConfigToDatabase={saveWallflowerConfigToDatabase}
                    configType="wallflower"
                    audioAnalyzer={wallFlowerAudioManager}
                    isActive={true}
                />
            )}
                        
            {/* Stool Panels */}
            {activeProject === 'stool' && activeTab === 'manual' && (
                <ManualControlPanel 
                    onSubmit={handleStoolManualControl}
                    numControllers={stoolNumControllers}
                    getConfigFromDatabase={getStoolConfigFromDatabase}
                    saveConfigToDatabase={saveStoolConfigToDatabase}
                    configType="stool"
                    features={["supply0", "supply1"]}
                    managerState={stoolManagerState}
                    isActive={true}
                />
            )}

            {activeProject === 'stool' && activeTab === 'profile' && (
                <ProfilePanel 
                    onSubmit={handleStoolProfileControl}
                    numControllers={stoolNumControllers}
                    getConfigFromDatabase={getStoolConfigFromDatabase}
                    saveConfigToDatabase={saveStoolConfigToDatabase}
                    configType="stool"
                    isActive={true}
                />
            )}

            {activeProject === 'stool' && activeTab === 'audio' && (
                <AudioConfigPanel 
                    onSubmit={handleStoolAudioControl}
                    numControllers={stoolNumControllers}
                    getConfigFromDatabase={getStoolConfigFromDatabase}
                    saveConfigToDatabase={saveStoolConfigToDatabase}
                    configType="stool"
                    audioAnalyzer={stoolAudioManager}
                    isActive={true}
                />
            )}
            
            {/* FlipFrame Panels */}
            {activeProject === 'flipframe' && activeTab === 'draw' && (
              <DrawPanel 
                onSubmit={handleDrawSubmit}
                getConfigFromDatabase={getFlipFrameConfigFromDatabase}
                saveConfigToDatabase={saveFlipFrameConfigToDatabase}
                isActive={true}
              />
            )}
            
            {activeProject === 'flipframe' && activeTab === 'pattern' && (
              <PatternPanel 
                onSubmit={handlePatternSelected}
                getConfigFromDatabase={getFlipFrameConfigFromDatabase}
                saveConfigToDatabase={saveFlipFrameConfigToDatabase}
                isActive={true}
              />
            )}

            {activeProject === 'flipframe' && activeTab === 'camera' && (
              <CameraPanel
                onFaceDataCapture={handleFaceDataCapture}
                getConfigFromDatabase={getFlipFrameConfigFromDatabase}
                saveConfigToDatabase={saveFlipFrameConfigToDatabase}
                isActive={true}
              />
            )}

            {activeProject === 'discoKnob' && activeTab === 'manual' && (
              <DiscoPanel
                onSubmit={handleDiscoManualControl}
                getConfigFromDatabase={getDiscoKnobConfigFromDatabase}
                saveConfigToDatabase={saveDiscoKnobConfigToDatabase}
                isActive={true}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

const renderInfoButton = () => {
    return (
      <div className="fixed bottom-6 right-6 z-10 flex flex-col space-y-2">
        <button 
          onClick={toggleGlobalAudio}
          className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center
     bg-white text-gray-500 border-gray-300 hover:bg-gray-100 shadow-lg"
         title={isMuted ? "Unmute Audio" : "Mute Audio"}
       >
         {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
       </button>
        <button 
          onClick={() => toggleLighting()}
          className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center
      bg-white text-gray-500 border-gray-300 hover:bg-gray-100 shadow-lg"
          title="Toggle Lighting"
        >
          {lightingEnabled ? <Lightbulb className="w-5 h-5" /> : <LightbulbOff className="w-5 h-5" />}
        </button>
        <button 
         onClick={() => setShowWelcomeModal(true)}
         className="px-3 py-2 rounded-lg text-sm border flex items-center justify-center
     bg-white text-gray-500 border-gray-300 hover:bg-gray-100 shadow-lg"
          title="Show Navigation Help"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>
    );
  };


  return (
    <div>
      <div className="absolute inset-0">
        <SceneManager
          ref={sceneManagerRef} 
          activeProject={activeProject} 
          onFocusChange={handleFocusChange}
        >
          <WallFlowerVisualization 
              ref={wallFlowerRef}
              sceneManager={sceneManagerRef.current}
              onManagerInitialized={handleWallFlowerManagerInitialized}
              numControllers={wallFlowerNumControllers}
          />
          
          <StoolVisualization 
              ref={stoolRef}
              sceneManager={sceneManagerRef.current}
              onManagerInitialized={handleStoolManagerInitialized}
              numControllers={stoolNumControllers}
          />
          
          <FlipDiscVisualization 
              ref={flipFrameRef}
              sceneManager={sceneManagerRef.current}
              patternRequest={patternRequest}
              drawGridData={drawGridData}
              cameraData={cameraData}
          />

          <NeonVisualization
              ref={neonRef}
              sceneManager={sceneManagerRef.current}
          />

          <DiscoKnobVisualization
              ref={discoKnobRef}
              sceneManager={sceneManagerRef.current}
              onManagerInitialized={handleDiscoKnobManagerInitialized}
              discoData={discoData}
          />
        </SceneManager>
      </div>
  
      <div className="relative z-10">
        {renderWelcomeModal()}
        {renderProjectInfoModal()}
        {renderControlTabs()}
        {renderControlPanel()}
        {renderInfoButton()}
      </div>
    </div>
  );
};

export default UnifiedDashboard;