import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as THREE from 'three';
import NeonManager from './sim/NeonManager';
import { getWallflowerConfigFromDatabase } from '../../services/api';

const WallFlowerVisualization = forwardRef(({ sceneManager, numControllers, onManagerInitialized }, ref) => {
  const [modelSchema, setModelSchema] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const managerRef = useRef(null);
  const hitboxesRef = useRef([]);
  const labelHitboxRef = useRef(null);
  const initCompletedRef = useRef(false);
  const modelSchemaLoadedRef = useRef(false);

  const handleGlow = useCallback((isHovered) => {
    if (!labelHitboxRef.current) return;
    
    const material = labelHitboxRef.current.material;
    if (sceneManager && sceneManager.composer) {
      const bloomPass = sceneManager.composer.passes.find(pass => pass.name === 'UnrealBloomPass');
      
      if (isHovered) {
        material.opacity = 0.4;
        if (bloomPass) {
          bloomPass.strength = 3.0;
        }
        if (sceneManager.setBloomStrength) {
          sceneManager.setBloomStrength(3.0);
        }
      } else {
        material.opacity = 0.2;
        if (bloomPass) {
          bloomPass.strength = 1.5;
        }
        if (sceneManager.setBloomStrength) {
          sceneManager.setBloomStrength(1.5);
        }
      }
    }
    
    material.needsUpdate = true;
  }, [sceneManager]);

  const handleMouseMove = useCallback((event) => {
    if (!sceneManager || !managerRef.current) return;
    
    const raycaster = sceneManager.raycaster;
    const container = sceneManager.container;
    
    if (!raycaster || !container) return;
    
    const mouse = new THREE.Vector2();
    
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, sceneManager.camera);
    if (labelHitboxRef.current) {
      const labelIntersects = raycaster.intersectObject(labelHitboxRef.current);
      if (labelIntersects.length > 0) {
        if (!labelHitboxRef.current.userData.isHovered) {
          console.log("WallFlower hitbox hovered - enabling glow");
          labelHitboxRef.current.userData.isHovered = true;
          handleGlow(true);
        }
      } else {
        if (labelHitboxRef.current.userData.isHovered) {
          console.log("WallFlower hitbox unhovered - disabling glow");
          labelHitboxRef.current.userData.isHovered = false;
          handleGlow(false);
        }
      }
    }
    
    if (hitboxesRef.current.length === 0) return;
    
    const flowerIntersects = raycaster.intersectObjects(hitboxesRef.current);
    
    hitboxesRef.current.forEach(hitbox => {
      const isIntersected = flowerIntersects.some(intersect => intersect.object === hitbox);
      
      if (isIntersected && !hitbox.userData.isHovered) {
        hitbox.userData.isHovered = true;
        managerRef.current.setDistance(hitbox.userData.index, 0.1);
      } else if (!isIntersected && hitbox.userData.isHovered) {
        hitbox.userData.isHovered = false;
        managerRef.current.setDistance(hitbox.userData.index, 0.5);
      }
    });
  }, [sceneManager, handleGlow]);

  const createHitBoxes = useCallback((group) => {
    for (let i = 0; i < numControllers; i++) {
      const hitboxGeometry = new THREE.SphereGeometry(0.15, 16, 16);
      const hitboxMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: false
      });
      
      const hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
      
      const xPosition = -1.5 - (i * 0.5);
      hitboxMesh.position.set(xPosition, 2.5, -2.75);
      
      hitboxMesh.userData = {
        index: i,
        isHovered: false
      };
      
      group.add(hitboxMesh);
      hitboxesRef.current.push(hitboxMesh);
    }
    
    const labelHitboxGeometry = new THREE.PlaneGeometry(0.3, 0.28);
    const labelHitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: false
    });
    
    labelHitboxMaterial.name = 'WallFlowerHitboxMaterial';
    labelHitboxMaterial.visible = true;
    
    const labelHitboxMesh = new THREE.Mesh(labelHitboxGeometry, labelHitboxMaterial);
    
    labelHitboxMesh.position.set(-3.95, 2.33, 1.36);
    labelHitboxMesh.rotation.set(0, Math.PI/2, 0);
    labelHitboxMesh.userData = {
      isHitbox: true,
      projectId: 'wallflower',
      isHovered: false
    };
    
    group.add(labelHitboxMesh);
    labelHitboxRef.current = labelHitboxMesh;
  }, [numControllers]);

  const loadModelSchema = useCallback(() => {
    fetch('/config/WallFlower/model_config.json')
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

  const initializeManager = useCallback(async (wallFlowerGroup) => {
    if (!modelSchema) {
      console.error('Cannot initialize manager: modelSchema not loaded yet');
      return;
    }
    
    if (!sceneManager || !sceneManager.scene) {
      console.error('Cannot initialize manager: missing sceneManager or scene');
      return;
    }

    if (managerRef.current) {
      console.log('WallFlower manager already initialized, skipping');
      return;
    }
    
    try {
      const configFromDatabase = await getWallflowerConfigFromDatabase();
      
      const manager = new NeonManager(wallFlowerGroup, modelSchema, configFromDatabase, numControllers);
      managerRef.current = manager;
      
      manager.initialize((success) => {
        if (success) {
          createHitBoxes(wallFlowerGroup);
          
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
  }, [modelSchema, numControllers, sceneManager, createHitBoxes, onManagerInitialized, setIsLoading]);

  // Initial setup
  useEffect(() => {
    if (!initCompletedRef.current) {
      loadModelSchema();
    }
  }, [loadModelSchema]);

  useEffect(() => {
    if (initCompletedRef.current || !sceneManager || !sceneManager.scene || !modelSchema) {
      return;
    }
    
    const wallFlowerGroup = new THREE.Group();
    wallFlowerGroup.position.set(0, 0, 0);

    initializeManager(wallFlowerGroup);
    initCompletedRef.current = true;
    sceneManager.scene.add(wallFlowerGroup);
    
    if (sceneManager.registerProjectGroup) {
      sceneManager.registerProjectGroup('wallflower', wallFlowerGroup);
    }
    
    if (sceneManager.container) {
      sceneManager.container.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      if (sceneManager && sceneManager.container) {
        sceneManager.container.removeEventListener('mousemove', handleMouseMove);
      }
    };
    return null;
  }, [sceneManager, handleMouseMove, initializeManager, modelSchema]);

  useEffect(() => {
    if (!managerRef.current || !sceneManager || !sceneManager.registerUpdateFunction) return;
    
    const unregister = sceneManager.registerUpdateFunction('wallflower', (deltaTime) => {
      managerRef.current.update(deltaTime);
    });
    
    return unregister;
  }, [sceneManager]);

  useImperativeHandle(ref, () => ({
    getManager: () => managerRef.current,
  }));

  return <div style={{ display: 'none' }} data-loading={isLoading} />;
});

export default WallFlowerVisualization;