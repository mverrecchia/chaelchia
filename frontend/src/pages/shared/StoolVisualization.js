import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import NeonManager from './sim/NeonManager';
import { getStoolConfigFromDatabase } from '../../services/api';

const StoolVisualization = forwardRef(({ sceneManager, onManagerInitialized }, ref) => {
  const [modelSchema, setModelSchema] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const managerRef = useRef(null);
  const labelHitboxRef = useRef(null);
  const initCompletedRef = useRef(false);
  const modelSchemaLoadedRef = useRef(false);

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
    // Create hitbox for the stool
    const labelHitboxGeometry = new THREE.PlaneGeometry(0.3, 0.265);
    const labelHitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: false
    });
    
    const labelHitboxMesh = new THREE.Mesh(labelHitboxGeometry, labelHitboxMaterial);
    
    labelHitboxMesh.position.set(0.54,0.81,0.175);
    labelHitboxMesh.rotation.set(-Math.PI/2, 0, 0);
    
    labelHitboxMesh.userData = {
      isHitbox: true,
      projectId: 'stool',
      isHovered: false
    };
    
    group.add(labelHitboxMesh);
    labelHitboxRef.current = labelHitboxMesh;
    
    return labelHitboxMesh;
  }, []);

  const loadModelSchema = useCallback(() => {
    fetch('/config/Stool/model_config.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(schema => {
        if (!schema || !Array.isArray(schema)) {
          throw new Error('Invalid model schema - expected array');
        }
        setModelSchema(schema);
        modelSchemaLoadedRef.current = true;
      })
      .catch(error => {
        console.error('Error loading model schema:', error);
        setIsLoading(false);
      });
  }, [setModelSchema, setIsLoading]);

  const initializeManager = useCallback(async (stoolGroup) => {
    if (!modelSchema) {
      console.error('Cannot initialize manager: modelSchema not loaded yet');
      return;
    }
    
    if (!sceneManager || !sceneManager.scene) {
      console.error('Cannot initialize manager: missing sceneManager or scene');
      return;
    }

    if (managerRef.current) {
      console.log('Stool manager already initialized, skipping');
      return;
    }
    
    try {
      const configFromDatabase = await getStoolConfigFromDatabase();
      
      const manager = new NeonManager(stoolGroup, modelSchema, configFromDatabase, 1);
      managerRef.current = manager;
      
      manager.initialize((success) => {
        if (success) {
          createHitBoxes(stoolGroup);
          
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

  // initial setup
  useEffect(() => {
    if (!initCompletedRef.current) {
      loadModelSchema();
    }
  }, [loadModelSchema]);

  // init when scene and model schema are ready
  useEffect(() => {
    // but only proceed if we have the scene manager, scene, and modelSchema loaded
    if (initCompletedRef.current || !sceneManager || !sceneManager.scene || !modelSchema) {
      return;
    }
    
    const stoolGroup = new THREE.Group();
    stoolGroup.position.set(0, 0, 0);
    sceneManager.scene.add(stoolGroup);
    
    if (sceneManager.registerProjectGroup) {
      sceneManager.registerProjectGroup('stool', stoolGroup);
    }
    
    initializeManager(stoolGroup);
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

  // register the stool's update function with manager
  useEffect(() => {
    if (!managerRef.current || !sceneManager || !sceneManager.registerUpdateFunction) return;
    
    const unregister = sceneManager.registerUpdateFunction('stool', (deltaTime) => {
      managerRef.current.update(deltaTime);
    });
    
    return unregister;
  }, [sceneManager]);

  return <div style={{ display: 'none' }} data-loading={isLoading} />;
});

export default StoolVisualization;