import * as THREE from 'three';
import ProfileExecutor from './ProfileExecutor';

const CONSTANTS = {
    NORMALIZED_MIN: 0.0,
    NORMALIZED_MAX: 1.0,
    MIN_BRIGHTNESS_ON: 0.2,
    MIN_BRIGHTNESS_OFF: 0.01,
    AUDIO_REACTIVITY_TIMEOUT: 5.0,
    TRANSITION_DURATION: 0.5,
    DISTANCE_OVERRIDE_THRESHOLD: 0.5,
    FREQ_LOW: 0x01,
    FREQ_MID: 0x02,
    FREQ_HIGH: 0x04,
    FREQ_NONE: 0x00,
};

class Supply {
  constructor(id, type, canRotate = false) {
    this.id = id;                
    this.type = type;            
    this.canRotate = canRotate;  
    this.model = null;           
    this.targetMaterials = [];   
    this.enabled = false;        
    this.brightness = 0.0;       
    this.audioActive = false;    
    this.targetMagnitude = 0.0;  
  }
}

class ModelCache {
  constructor() {
    this.models = new Map();  // path -> loaded model
  }

  has(path) {
    return this.models.has(path);
  }

  get(path) {
    return this.models.get(path);
  }

  set(path, model) {
    this.models.set(path, model);
  }
}

class NeonController {
  constructor(id, group, modelConfig) {
    this.id = id;
    this.group = group;
    this.modelConfig = modelConfig;
    
    this.modelCache =  new ModelCache();;
    this.supplies = this.createSuppliesFromConfig(modelConfig);

    this.motorEnable = true;
    this.direction = true;
    this.currentSpeed = 0.0;
    this.targetSpeed = 0.0;
    this.distance = 0.0;

    this.audioActive = false;
    this.profileActive = false;
    this.manualModeActive = false;
    this.isInDistanceOverride = false;
    
    this.valuesManual = {
      supplies: this.supplies.map(() => ({
        enabled: false,
        brightness: 0.0
      })),
      motorEnable: false,
      motorDirection: false,
      motorSpeed: 0.0
    };
    
    // these are for distance override
    this.valuesLast = {
      supplies: this.supplies.map(supply => ({
        enabled: false, 
        brightness: 0.0
      })),
      motorEnable: false,
      motorDirection: false,
      motorSpeed: 0.0
    };
    
    this.valuesCurrent = {
      supplies: this.supplies.map(supply => ({
        enabled: false,
        brightness: 0.0
      })),
      motorEnable: false,
      motorDirection: false,
      motorSpeed: 0.0
    };
    
    this.transitionTimer = 0.0;
    
    this.profileExecutor = new ProfileExecutor();
    
    this.lastUpdateTime = Date.now();
    this.audioActivityTimer = 0;
  }

  createSuppliesFromConfig(modelConfig) {
    const supplies = [];
    
    if (modelConfig && modelConfig.supplies && Array.isArray(modelConfig.supplies)) {
      modelConfig.supplies.forEach(supplyConfig => {
        const supply = new Supply(
          supplyConfig.id,
          supplyConfig.type,
          supplyConfig.canRotate
        );
        if (supplyConfig.materials && Array.isArray(supplyConfig.materials)) {
          supply.materialConfigs = supplyConfig.materials.map(mat => {
            if (typeof mat === 'string') {
              return { name: mat, colorOverride: '', isEmissive: false, metalness: 0.0, roughness: 0.8, flatShading: true, needsUpdate: true };
            }
            return { ...mat };
          });
        } else {
          supply.materialConfigs = [];
        }
        
        supplies.push(supply);
      });
    }
    
    return supplies;
  }
    
  loadModels(loader, onComplete) {
    if (!this.modelConfig) {
      console.error(`No model configuration for controller ${this.id}`);
      if (onComplete) onComplete(false);
      return;
    }
    
    const uniqueModelPaths = new Set();
    if (this.modelConfig.supplies) {
      this.modelConfig.supplies.forEach(supply => {
        if (supply.model && supply.model.path) {
          uniqueModelPaths.add(supply.model.path);
        }
      });
    }
    
    if (uniqueModelPaths.size === 0) {
      console.error(`No valid model paths found for controller ${this.id}`);
      if (onComplete) onComplete(false);
      return;
    }
    
    let loadedCount = 0;
    const loadedModels = new Map();
    
    // Load each unique model once - need this as a workaround for the stool. Sort of hacky...
    uniqueModelPaths.forEach(modelPath => {
      if (this.modelCache.has(modelPath)) {
        loadedModels.set(modelPath, this.modelCache.get(modelPath));
        processNext();
      } else {
        loader.load(
          modelPath,
          (gltf) => {
            loadedModels.set(modelPath, gltf.scene);
            this.modelCache.set(modelPath, gltf.scene);
            processNext();
          },
          undefined,
          (error) => {
            console.error(`Error loading model ${modelPath} for controller ${this.id}:`, error);
            processNext();
          }
        );
      }
    });
    
    const processNext = () => {
      loadedCount++;
      
      if (loadedCount === uniqueModelPaths.size) {
        let successfulSetups = 0;
        
        this.modelConfig.supplies.forEach((supplyConfig, supplyIndex) => {
          if (!supplyConfig.model || !supplyConfig.model.path) return;
          
          const baseModel = loadedModels.get(supplyConfig.model.path);
          if (!baseModel) {
            console.error(`Model not found for supply ${supplyIndex}`);
            return;
          }
          
          const supplyModel = baseModel.clone(true);
          
          try {
            this.setupModel(supplyModel, supplyConfig.model, this.supplies[supplyIndex]);
            this.supplies[supplyIndex].model = supplyModel;
            successfulSetups++;
          } catch (error) {
            console.error(`Failed to set up model for supply ${supplyIndex}:`, error);
          }
        });
        
        if (onComplete) {
          onComplete(successfulSetups > 0);
        }
      }
    };
  }
  
setupModel(model, modelConfig, supply) {
  try {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    model.position.x = -center.x;
    model.position.y = -center.y;
    model.position.z = -center.z;

    model.position.x += modelConfig.position.x;
    model.position.y += modelConfig.position.y;
    model.position.z += modelConfig.position.z;

    model.rotation.x = modelConfig.rotation.x * (Math.PI / 180);
    model.rotation.y = modelConfig.rotation.y * (Math.PI / 180);
    model.rotation.z = modelConfig.rotation.z * (Math.PI / 180);

    const scale = modelConfig.scale;
    model.scale.set(scale, scale, scale);

    const materialMap = {};
    model.traverse((node) => {
      if (node.isMesh) {
        if (node.material) {
          if (node.material.name) {
            materialMap[node.material.name] = node.material;
          }
        }
      }
    });

    const targetMaterials = [];
    const standardMaterials = [];

    if (supply.materialConfigs && Array.isArray(supply.materialConfigs)) {
      for (const materialConfig of supply.materialConfigs) {
        const materialName = materialConfig.name;
        
        if (materialName && materialMap[materialName]) {
          const material = materialMap[materialName];
          
          if (materialConfig.isEmissive) {
            this.initializeEmissiveMaterial(material, materialConfig);
            targetMaterials.push({
              material: material,
              config: materialConfig
            });
          } else {
            this.initializeStandardMaterial(material, materialConfig);
            standardMaterials.push({
              material: material,
              config: materialConfig
            });
          }
        }
      }
    }

    supply.targetMaterials = targetMaterials;
    supply.standardMaterials = standardMaterials;
    
    this.group.add(model);
    this.updateVisuals();
    
    return true;
  } catch (err) {
    console.error(`Error processing model for supply ${supply.id} of controller ${this.id}:`, err);
    return false;
  }
}

// Split the material initialization into two methods
initializeEmissiveMaterial(material, materialConfig) {
  if (!material) return;
  
  material.userData = material.userData || {};
  if (!material.userData.originalColor) {
    if (materialConfig.colorOverride && materialConfig.colorOverride !== "") {
      material.userData.originalColor = new THREE.Color(materialConfig.colorOverride);
    } else {
      material.userData.originalColor = material.color ? 
        new THREE.Color().copy(material.color) : 
        new THREE.Color(1, 1, 1);
    }
  }
  
  material.emissive.copy(material.userData.originalColor);
  material.emissiveIntensity = CONSTANTS.MIN_BRIGHTNESS_OFF;
  
  if (material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial') {
    material.roughness = materialConfig.roughness;
    material.metalness = materialConfig.metalness;
  }
  
  material.needsUpdate = true;
}

initializeStandardMaterial(material, materialConfig) {
  if (!material) return;
  
  if (materialConfig.colorOverride && materialConfig.colorOverride !== "") {
    material.color.set(materialConfig.colorOverride);
  }
  
  if (material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial') {
    if (materialConfig.roughness !== undefined) material.roughness = materialConfig.roughness;
    if (materialConfig.metalness !== undefined) material.metalness = materialConfig.metalness;
    if (materialConfig.flatShading !== undefined) material.flatShading = materialConfig.flatShading;
  }
  
  material.needsUpdate = true;
}

updateVisuals() {
  if (this.supplies.length === 0) return;

  this.supplies.forEach(supply => {
    if (supply.targetMaterials && supply.targetMaterials.length > 0) {
      supply.targetMaterials.forEach(entry => {
        if (!entry || !entry.material) return;
        
        const material = entry.material;
        
        try {
          if (supply.enabled) {
            if (material.userData && material.userData.originalColor) {
              material.emissive.copy(material.userData.originalColor);
            }
            material.emissiveIntensity = Math.max(CONSTANTS.MIN_BRIGHTNESS_ON, supply.brightness);
          } else {
            material.emissive.set(0.1, 0.1, 0.1);
            material.emissiveIntensity = CONSTANTS.MIN_BRIGHTNESS_OFF;
          }
          
          material.needsUpdate = true;
        } catch (error) {
          console.error(`Error updating emissive material for supply ${supply.id}:`, error);
        }
      });
    }
  });
}

  updateRotation(deltaTime) {
    const rotatableSupplies = this.supplies.filter(s => s.canRotate);
    if (rotatableSupplies.length > 0 && this.motorEnable && this.currentSpeed > 0) {
      const rotationSpeed = this.currentSpeed * Math.PI * 0.1;
      const direction = this.direction ? 1 : -1;
      rotatableSupplies.forEach(supply => {
        if (supply.model) {
          supply.model.rotation.z += rotationSpeed * direction * deltaTime;
        }
      });
    }
  }
  
  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
     if (this.manualModeActive) {
      this.runManualMode();
    } else if (this.audioActive) {
      this.runAudioMode();
    } else if (this.profileExecutor.getProfileActive()) {
      this.runProfileMode(deltaTime);
    } else {
      this.runPassiveMode(deltaTime);

    }
    
    this.runDistanceOverride(deltaTime);
    this.updateVisuals();
    this.updateRotation(deltaTime);
    
    if (this.audioActive) {
      this.audioActivityTimer -= deltaTime;
      if (this.audioActivityTimer <= 0) {
        this.audioActive = false;
        this.supplies.forEach(supply => {
          supply.audioActive = false;
        });
      }
    }
  } 

  runProfileMode(deltaTime) {
    for (let i = 0; i < this.supplies.length; i++) {
      this.setSupplyEnabled(i, true);
    }
    this.updateProfileExecutor(deltaTime, true, true);
  }
    
  runAudioMode() {
    this.supplies.forEach(supply => {
      if (supply.audioActive) {
        supply.brightness = this.clamp(supply.targetMagnitude, CONSTANTS.NORMALIZED_MIN, CONSTANTS.NORMALIZED_MAX);
      }
    });
  }
    
  runManualMode() {    
    if (this.profileExecutor.getProfileActive()) {
      this.stopProfileExecutor();
    }

    this.supplies.forEach((supply, index) => {   
      if (index < this.valuesManual.supplies.length) {
        supply.enabled = this.valuesManual.supplies[index].enabled;
        supply.brightness = this.valuesManual.supplies[index].brightness;
      }
    });
    
    this.setMotorEnable(this.valuesManual.motorEnable);
    this.setDirection(this.valuesManual.motorDirection);
    this.setSpeed(this.valuesManual.motorSpeed);
    
    this.manualModeActive = false;
  }
    
  runPassiveMode(deltaTime) {
    for (let i = 0; i < this.supplies.length; i++) {
      // nothing for now
      // this.setSupplyEnabled(i, true);
    }
  }
    
  runDistanceOverride(deltaTime) {
    const withinDistanceThreshold = (this.distance < CONSTANTS.DISTANCE_OVERRIDE_THRESHOLD) && (this.distance > 0.0);
    
    if (withinDistanceThreshold) {
      if (!this.isInDistanceOverride) {
        this.supplies.forEach((supply, index) => {
          this.valuesLast.supplies[index] = {
            enabled: supply.enabled,
            brightness: supply.brightness
          };
        });
        
        this.valuesLast.motorEnable = this.motorEnable;
        this.valuesLast.motorDirection = this.direction;
        this.valuesLast.motorSpeed = this.currentSpeed;
        
        this.transitionTimer = 0.0;
        this.isInDistanceOverride = true;
        
        this.supplies.forEach(supply => {
          this.setSupplyEnabled(supply.id, true);
        });
        
        this.setMotorEnable(true);
      }
      
      this.updateDistanceOverrideValues();
      
      this.transitionTimer = Math.min(this.transitionTimer + deltaTime, CONSTANTS.TRANSITION_DURATION);
      const progress = this.transitionTimer / CONSTANTS.TRANSITION_DURATION;
      
      // apply transitions to all supplies
      this.supplies.forEach((supply, index) => {
        supply.brightness = this.lerp(
          this.valuesLast.supplies[index].brightness,
          this.valuesCurrent.supplies[index].brightness,
          progress
        );
      });
      let speed = this.lerp(this.valuesLast.motorSpeed, this.valuesCurrent.motorSpeed, progress);
      this.setSpeed(speed);
      this.setDirection(this.valuesCurrent.motorDirection);
    }
    else if (this.isInDistanceOverride) {
      if (this.transitionTimer === CONSTANTS.TRANSITION_DURATION) {
        this.transitionTimer = 0.0;
      }
      
      this.transitionTimer = Math.min(this.transitionTimer + deltaTime, CONSTANTS.TRANSITION_DURATION);
      const progress = this.transitionTimer / CONSTANTS.TRANSITION_DURATION;
      
      this.supplies.forEach((supply, index) => {
        supply.brightness = this.lerp(
          this.valuesCurrent.supplies[index].brightness,
          this.valuesLast.supplies[index].brightness,
          progress
        );
      });
      
      this.setSpeed(this.lerp(this.valuesCurrent.motorSpeed, this.valuesLast.motorSpeed, progress));
      this.setDirection(this.valuesLast.motorDirection);
      
      // once transition is complete, fully restore original state
      if (this.transitionTimer >= CONSTANTS.TRANSITION_DURATION) {
        this.isInDistanceOverride = false;
        
        this.supplies.forEach((supply, index) => {
          supply.enabled = this.valuesLast.supplies[index].enabled;
        });
        
        this.setMotorEnable(this.valuesLast.motorEnable);
      }
    }
  }
    
  updateDistanceOverrideValues() {
    const normalizedDistance = this.mapRange(
      this.distance, 
      CONSTANTS.DISTANCE_OVERRIDE_THRESHOLD, 
      0.0, 
      CONSTANTS.NORMALIZED_MIN, 
      CONSTANTS.NORMALIZED_MAX
    );
    
    const clampedDistance = this.clamp(normalizedDistance, CONSTANTS.NORMALIZED_MIN, CONSTANTS.NORMALIZED_MAX);
    
    this.supplies.forEach((_, index) => {
      this.valuesCurrent.supplies[index] = {
        enabled: true,
        brightness: clampedDistance
      };
    });
    
    this.valuesCurrent.motorSpeed = clampedDistance;
    this.valuesCurrent.motorDirection = !this.valuesLast.motorDirection;
  }
    
  // Command handlers
  handleManualMessage(msg) {
    this.manualModeActive = true;
    
    if (this.profileExecutor.getProfileActive()) {
      this.stopProfileExecutor();
    }
    if (msg.supplies && Array.isArray(msg.supplies)) {
      this.valuesManual.supplies = msg.supplies.map((supply, index) => ({
        enabled: supply.enabled,
        brightness: supply.brightness
      }));
    }
    this.valuesManual.motorEnable = msg.motorEnable;
    this.valuesManual.motorDirection = msg.motorDirection;
    this.valuesManual.motorSpeed = msg.motorSpeed;
  }
    
  handleProfileMessage(msg) {
    if (msg.stopProfile === true) {
      this.stopProfileExecutor();
      return;
    }
    
    const profileParams = {
      type: msg.profileType,
      magnitude: msg.magnitude || 0.5,
      frequency: msg.frequency || 1.0,
      phase: msg.phase || 0.0,
      enabled: msg.enabled !== undefined ? msg.enabled : true,
      stopProfile: msg.stopProfile || false
    };
    
    if (profileParams.enabled) {
      this.startProfileExecutor(profileParams);
    } else {
      this.stopProfileExecutor();
    }
  }

  handleAudioMessage(msg) {    
    this.audioActive = true;
    this.audioActivityTimer = CONSTANTS.AUDIO_REACTIVITY_TIMEOUT;
    
    this.supplies.forEach(supply => {
      supply.audioActive = false;
      supply.targetMagnitude = 0.0;
    });
    
    const audioMsg = msg.audio.find(am => am.controllerIndex === this.id);
    
    if (audioMsg){
      if (audioMsg.audioSupplyFlags && Array.isArray(audioMsg.audioSupplyFlags)) {
        audioMsg.audioSupplyFlags.forEach((flag, supplyIndex) => {
          if (supplyIndex >= 0 && supplyIndex < this.supplies.length) {
            const supply = this.supplies[supplyIndex];
            
            if (flag !== CONSTANTS.FREQ_NONE) {
              supply.audioActive = true;
              
              if (flag === CONSTANTS.FREQ_LOW) {
                supply.targetMagnitude = audioMsg.weightedLowMagnitude;
              } else if (flag === CONSTANTS.FREQ_MID) {
                supply.targetMagnitude = audioMsg.weightedMidMagnitude;
              } else if (flag === CONSTANTS.FREQ_HIGH) {
                supply.targetMagnitude = audioMsg.weightedHighMagnitude;
              }
            }
          }
        });
      }
    }
  }
  
  startProfileExecutor(profile) {
    this.profileExecutor.startProfile(profile);
  }

  stopProfileExecutor() {
    if (this.profileExecutor) {
      this.profileExecutor.stopProfile();
      this.profileActive = false;
      
      // Restore initial values if they exist
      if (this.initialValues) {
        this.supplies.forEach((supply, index) => {
          if (index < this.initialValues.supplies.length) {
            supply.brightness = this.initialValues.supplies[index].brightness;
          }
        });
        
        this.setSpeed(this.initialValues.motorSpeed);
      }
    }
  }
    
  updateProfileExecutor(deltaTime, brightnessEnable, motorEnable) {
    if (this.profileExecutor.getProfileActive()) {
      if (!this.profileActive) {
        this.profileActive = true;
        this.initialValues = {
          supplies: this.supplies.map(supply => ({
            enabled: supply.enabled,
            brightness: supply.brightness
          })),
          motorSpeed: this.currentSpeed
        };
      }
      
      const values = {
        supplies: this.supplies.map(supply => supply.brightness),
        motorValue: this.currentSpeed
      };
      
      if (this.profileExecutor.updateProfileValues(deltaTime, values)) {
        if (brightnessEnable && values.supplies) {
          for (let i = 0; i < this.supplies.length && i < values.supplies.length; i++) {
            this.supplies[i].brightness = values.supplies[i];
          }
        }
        
        if (motorEnable) {
          this.setSpeed(values.motorValue);
        }
      } 
    }
  }

  setSupplyEnabled(index, enabled) {
    if (index >= 0 && index < this.supplies.length) {
      this.supplies[index].enabled = enabled;
    }
  }
  
  setSupplyBrightness(index, brightness) {
    if (index >= 0 && index < this.supplies.length) {
      this.supplies[index].brightness = this.clamp(brightness, CONSTANTS.NORMALIZED_MIN, CONSTANTS.NORMALIZED_MAX);
    }
  }
  
  setMotorEnable(enable) {
    this.motorEnable = enable;
  }
  
  setDirection(direction) {
    this.direction = direction;
  }
  
  setSpeed(speed) {
    this.currentSpeed = speed;
  }
  
  setDistance(distance) {
    this.distance = distance;
  }
  
  // Utility functions
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  
  lerp(a, b, t) {
    return a + t * (b - a);
  }
  
  mapRange(value, inMin, inMax, outMin, outMax) {
    return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
  }
}

export default NeonController;