import { useEffect, useRef, forwardRef, useCallback } from 'react';
import * as THREE from 'three';

const NeonVisualization = forwardRef(({ sceneManager }, ref) => {
  const hitboxRef = useRef(null);

  const handleGlow = useCallback((isHovered) => {
    if (!hitboxRef.current) return;
    
    const material = hitboxRef.current.material;
    if (sceneManager && sceneManager.composer) {
      const bloomPass = sceneManager.composer.passes.find(pass => pass.name === 'UnrealBloomPass');
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
    if (!sceneManager || !hitboxRef.current) return;
    
    const raycaster = sceneManager.raycaster;
    const container = sceneManager.container;
  
    const mouse = new THREE.Vector2();
    
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, sceneManager.camera);  
    const intersects = raycaster.intersectObject(hitboxRef.current);
    
    if (intersects.length > 0) {
      if (!hitboxRef.current.userData.isHovered) {
        hitboxRef.current.userData.isHovered = true;
        handleGlow(true);
      }
    } else {
      if (hitboxRef.current.userData.isHovered) {
        hitboxRef.current.userData.isHovered = false;
        handleGlow(false);
      }
    }
  }, [sceneManager, handleGlow]);

  useEffect(() => {
    if (!sceneManager || !sceneManager.scene) return;

    const group = new THREE.Group();
    const hitboxGeometry = new THREE.PlaneGeometry(0.3, 0.27);
    const hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: false
    });

    const hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    hitboxRef.current = hitboxMesh;

    hitboxMesh.position.set(2.03, 2.33, -3.95);
    hitboxMesh.rotation.set(0, 0, 0);
    hitboxMesh.userData = {
      isHitbox: true,
      projectId: 'neon',
      isHovered: false
    };

    group.add(hitboxMesh);
    sceneManager.scene.add(group);

    if (sceneManager.registerProjectGroup) {
      sceneManager.registerProjectGroup('neon', group);
    }

    if (sceneManager.container) {
      sceneManager.container.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (group.parent) {
        group.parent.remove(group);
      }
      if (sceneManager.container) {
        sceneManager.container.removeEventListener('mousemove', handleMouseMove);
      }
      hitboxRef.current = null;
    };
  }, [sceneManager, handleMouseMove]);

  return null;
});

export default NeonVisualization;