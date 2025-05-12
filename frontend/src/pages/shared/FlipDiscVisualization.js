import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import FlipDiscManager from './sim/FlipDiscManager';

const FlipDiscVisualization = forwardRef(({ sceneManager, patternRequest, drawGridData, cameraData }, ref) => {
  const gridWidthHeight = 28;
  const [modelSchema, setModelSchema] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const managerRef = useRef(null);
  const labelHitboxRef = useRef(null);
  const initCompletedRef = useRef(false);
  const modelSchemaLoadedRef = useRef(false);

  const gridConfig = {
    rows: gridWidthHeight,
    cols: gridWidthHeight,
    discSpacing: 0.1,
  };

  const labelGlow = useCallback((isHovered) => {
    if (!labelHitboxRef.current) return;
    
    const material = labelHitboxRef.current.material;
    if (sceneManager) {
      const bloomPass = sceneManager.bloomPass;
  
      if (isHovered) {
        material.opacity = 0.4;
        if (bloomPass) {
          bloomPass.strength = 3.0;
        }
      } else {
        material.opacity = 0.2;
        if (bloomPass) {
          bloomPass.strength = 1.5;
        }
      }
    }
    
    material.needsUpdate = true;
  }, [sceneManager]);

  const handleMouseMove = useCallback((event) => {
    if (!sceneManager || !labelHitboxRef.current) return;
    
    const raycaster = sceneManager.raycaster;
    const container = sceneManager.container;
    const mouse = new THREE.Vector2();
    
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, sceneManager.camera);  
    const intersects = raycaster.intersectObject(labelHitboxRef.current);
    
    if (intersects.length > 0) {
      if (!labelHitboxRef.current.userData.isHovered) {
        labelHitboxRef.current.userData.isHovered = true;
        labelGlow(true);
      }
    } else {
      if (labelHitboxRef.current.userData.isHovered) {
        labelHitboxRef.current.userData.isHovered = false;
        labelGlow(false);
      }
    }
  }, [sceneManager, labelGlow]);

  const createHitBoxes = useCallback((group) => {
    const labelHitboxGeometry = new THREE.PlaneGeometry(0.3, 0.28);
    const labelHitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: false
    });

    const labelHitboxMesh = new THREE.Mesh(labelHitboxGeometry, labelHitboxMaterial);
    
    labelHitboxMesh.position.set(-1.43, 2.33, -3.95);
    labelHitboxMesh.userData = {
      isHitbox: true,
      projectId: 'flipframe',
      isHovered: false
    };
    
    group.add(labelHitboxMesh);
    labelHitboxRef.current = labelHitboxMesh;
    
    return labelHitboxMesh;
  }, []);

  const loadModelSchema = useCallback(() => {
    fetch('/config/FlipDisc/model_config.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then(text => {
        try {
          const schema = JSON.parse(text);
          setModelSchema(schema);
          modelSchemaLoadedRef.current = true;
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          setIsLoading(false);
        }
      })
      .catch(error => {
        console.error('Error loading model schema:', error);
        setIsLoading(false);
      });
  }, [setIsLoading]);

  const initializeManager = useCallback((flipDiscGroup) => {
    try {
      if (managerRef.current) {
        console.log("FlipDisc manager already exists, skipping initialization");
        return;
      }
      
      if (!modelSchema) {
        console.error("Cannot initialize FlipDiscManager: modelSchema not loaded yet");
        return;
      }
      
      const manager = new FlipDiscManager(flipDiscGroup, gridConfig, modelSchema);
      managerRef.current = manager;
      
      manager.initialize((success) => {
        if (success) {
          createHitBoxes(flipDiscGroup);
        }
        setIsLoading(false);
      });
    } catch (error) {
      console.error('Error initializing FlipDiscManager:', error);
      setIsLoading(false);
    }
  }, [modelSchema, gridConfig, createHitBoxes, setIsLoading]);

  useEffect(() => {
    if (!initCompletedRef.current) {
      loadModelSchema();
    }
  }, [loadModelSchema]);

  useEffect(() => {
    if (!managerRef.current) return;
    if (cameraData) {
      managerRef.current.setCameraData(cameraData);
    }
  }, [cameraData]);
  
  useEffect(() => {
    if (!managerRef.current) return;
    managerRef.current.setDrawingGrid(drawGridData);
    
  }, [drawGridData]);

  useEffect(() => {
    if (!managerRef.current || !patternRequest) return;
    if (patternRequest.enable) {
      managerRef.current.setPattern(patternRequest);
    }
    else {
      managerRef.current.clear();
    }
  }, [patternRequest]);

  useEffect(() => {
    // don't init prematurely - onlys proceed if we have sceneManager, scene, and modelSchema is loaded
    if (initCompletedRef.current || !sceneManager || !sceneManager.scene || !modelSchema) {
      return;
    }
    
    const flipDiscGroup = new THREE.Group();
    flipDiscGroup.position.set(0, 0, 0);
    sceneManager.scene.add(flipDiscGroup);

    if (sceneManager.registerProjectGroup) {
      sceneManager.registerProjectGroup('flipframe', flipDiscGroup);
    }

    initializeManager(flipDiscGroup);
    initCompletedRef.current = true;

    if (sceneManager.container) {
      sceneManager.container.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      if (sceneManager && sceneManager.container) {
        sceneManager.container.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [sceneManager, handleMouseMove, initializeManager, modelSchema]);

  useEffect(() => {
    if (!managerRef.current || !sceneManager || !sceneManager.registerUpdateFunction) return;
    
    const unregister = sceneManager.registerUpdateFunction('flipframe', (deltaTime) => {
      managerRef.current.update(deltaTime);
    });
    
    return unregister;
  }, [sceneManager]);

  useImperativeHandle(ref, () => ({
    getManager: () => managerRef.current,
    getLabelHitboxArea: () => labelHitboxRef.current
  }));
  
  return <div style={{ display: 'none' }} data-loading={isLoading} />;
});

export default FlipDiscVisualization;