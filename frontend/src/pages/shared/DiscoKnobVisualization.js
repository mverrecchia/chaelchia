// Modified DiscoKnobVisualization.js
import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import DiscoKnobManager from './sim/DiscoKnobManager';

const DiscoKnobVisualization = forwardRef(({ sceneManager, onManagerInitialized, discoData }, ref) => {
  const [modelSchema, setModelSchema] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const managerRef = useRef(null);
  const labelHitboxRef = useRef(null);
  const initCompletedRef = useRef(false);
  const modelSchemaLoadedRef = useRef(false);

  // Define labelGlow first since it's used in handleMouseMove
  const labelGlow = useCallback((isHovered) => {
    if (!labelHitboxRef.current) return;
    
    const material = labelHitboxRef.current.material;
    if (sceneManager) {
      // Direct reference to bloom pass through scene manager
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
    const labelIntersects = raycaster.intersectObject(labelHitboxRef.current);
    
    if (labelIntersects.length > 0) {
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
    const labelHitboxGeometry = new THREE.PlaneGeometry(0.30, 0.27);
    const labelHitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: false
    });
    
    const labelHitboxMesh = new THREE.Mesh(labelHitboxGeometry, labelHitboxMaterial);
    
    labelHitboxMesh.position.set(-3.13, 2.3, 2.815);
    labelHitboxMesh.rotation.set(0, 0, 0);
    
    labelHitboxMesh.userData = {
      isHitbox: true,
      projectId: 'discoKnob',
      isHovered: false
    };
    
    group.add(labelHitboxMesh);
    labelHitboxRef.current = labelHitboxMesh;

    return labelHitboxMesh;
  }, []);

  const loadModelSchema = useCallback(() => {
    fetch('/config/DiscoKnob/model_config.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(schema => {
        if (!schema || (!schema.knob && !schema.mount)) {
          throw new Error('Invalid model schema: missing knob or mount configuration');
        }
        setModelSchema(schema);
        modelSchemaLoadedRef.current = true;
      })
      .catch(error => {
        console.error('Error loading model schema:', error);
        setIsLoading(false);
      });
  }, [setModelSchema, setIsLoading]);

  const initializeManager = useCallback((discoKnobGroup) => {
    if (!modelSchema) {
      console.error('Cannot initialize manager: modelSchema not loaded yet');
      return;
    }
    
    if (!sceneManager || !sceneManager.scene) {
      console.error('Cannot initialize manager: missing sceneManager or scene');
      return;
    }

    if (managerRef.current) {
      console.log('DiscoKnob manager already initialized, skipping');
      return;
    }
    
    try {
      const manager = new DiscoKnobManager(discoKnobGroup, modelSchema);
      managerRef.current = manager;
      
      manager.initialize((success) => {
        if (success) {
          createHitBoxes(discoKnobGroup);
          if (onManagerInitialized) {
            onManagerInitialized(manager);
          }
        }
        setIsLoading(false);
      });
      
    } catch (error) {
      console.error('Error initializing manager with database state:', error);
      setIsLoading(false);
    }
  }, [modelSchema, sceneManager, createHitBoxes, onManagerInitialized, setIsLoading]);

  useImperativeHandle(ref, () => ({
    getManager: () => managerRef.current,
  }));

  useEffect(() => {
    if (!initCompletedRef.current) {
      loadModelSchema();
    }
  }, [loadModelSchema]);

  useEffect(() => {
    if (!managerRef.current) return;
    if (discoData) {
      managerRef.current.setDiscoData(discoData);
    }
  }, [discoData]);

  useEffect(() => {
    if (!managerRef.current || !sceneManager || !sceneManager.registerUpdateFunction) return;
    
    const unregister = sceneManager.registerUpdateFunction('discoKnob', (deltaTime) => {
      managerRef.current.update(deltaTime);
    });

    return unregister;
  }, [sceneManager]);
  
  useEffect(() => {
    // Only proceed if we have the scene manager, scene, and modelSchema loaded
    if (initCompletedRef.current || !sceneManager || !sceneManager.scene || !modelSchema) {
      return;
    }
        
    const discoKnobGroup = new THREE.Group();
    discoKnobGroup.position.set(0, 0, 0);
    sceneManager.scene.add(discoKnobGroup);
    
    if (sceneManager.registerProjectGroup) {
      sceneManager.registerProjectGroup('discoKnob', discoKnobGroup);
    }
    
    initializeManager(discoKnobGroup);
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
    if (sceneManager && discoData && discoData.spotlights && discoData.spotlights.enabled) {
        sceneManager.updateDiscoLights(discoData.spotlights.color, discoData.spotlights.mode, discoData.spotlights.mode_speed);
      }
  }, [sceneManager, discoData]);

  return <div style={{ display: 'none' }} data-loading={isLoading} />;
});

export default DiscoKnobVisualization;