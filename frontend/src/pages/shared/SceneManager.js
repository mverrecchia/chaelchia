import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const SceneManager = forwardRef(({ children, onFocusChange }, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const sceneInitializedRef = useRef(false);
  const updateFunctionsRef = useRef({});
  const raycasterRef = useRef(null);
  const mouseRef = useRef(null);
  const lightOnRef = useRef(false);
  const lastClickedAreaRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const lastUpdateTimeRef = useRef(Date.now());
  const [focusedProject, setFocusedProject] = useState(null);
  
  const roomRef = useRef(null);
  const ambientLightRef = useRef(null);
  const discoSpotlight1Ref = useRef(null);
  const discoSpotlight2Ref = useRef(null);
  const discoSpotlight3Ref = useRef(null);
  const discoKnobSpotlightRef = useRef(null);
  const flipFrameSpotlightRef = useRef(null);
  const roomDirectionalLightRef = useRef(null);
  const bloomPassRef = useRef(null);
  const loadingManagerRef = useRef(null);
  const roomLoadedRef = useRef(false);
  
  const projectGroupsRef = useRef({
    wallflower: null,
    stool: null,
    flipframe: null,
    neon: null,
    discoKnob: null
  });

  const cameraSettingsRef = useRef({
    overview: {
      position: new THREE.Vector3(3.6, 3.4, 3.8),
      target: new THREE.Vector3(-0.25, 2.2, 0.6),
    },
    wallflower: {
      position: new THREE.Vector3(1.5, 2.9, -0.08),
      target: new THREE.Vector3(-2, 2.9, -0.1),
      limits: {
        minDistance: 0,
        maxDistance: 4.5,
        minPolarAngle: Math.PI * 0.1,
        maxPolarAngle: Math.PI * 0.5
      }
    },
    stool: {
      position: new THREE.Vector3(2.1, 1.8, 1.75),
      target: new THREE.Vector3(0.36, 1.23, 0.6),
      limits: {
        minDistance: 1.5,
        maxDistance: 3,
        minPolarAngle: Math.PI * 0.1,
        maxPolarAngle: Math.PI * 0.5
      }
    },
    flipframe: {
      position: new THREE.Vector3(-0.25, 2.5, -0.75),
      target: new THREE.Vector3(-0.25, 2.5, -1.25),
      limits: {
        minDistance: 0,
        maxDistance: 3,
        minPolarAngle: Math.PI * 0.1,
        maxPolarAngle: Math.PI * 0.5
      }
    },
    neon: {
      position: new THREE.Vector3(3.8, 3.3, 0.85),
      target: new THREE.Vector3(3.8, 3, -1.78),
      limits: {
        minDistance: 0,
        maxDistance: 3,
        minPolarAngle: Math.PI * 0.1,
        maxPolarAngle: Math.PI * 0.5
      }
    },
    discoKnob: {
      position: new THREE.Vector3(-2.64, 1.55, 4.88),
      target: new THREE.Vector3(-1.7, 2.3, 3),
      limits: {
        minDistance: 0,
        maxDistance: 3,
        minPolarAngle: Math.PI * 0.2,
        maxPolarAngle: Math.PI * 0.7
      }
    }
  });

  const registerUpdateFunction = useCallback((id, updateFn) => {
    updateFunctionsRef.current[id] = updateFn;
    return () => {
      delete updateFunctionsRef.current[id];
    };
  }, []);
  
  const unregisterUpdateFunction = useCallback((id) => {
    delete updateFunctionsRef.current[id];
  }, []);

  useEffect(() => {
    if (sceneInitializedRef.current) {
      return;
    }
    
    if (!containerRef.current) {
      console.error('Container ref is null, cannot initialize scene');
      return;
    }

    raycasterRef.current = new THREE.Raycaster();
    mouseRef.current = new THREE.Vector2();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      1,
      1000
    );
    
    const overviewSettings = cameraSettingsRef.current.overview;
    camera.position.copy(overviewSettings.position);
    camera.lookAt(overviewSettings.target);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.SRGBColorSpace;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // limit the viewing angle of the room to limit how much of the back of the room is seen
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0;
    controls.maxDistance = 5;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.7;
    controls.minAzimuthAngle = -Math.PI * 0.15;
    controls.maxAzimuthAngle = Math.PI * 0.6;
    
    controls.target.copy(overviewSettings.target);
    
    controlsRef.current = controls;
    
    // add room and ambient lights
    const ambientLight = new THREE.AmbientLight(0x999999, 2.0);
    ambientLightRef.current = ambientLight;
    scene.add(ambientLight);

    const roomDirectionalLight = new THREE.DirectionalLight(0xEAD498, 0.2);
    roomDirectionalLight.position.set(0, 10, 0);
    roomDirectionalLight.target.position.set(0, 0, 0);
    roomDirectionalLightRef.current = roomDirectionalLight;
    scene.add(roomDirectionalLight);
    scene.add(roomDirectionalLight.target);
    
    const createDiscoSpotlight = (color, intensity, positionOffset) => {
      const spotlight = new THREE.SpotLight(color, intensity);
      spotlight.position.set(
        positionOffset.x, 
        positionOffset.y, 
        positionOffset.z
      );
      spotlight.target.position.set(
        positionOffset.x, 
        positionOffset.y, 
        positionOffset.z - 7
      );
      spotlight.angle = 0.3;
      spotlight.penumbra = 0.2;
      spotlight.decay = 1.5;
      spotlight.distance = 10;
      spotlight.castShadow = true;
      spotlight.shadow.mapSize.width = 1024;
      spotlight.shadow.mapSize.height = 1024;
      spotlight.shadow.radius = 1.5;
      scene.add(spotlight.target);
      return spotlight;
    };

    // all these spotlight positions and settings were found by trial and error
    const discoSpotlight1 = createDiscoSpotlight(0xffffff, 0.0, { x: 4, y: 7, z: 3 });
    const discoSpotlight2 = createDiscoSpotlight(0xffffff, 0.0, { x: 4.5, y: 7, z: 3.5 });
    const discoSpotlight3 = createDiscoSpotlight(0xffffff, 0.0, { x: 4.25, y: 7, z: 3.5 });

    discoSpotlight1Ref.current = discoSpotlight1;
    discoSpotlight2Ref.current = discoSpotlight2;
    discoSpotlight3Ref.current = discoSpotlight3;
    scene.add(discoSpotlight1);
    scene.add(discoSpotlight2);
    scene.add(discoSpotlight3);

    const discoKnobSpotlight = new THREE.SpotLight(0xffffff, 0.0);
    discoKnobSpotlight.position.set(-2.5, 4.3, 4.9);
    discoKnobSpotlight.target.position.set(-2.42, 2.35, 2.815);
    discoKnobSpotlight.angle = 0.12;
    discoKnobSpotlight.penumbra = 0.3;
    discoKnobSpotlight.decay = 2.0;
    discoKnobSpotlight.distance = 10;
    discoKnobSpotlight.castShadow = false;
    discoKnobSpotlight.shadow.mapSize.width = 1024;
    discoKnobSpotlight.shadow.mapSize.height = 1024;
    discoKnobSpotlight.shadow.radius = 1;
    discoKnobSpotlightRef.current = discoKnobSpotlight;
    scene.add(discoKnobSpotlight.target);
    scene.add(discoKnobSpotlight);
    
    const flipFrameSpotlight = new THREE.SpotLight(0xffffff, 0.0);
    flipFrameSpotlight.position.set(0.054, 4, -1);
    flipFrameSpotlight.target.position.set(-0.2, 3, -3.83);
    flipFrameSpotlight.angle = 0.4;
    flipFrameSpotlight.penumbra = 0.3;
    flipFrameSpotlight.decay = 1.5;
    flipFrameSpotlight.distance = 8;
    flipFrameSpotlight.castShadow = true;
    flipFrameSpotlight.shadow.mapSize.width = 1024;
    flipFrameSpotlight.shadow.mapSize.height = 1024;
    flipFrameSpotlight.shadow.radius = 1;
    flipFrameSpotlightRef.current = flipFrameSpotlight;
    scene.add(flipFrameSpotlight.target);
    scene.add(flipFrameSpotlight);
    
    loadingManagerRef.current = new THREE.LoadingManager();
    loadingManagerRef.current.onStart = function() {
      setIsLoading(true);
    };
    
    loadingManagerRef.current.onLoad = function() {
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    };
    
    const gltfLoader = new GLTFLoader(loadingManagerRef.current);
    gltfLoader.load(
      '/models/room.glb',
      (gltf) => {
        roomRef.current = gltf.scene;
        roomRef.current.position.set(0, 0, 0);
        roomRef.current.scale.set(1, 1, 1);
        roomRef.current.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;
          }
        });
        
        scene.add(roomRef.current);
        roomLoadedRef.current = true;
      },
      (xhr) => {
        // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
      },
      (error) => {
        console.error('Error loading room model:', error);
      }
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const renderScene = new RenderPass(scene, camera);
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,    // Strength
      0.4,    // Radius
      0.2     // Threshold of 0.2 after some testing
    );
    bloomPassRef.current = bloomPass;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    const animate = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastUpdateTimeRef.current) / 1000;
      lastUpdateTimeRef.current = currentTime;

      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      Object.values(updateFunctionsRef.current).forEach(updateFn => {
        if (typeof updateFn === 'function') {
          updateFn(deltaTime);
        }
      });
      
      if (composerRef.current) {
        composerRef.current.render();
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
        
    animate();
    
    const handleClick = (event) => {
      if (!raycasterRef.current || !mouseRef.current || !cameraRef.current) return;
      
      mouseRef.current.x = (event.clientX / containerRef.current.clientWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / containerRef.current.clientHeight) * 2 + 1;
      
      const groups = Object.entries(projectGroupsRef.current)
        .filter(([_, group]) => group !== null)
        .map(([projectId, group]) => ({ id: projectId, group }));
            
      const intersectObjects = [];
      groups.forEach(({ id, group }) => {
        group.traverse((object) => {
          if (object.isMesh) {
            intersectObjects.push(object);
          }
        });
      });
      
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(intersectObjects, true);
      
      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        
        if (intersectedObject.userData && intersectedObject.userData.isHitbox) {
          const projectId = intersectedObject.userData.projectId;
          
          if (focusedProject !== projectId) {
            focusOn(projectId);
          }
          
          lastClickedAreaRef.current = intersectedObject;
          
          if (onFocusChange) {
            onFocusChange(projectId, true);
          }
          
          return;
        }
      
        let selectedProject = null;
        
        for (const { id, group } of groups) {
            if (group.getObjectById(intersectedObject.id)) {
                selectedProject = id;
                break;
            }
        }
        
        if (selectedProject) {
            focusOn(selectedProject);
            setFocusedProject(selectedProject);
        }
      } else if (focusedProject) {
        focusOn(null);
      }
    };

    controls.addEventListener('change', () => {
      const margin = 1;
      const ROOM = {
        width: 12,
        height: 12,
        depth: 12
      };
      
      camera.position.x = Math.max(-ROOM.width/2 + margin, 
                         Math.min(ROOM.width/2 - margin, camera.position.x));
      camera.position.y = Math.max(margin, 
                         Math.min(ROOM.height - margin, camera.position.y));
      camera.position.z = Math.max(-ROOM.depth/2 + margin, 
                         Math.min(ROOM.depth/2 - margin, camera.position.z));
    });

    
    // Handle escape key to exit focus mode
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && focusedProject) {
        focusOn(null);
      }
    };
    containerRef.current.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    
    // first set flag, but don't set loading to false until room is loaded
    sceneInitializedRef.current = true;

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('click', handleClick);
      }
      window.removeEventListener('keydown', handleKeyDown);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [onFocusChange]);

  const setLighting = (lightsOn) => {
    lightOnRef.current = lightsOn;
      
    if (lightOnRef.current) {
        if (ambientLightRef.current) ambientLightRef.current.intensity = 0.2;
        if (discoSpotlight1Ref.current) discoSpotlight1Ref.current.intensity = 3.0;
        if (discoSpotlight2Ref.current) discoSpotlight2Ref.current.intensity = 3.0;
        if (discoSpotlight3Ref.current) discoSpotlight3Ref.current.intensity = 3.0;
        if (discoKnobSpotlightRef.current) discoKnobSpotlightRef.current.intensity = 2.0;
        if (flipFrameSpotlightRef.current) flipFrameSpotlightRef.current.intensity = 2.0;
        if (roomDirectionalLightRef.current) roomDirectionalLightRef.current.intensity = 0.0;
    } else {
        if (ambientLightRef.current) ambientLightRef.current.intensity = 2.0;
        if (discoSpotlight1Ref.current) discoSpotlight1Ref.current.intensity = 0.0;
        if (discoSpotlight2Ref.current) discoSpotlight2Ref.current.intensity = 0.0;
        if (discoSpotlight3Ref.current) discoSpotlight3Ref.current.intensity = 0.0;
        if (discoKnobSpotlightRef.current) discoKnobSpotlightRef.current.intensity = 0.0;
        if (flipFrameSpotlightRef.current) flipFrameSpotlightRef.current.intensity = 0.0;
        if (roomDirectionalLightRef.current) roomDirectionalLightRef.current.intensity = 0.3;
    }
  };

  const setBloomStrength = (strength) => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = strength;
    }
  };

  const focusOn = (projectId) => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    if (projectId === null) {
      const startPosition = new THREE.Vector3().copy(cameraRef.current.position);
      const startTarget = new THREE.Vector3().copy(controlsRef.current.target);
      const endPosition = cameraSettingsRef.current.overview.position;
      const endTarget = cameraSettingsRef.current.overview.target;
      
      controlsRef.current.minDistance = 1;
      controlsRef.current.maxDistance = 20;
      controlsRef.current.minPolarAngle = 0;
      controlsRef.current.maxPolarAngle = Math.PI * 0.7;
      
      animateCamera(startPosition, endPosition, startTarget, endTarget, 1000, () => {
        setFocusedProject(null);
        if (onFocusChange) onFocusChange(null);
      });
    } 
    else if (projectId in cameraSettingsRef.current) {
      const projectSettings = cameraSettingsRef.current[projectId];
      
      const startPosition = new THREE.Vector3().copy(cameraRef.current.position);
      const startTarget = new THREE.Vector3().copy(controlsRef.current.target);
      const endPosition = projectSettings.position;
      const endTarget = projectSettings.target;
      
      animateCamera(startPosition, endPosition, startTarget, endTarget, 1000, () => {
        if (projectSettings.limits) {
          controlsRef.current.minDistance = projectSettings.limits.minDistance;
          controlsRef.current.maxDistance = projectSettings.limits.maxDistance;
          controlsRef.current.minPolarAngle = projectSettings.limits.minPolarAngle;
          controlsRef.current.maxPolarAngle = projectSettings.limits.maxPolarAngle;
        }
        
        setFocusedProject(projectId);
        if (onFocusChange) onFocusChange(projectId);
      });
    }
  };
  
  const animateCamera = (startPos, endPos, startTarget, endTarget, duration, onComplete) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    
    const startTime = Date.now();
    
    const updateCamera = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      const ease = t => t<.5 ? 2*t*t : -1+(4-2*t)*t;
      const smoothProgress = ease(progress);
      
      camera.position.lerpVectors(startPos, endPos, smoothProgress);
      
      controls.target.lerpVectors(startTarget, endTarget, smoothProgress);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(updateCamera);
      } else if (onComplete) {
        onComplete();
      }
    };
    
    updateCamera();
  };

  const registerProjectGroup = (projectId, group) => {
    projectGroupsRef.current[projectId] = group;
  };

  // Used for debugging camera position
  // useEffect(() => {
  //   const logCameraPosition = () => {
  //     if (cameraRef.current && controlsRef.current) {
  //       console.log('Camera position:', cameraRef.current.position);
  //       console.log('Camera target:', controlsRef.current.target);
  //     }
  //   };
    
  //   window.addEventListener('keydown', (e) => {
  //     if (e.key === 'p') logCameraPosition();
  //   });
    
  //   return () => window.removeEventListener('keydown', logCameraPosition);
  // }, []);

  useImperativeHandle(ref, () => ({
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    composer: composerRef.current,
    bloomPass: bloomPassRef.current,
    container: containerRef.current,
    raycaster: raycasterRef.current,
    loadingManager: loadingManagerRef.current,
    registerProjectGroup,
    focusOn,
    focusedProject,
    registerUpdateFunction,
    unregisterUpdateFunction,
    room: roomRef.current,
  
    setLighting: (lightsOn) => {
      setLighting(lightsOn);
    },
    setBloomStrength: (strength) => {
      setBloomStrength(strength);
    },
    updateDiscoLights: (color, mode, mode_speed) => {
      const discoSpotlights = [
        discoSpotlight1Ref.current,
        discoSpotlight2Ref.current,
        discoSpotlight3Ref.current
      ];

      let intensity = 0.0;
      if (mode === 1) {
        intensity = 3.0;
      }

      discoSpotlights.forEach(spotlight => {
        if (spotlight) {
          spotlight.color.set(color);
          spotlight.intensity = intensity;
        }
      });
    }
  }));

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef}
        className="w-full h-full bg-gray-800 rounded-lg overflow-hidden"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
          <div className="text-center">
            <svg className="animate-spin h-10 w-10 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>Loading scene...</p>
          </div>
        </div>
      )}
      {!isLoading && children}
    </div>
  );
});

export default SceneManager;