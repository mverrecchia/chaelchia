import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class DiscoKnobManager {
  constructor(group, modelSchema) {
    this.group = group;
    this.modelSchema = modelSchema;
    this.isLoading = true;
    this.enabled = true;
    this.direction = true;
    
    this.modelCache = new Map();
    
    this.discoBall = null;
    this.rotationSpeed = 0.1;
    this.lastUpdateTime = Date.now();
  }

  initialize(callback) {
    try {
      const loader = new GLTFLoader();
      if (!this.modelSchema || (!this.modelSchema.knob && !this.modelSchema.mount)) {
        throw new Error('Invalid model schema: missing knob or mount configuration');
      }
      this.initializeFromModelSchema(loader, callback);
    } catch (error) {
      console.error('Failed to initialize DiscoKnobManager:', error);
      this.isLoading = false;
      if (callback) callback(false);
    }
  }

  async loadModel(loader, modelConfig) {
    if (!modelConfig.path) {
      console.error('No model path provided');
      return null;
    }
    
    const modelPath = modelConfig.path;
    
    // Check cache first
    if (this.modelCache.has(modelPath)) {
      return this.modelCache.get(modelPath).clone();
    }
    
    try {
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          modelPath,
          resolve,
          undefined,
          reject
        );
      });
      
      this.modelCache.set(modelPath, gltf.scene.clone());
      return gltf.scene;
    } catch (error) {
      console.error(`Error loading model ${modelPath}:`, error);
      return null;
    }
  }

  initializeFromModelSchema(loader, callback) {
    this.discoBall = this.createDiscoBall();
    this.group.add(this.discoBall);
    this.loadModel(loader, this.modelSchema.knob.model)
      .then(knobModel => {
        if (knobModel) {
          this.setupModel(knobModel, this.modelSchema.knob);
          // After knob is loaded, load the mount
          return this.loadModel(loader, this.modelSchema.mount.model);
        }
        throw new Error('Failed to load knob model');
      })
      .then(mountModel => {
        if (mountModel) {
          this.setupModel(mountModel, this.modelSchema.mount);
          this.isLoading = false;
          if (callback) callback(true);
        } else {
          throw new Error('Failed to load mount model');
        }
      })
      .catch(error => {
        console.error('Error in model loading process:', error);
        this.isLoading = false;
        if (callback) callback(false);
      });
  }

  createDiscoBall() {
    const dummy = new THREE.Object3D();
    
    // silver mirror material
    const mirrorMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xC0C0C0,
      metalness: 0.8,
      roughness: 0.1,
      reflectivity: 1.0,
      side: THREE.DoubleSide,
      emissive: 0x222222,
      emissiveIntensity: 0.2
    });

    // base sphere
    const radius = 1.5;
    const innerGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const ballInnerMaterial = new THREE.MeshBasicMaterial({ color: 0x606060 });
    const innerMesh = new THREE.Mesh(innerGeometry, ballInnerMaterial);

    // mirror faces using spherical coordinates
    const mirrorSize = 0.1;
    const mirrorGeometry = new THREE.PlaneGeometry(mirrorSize, mirrorSize);
    
    // number of mirrors
    const rowCount = 32;  // Number of horizontal rows
    const approximateSpacing = mirrorSize * 1.2; // Slight gap between mirrors
    
    // mirrors per row at equator
    const equatorCircumference = 2 * Math.PI * radius;
    const mirrorsPerRow = Math.floor(equatorCircumference / approximateSpacing);
    
    // total number of mirrors
    let totalMirrors = 0;
    for (let row = 0; row < rowCount; row++) {
      const phi = Math.PI * (row + 0.5) / rowCount;
      const rowRadius = Math.sin(phi);
      const mirrorsInThisRow = Math.max(1, Math.floor(mirrorsPerRow * rowRadius));
      totalMirrors += mirrorsInThisRow;
    }

    const instancedMirrorMesh = new THREE.InstancedMesh(
      mirrorGeometry,
      mirrorMaterial,
      totalMirrors
    );

    let instanceCount = 0;
    
    for (let row = 0; row < rowCount; row++) {
      const phi = Math.PI * (row + 0.5) / rowCount;
      const rowRadius = Math.sin(phi);
      const y = Math.cos(phi) * radius;
      
      const mirrorsInThisRow = Math.max(1, Math.floor(mirrorsPerRow * rowRadius));
      
      for (let m = 0; m < mirrorsInThisRow; m++) {
        //  horizontal angle (theta) of each mirror
        const theta = (2 * Math.PI * m) / mirrorsInThisRow;
        
        // Convert spherical coordinates to Cartesian
        const x = radius * rowRadius * Math.cos(theta);
        const z = radius * rowRadius * Math.sin(theta);
        
        dummy.position.set(x, y, z);
        dummy.lookAt(0, 0, 0);
        dummy.rotateY(Math.PI);
        
        dummy.updateMatrix();
        instancedMirrorMesh.setMatrixAt(instanceCount, dummy.matrix);
        instanceCount++;
      }
    }

    instancedMirrorMesh.count = instanceCount;

    const stringHeight = 3;
    const stringRadius = 0.01;
    const stringGeometry = new THREE.CylinderGeometry(
      stringRadius,
      stringRadius,
      stringHeight,
      8,
      1
    );
    
    const stringMaterial = new THREE.MeshStandardMaterial({
      color: 0x303030,
      metalness: 0.3,
      roughness: 0.8
    });
    
    const string = new THREE.Mesh(stringGeometry, stringMaterial);
    string.position.set(0, radius + stringHeight/2, 0);
    
    const obj = new THREE.Group();
    obj.add(innerMesh, instancedMirrorMesh, string);
    
    // Position the disco ball appropriately
    obj.position.set(4, 7, -1.5);
    obj.rotation.set(0, Math.PI/2, 0);
    obj.scale.set(0.35, 0.35, 0.35);
    
    return obj;
  }

  setupModel(model, modelSchema) {
    const modelConfig = modelSchema.model;
    
    const scaleFactor = modelConfig.scale;
    model.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    if (modelConfig.rotation) {
      model.rotation.x = modelConfig.rotation.x * (Math.PI / 180);
      model.rotation.y = modelConfig.rotation.y * (Math.PI / 180);
      model.rotation.z = modelConfig.rotation.z * (Math.PI / 180);
    }
    
    if (modelConfig.position) {
      model.position.set(
        modelConfig.position.x,
        modelConfig.position.y,
        modelConfig.position.z
      );
    }
    
    if (modelSchema.materials && Array.isArray(modelSchema.materials)) {
      model.traverse((node) => {
        if (node.isMesh) {
          const materialConfig = modelSchema.materials.find(m => m.name === node.material.name);          
          if (materialConfig) {
            if (materialConfig.colorOverride) node.material.color.set(materialConfig.colorOverride);
            if (materialConfig.emissive) node.material.emissive.set(materialConfig.emissive);
            if (materialConfig.emissiveIntensity) node.material.emissiveIntensity = materialConfig.emissiveIntensity;
            if (materialConfig.metalness) node.material.metalness = materialConfig.metalness;
            if (materialConfig.roughness) node.material.roughness = materialConfig.roughness;
            if (materialConfig.flatShading) node.material.flatShading = materialConfig.flatShading;
            if (materialConfig.needsUpdate) node.material.needsUpdate = true;
          }
        }
      });
    }
    
    this.group.add(model);
  }

  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    if (this.enabled) {
        this.updateRotation(deltaTime);
    }
  }

  updateRotation(deltaTime) {
    if (this.discoBall) {
      const yAxis = new THREE.Vector3(0, 1, 0);
      const rotationAmount = deltaTime * Math.PI * this.rotationSpeed;
      if (this.direction) {
        this.discoBall.rotateOnWorldAxis(yAxis, rotationAmount);
      } else {
        this.discoBall.rotateOnWorldAxis(yAxis, -rotationAmount);
      }
    }
  }

  setDiscoData(discoData) {
    this.enabled = discoData.rotation.enabled;
    this.rotationSpeed = discoData.rotation.speed;
    this.direction = discoData.rotation.direction;
    this.color = discoData.spotlights.color;
    this.mode = discoData.spotlights.mode;
    this.mode_speed = discoData.spotlights.mode_speed;
  }
}

export default DiscoKnobManager;
