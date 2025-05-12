import NeonController from './NeonController';
import AudioAnalyzer from '../AudioAnalyzer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CONSTANTS = {
  NUM_LOW: 5,
  NUM_MID: 5,
  NUM_HIGH: 5,
  FREQ_LOW: 1,
  FREQ_MID: 2,
  FREQ_HIGH: 4,
  FREQ_NONE: 0
};

class NeonManager {
  constructor(group, modelSchema, initialState, numControllers, suppliesPerController = 2) {
    this.group = group;
    this.modelSchema = modelSchema;
    this.controllers = [];
    this.numControllers = numControllers;
    this.initialState = initialState || {};
    this.audioAnalyzer = new AudioAnalyzer();
    
    // Audio config
    this.audioConfig = initialState?.audioConfig || {
      audioMode: 'fixed',
      audioAllowMultipleActive: false,
      audioWeights: {
        low: [0.4, 0.4, 0.1, 0.1, 0.0],
        mid: [0.2, 0.2, 0.2, 0.2, 0.2],
        high: [0.5, 0.5, 0.0, 0.0, 0.0]
      },
      audioFastAlpha: 0.9,
      audioSlowAlpha: 0.2,
      audioSupplyFlags: Array(numControllers)
        .fill(0)
        .map(() => Array(suppliesPerController).fill(CONSTANTS.FREQ_NONE)),
      audioMagnitudeThresholds: [0.25, 0.25, 0.25]
    };

    this.prevailingWeightedLowMagnitude = 0.0;
    this.prevailingWeightedMidMagnitude = 0.0;
    this.prevailingWeightedHighMagnitude = 0.0;
    
    this.audioMessages = Array(numControllers).fill().map((_, idx) => ({
      controllerIndex: idx,
      frequencyFlag: 0,
      weightedLowMagnitude: 0.0,
      weightedMidMagnitude: 0.0,
      weightedHighMagnitude: 0.0
    }));
    
    this.audioReactivityEnabled = true;
    this.pulseReady = false;
    this.wasAboveThreshold = false;
    this.readyForNextPulse = true;
    this.hasControllerPulsed = Array(numControllers).fill(false);
    
    this.pendingProfiles = [];
    this.directControlProfile = false;
    this.directControlAudio = false;
    this.directControlManual = false;

    this.passiveMode = {
      enabled: true,
      active: false,
      currentProfileSet: 0,
      profileSetTimer: 0,
      profileSetDuration: 120,
      motorChangeTimer: 0,
      motorChangeDuration: 8,
      motorTransitionDuration: 1.5,
      motorTransitioning: false,
      motorTransitionTimer: 0,
      currentMotorState: []
    };

    // Initialize motor states for each controller
    this.passiveMode.currentMotorState = Array(numControllers).fill().map(() => ({
      speed: 0.2,
      direction: Math.random() > 0.5,
      targetSpeed: 0.2,
      targetDirection: false,
      enabled: true
    }));

    this.passiveProfileSets = [
      {
        type: 'sync',
        profile: {
          profileType: 0,
          magnitude: 0.9,
          frequency: 0.5,
          phase: 0.3
        },
        motor: {
          speedRange: [0.1, 0.3],
          directionChangeProb: 0.2,
          enableMotor: true
        }
      },
      {
        type: 'sync',
        profile: {
          profileType: 3,
          magnitude: 0.9,
          frequency: 0.5,
          phase: 0.3
        }
      }
    ];

    this.inactivityTracker = {
      lastUserActionTime: Date.now(),
      inactivityThreshold: 60,
      checkingInactivity: false
    };
  }
  
  initialize(callback) {
    if (!this.modelSchema || !this.group) {
      console.error('Cannot initialize controllers: missing schema or group');
      if (callback) callback(false);
      return;
    }
    const loader = new GLTFLoader();
    
    const status = {
      loadingCount: 0,
      allSuccessful: true
    };
    
    const controllersToCreate = Math.min(this.modelSchema.length, this.numControllers);
    
    const handleLoadComplete = (controllerIndex, success) => {
      status.loadingCount--;
      
      if (!success) {
        console.error(`Failed to load models for controller ${controllerIndex}`);
        status.allSuccessful = false;
      }
      
      if (status.loadingCount === 0 && callback) {
        callback(status.allSuccessful);
      }
    };
    
    for (let i = 0; i < controllersToCreate; i++) {
      const controllerConfig = this.modelSchema[i];
      const controllerIndex = i;
      
      const controller = new NeonController(controllerIndex, this.group, controllerConfig);
      this.controllers[controllerIndex] = controller;
      
      this.applyInitialControllerState(controller, controllerIndex);
      
      status.loadingCount++;
      controller.loadModels(loader, (success) => handleLoadComplete(controllerIndex, success));
    }
    
    this.initializeAudioAnalyzer();
    
    if (status.loadingCount === 0 && callback) {
      console.warn('No controllers to initialize');
      callback(false);
    }
  }
  
  applyInitialControllerState(controller, id) {
    if (!controller) return;
    
    const { controllerData, profileData } = this.initialState;
    
    if (controllerData && controllerData[id]) {
      const data = controllerData[id];
      
      controller.handleManualMessage(data);
    }
    
    if (profileData && profileData[id] && profileData[id].enabled) {
      this.handleProfileRequest({
        ...profileData[id],
        index: id
      });
    }
  }
  
  initializeAudioAnalyzer() {
    this.audioAnalyzer.initialize().then(success => {
      if (success) {        
        this.audioAnalyzer.applyConfiguration({
          fastAlpha: this.audioConfig.audioFastAlpha || 0.9,
          slowAlpha: this.audioConfig.audioSlowAlpha || 0.2,
          weights: this.audioConfig.audioWeights
        });
        
        // Start audio playback if configured to auto-play
        if (this.audioAnalyzer.autoPlay) {
          this.audioAnalyzer.play();
        }
      } else {
        console.error('Failed to initialize audio analyzer');
      }
    });
  }
  
  update(deltaTime) {
    if (this.audioReactivityEnabled && this.audioAnalyzer) {
      this.updateAudio();
    }
    
    const inActiveMode = this.directControlProfile || 
                         this.directControlManual || 
                         this.directControlAudio;
    
    if (inActiveMode) {
      const currentTime = Date.now();
      const inactiveTime = (currentTime - this.inactivityTracker.lastUserActionTime) / 1000;
      
      if (inactiveTime > this.inactivityTracker.inactivityThreshold) {
        this.directControlManual = false;
        this.directControlProfile = false;
        this.directControlAudio = false;
        this.passiveMode.active = false;
      }
    }
    
    if (!this.directControlProfile && 
        !this.directControlManual && 
        !this.directControlAudio) {
      this.updatePassiveMode(deltaTime);
    }
    
    this.controllers.forEach(controller => {
      if (controller) {
        controller.update(deltaTime);
      }
    });
  }

  updatePassiveMode(deltaTime) {
    const passive = this.passiveMode;
    
    if (!passive.enabled) {
      if (passive.active) {
        this.cleanupPassiveMode();
      }
      return;
    }
    
    // Double check that no direct control is active
    if (this.directControlProfile || 
        this.directControlManual || 
        this.directControlAudio ||
        this.audioAnalyzer.isPlaying) {
      
      if (passive.active) {
        this.cleanupPassiveMode();
      }
      return;
    }
    
    if (!passive.active) {
      passive.active = true;
      passive.profileSetTimer = 0;
      passive.currentProfileSet = Math.floor(Math.random() * this.passiveProfileSets.length);
      passive.motorChangeTimer = 0;
      
      this.initializePassiveMotorStates();
      this.applyPassiveProfileSet(passive.currentProfileSet);
    }
    
    this.updatePassiveMotors(deltaTime);
    this.updatePassiveProfileSets(deltaTime);
  }

  updateAudio() {
    const magnitudes = this.audioAnalyzer.update();
    if (magnitudes) {
      const anyControllerActive = this.generatePulse(magnitudes);
      if (anyControllerActive) {
        this.directControlAudio = true;
        this.inactivityTracker.lastUserActionTime = Date.now();

        this.controllers.forEach((controller, controllerIndex) => {
          if (!controller || !controller.supplies || controller.supplies.length === 0) {
            return;
          }
          
          const audioMessage = {
            audio: []
          };
          
          const supplyFlags = this.audioConfig.audioSupplyFlags ? 
            this.audioConfig.audioSupplyFlags[controllerIndex] : [];
          
          const controllerAudioMsg = {
            controllerIndex: controllerIndex,
            weightedLowMagnitude: this.prevailingWeightedLowMagnitude,
            weightedMidMagnitude: this.prevailingWeightedMidMagnitude,
            weightedHighMagnitude: this.prevailingWeightedHighMagnitude,
            audioSupplyFlags: []
          };
          
          controller.supplies.forEach((supply, supplyIndex) => {
            const frequencyFlag = supplyIndex < supplyFlags.length ? 
              supplyFlags[supplyIndex] : CONSTANTS.FREQ_NONE;
              
            controllerAudioMsg.audioSupplyFlags.push(frequencyFlag);
          });
          
          const hasActiveSupply = controllerAudioMsg.audioSupplyFlags.some(flag => flag !== CONSTANTS.FREQ_NONE);
          
          if (hasActiveSupply || this.audioAnalyzer.isPlaying) {
            audioMessage.audio.push(controllerAudioMsg);
            controller.handleAudioMessage(audioMessage);
            this.inactivityTracker.lastUserActionTime = Date.now();
          }
        });
      }
    }
  }

  sendProfileToController(index, profile) {
    if (index >= 0 && index < this.controllers.length && this.controllers[index]) {
      this.controllers[index].handleProfileMessage(profile);
    }
  }

  setDistance(index, distance) {
    if (index >= 0 && index < this.controllers.length && this.controllers[index]) {
      this.controllers[index].setDistance(distance);
    }
  }
  
  handleAudioConfigRequest(audioConfig) {
    if (!audioConfig) return;
    
    this.audioConfig = {
      ...this.audioConfig,
      ...audioConfig
    };
    
    if (this.audioAnalyzer) {
      this.audioAnalyzer.applyConfiguration({
        fastAlpha: this.audioConfig.audioFastAlpha,
        slowAlpha: this.audioConfig.audioSlowAlpha,
        weights: this.audioConfig.audioWeights
      });
    }
  }

  handleManualRequest(request, index = 0) {
    this.inactivityTracker.lastUserActionTime = Date.now();
    this.directControlManual = true;
    
    if (this.passiveMode.active) {
      this.cleanupPassiveMode();
    }

    if (this.controllers[index]) {      
      let manualData = { ...request };
      this.controllers[index].handleManualMessage(manualData);
    }
  }
  
  handleProfileRequest(request, fromPassiveMode = false) {
    if (!fromPassiveMode) {
      this.inactivityTracker.lastUserActionTime = Date.now();
      this.directControlProfile = true;
      
      if (this.passiveMode.active) {
        this.cleanupPassiveMode();
      }
    }
  
    this.directControlProfile = true;
    
    if (request.stopProfile === true) {
      this.controllers.forEach((controller, idx) => {
        if (controller) {
          this.sendProfileToController(idx, { stopProfile: true });
        }
      });
      return;
    }
    
    if (Array.isArray(request)) {
      const enabledProfiles = request.filter(p => p.enabled !== false);
      const phaseOffset = request[0]?.phaseOffset ?? 0;
      const activeControllerCount = Math.min(enabledProfiles.length, this.controllers.length);
      
      enabledProfiles.forEach((profile) => {
        const controllerIdx = profile.index;
        if (controllerIdx >= 0 && controllerIdx < this.controllers.length) {
          const calculatedPhase = (controllerIdx / activeControllerCount) * phaseOffset;
          
          const profileWithPhase = {
            ...profile,
            phase: ((profile.phase || 0) + calculatedPhase) % 1.0
          };
          
          this.sendProfileToController(controllerIdx, profileWithPhase);
        }
      });
      return;
    }
  }
  
  generatePulse(magnitudes) {
    let anyControllerActive = false;
    this.pulseReady = false;
    
    this.audioMessages.forEach(msg => {
      msg.frequencyFlag = 0;
      msg.weightedLowMagnitude = 0;
      msg.weightedMidMagnitude = 0;
      msg.weightedHighMagnitude = 0;
    });
    
    this.updateFrequencyMagnitudes(magnitudes);
    
    // TODO: Add support for random and sequential modes
    switch (this.audioConfig.audioMode) {
      default:
        anyControllerActive = this.generateFixedPulse();
        break;
    }
    
    this.pulseReady = anyControllerActive;
    return anyControllerActive;
  }
  
  updateFrequencyMagnitudes(magnitudes) {
    this.prevailingWeightedLowMagnitude = 0.0;
    this.prevailingWeightedMidMagnitude = 0.0;
    this.prevailingWeightedHighMagnitude = 0.0;
    
    const lowMagnitudes = magnitudes.slice(0, CONSTANTS.NUM_LOW);
    const midMagnitudes = magnitudes.slice(CONSTANTS.NUM_LOW, CONSTANTS.NUM_LOW + CONSTANTS.NUM_MID);
    const highMagnitudes = magnitudes.slice(CONSTANTS.NUM_LOW + CONSTANTS.NUM_MID);
    
    this.prevailingWeightedLowMagnitude = Math.max(...lowMagnitudes, 0);
    this.prevailingWeightedMidMagnitude = Math.max(...midMagnitudes, 0);
    this.prevailingWeightedHighMagnitude = Math.max(...highMagnitudes, 0);
  }
  
  generateFixedPulse() {
    let anyActive = false;
    
    for (let controllerIdx = 0; controllerIdx < this.numControllers; controllerIdx++) {
      if (controllerIdx >= this.controllers.length || controllerIdx >= this.audioConfig.audioSupplyFlags.length) {
        continue;
      }
      
      const controller = this.controllers[controllerIdx];
      const numSupplies = controller && controller.supplies ? controller.supplies.length : 0;
      
      this.audioMessages[controllerIdx].frequencyFlag = CONSTANTS.FREQ_NONE;
      
      if (!this.audioMessages[controllerIdx].audioSupplyFlags) {
        this.audioMessages[controllerIdx].audioSupplyFlags = Array(numSupplies).fill(CONSTANTS.FREQ_NONE);
      }
      
      let controllerActive = false;
      
      for (let supplyIdx = 0; supplyIdx < numSupplies; supplyIdx++) {
        if (supplyIdx >= this.audioConfig.audioSupplyFlags[controllerIdx].length) {
          this.audioMessages[controllerIdx].audioSupplyFlags[supplyIdx] = CONSTANTS.FREQ_NONE;
          continue;
        }

        const frequencyFlag = this.audioConfig.audioSupplyFlags[controllerIdx][supplyIdx];
        const thresholdIndex = this.getThresholdIndexForFrequency(frequencyFlag);
        const threshold = this.audioConfig.audioMagnitudeThresholds[thresholdIndex] || 0.25;
        
        const isAboveThreshold = this.getMagnitudeAboveThreshold(
          frequencyFlag,
          this.prevailingWeightedLowMagnitude,
          this.prevailingWeightedMidMagnitude,
          this.prevailingWeightedHighMagnitude,
          threshold
        );
        
        if (isAboveThreshold) {
          this.audioMessages[controllerIdx].audioSupplyFlags[supplyIdx] = frequencyFlag;
          controllerActive = true;
        } else {
          this.audioMessages[controllerIdx].audioSupplyFlags[supplyIdx] = CONSTANTS.FREQ_NONE;
        }
      }
      
      if (controllerActive) {
        this.audioMessages[controllerIdx].weightedLowMagnitude = this.prevailingWeightedLowMagnitude;
        this.audioMessages[controllerIdx].weightedMidMagnitude = this.prevailingWeightedMidMagnitude;
        this.audioMessages[controllerIdx].weightedHighMagnitude = this.prevailingWeightedHighMagnitude;
        
        this.audioMessages[controllerIdx].controllerIndex = controllerIdx;
        
        anyActive = true;
      }
    }
    
    return anyActive;
  }
  
  getThresholdIndexForFrequency(frequencyFlag) {
    if (frequencyFlag === CONSTANTS.FREQ_LOW) return 0;
    if (frequencyFlag === CONSTANTS.FREQ_MID) return 1;
    if (frequencyFlag === CONSTANTS.FREQ_HIGH) return 2;
    return 0;
  }

  getMagnitudeAboveThreshold(frequencyFlag, lowMag, midMag, highMag, threshold = 0.25) {
    if ((frequencyFlag === CONSTANTS.FREQ_LOW) && lowMag > threshold) return true;
    if ((frequencyFlag === CONSTANTS.FREQ_MID) && midMag > threshold) return true;
    if ((frequencyFlag === CONSTANTS.FREQ_HIGH) && highMag > threshold) return true;
    return false;
  }

  updatePassiveProfileSets(deltaTime) {
    const passive = this.passiveMode;
    
    passive.profileSetTimer += deltaTime;
    if (passive.profileSetTimer >= passive.profileSetDuration) {
      passive.profileSetTimer = 0;
      
      let newProfileSet = Math.floor(Math.random() * this.passiveProfileSets.length);
      
      // Apply the new profile set immediately
      passive.currentProfileSet = newProfileSet;
      this.applyPassiveProfileSet(passive.currentProfileSet);
    }
  }

  updatePassiveMotors(deltaTime) {
    const passive = this.passiveMode;
    
    // Check if it's time to change motor speeds/directions
    if (passive.motorChangeTimer >= passive.motorChangeDuration) {
      passive.motorChangeTimer = 0;
      passive.motorTransitioning = true;
      passive.motorTransitionTimer = 0;
      
      // Set new target motor states for each controller
      this.updatePassiveMotorTargets();
    }
    
    // Handle motor transitions
    if (passive.motorTransitioning) {
      passive.motorTransitionTimer += deltaTime;
      const progress = Math.min(passive.motorTransitionTimer / passive.motorTransitionDuration, 1);
      
      // Update motor values based on transition progress
      this.controllers.forEach((controller, idx) => {
        if (controller && idx < passive.currentMotorState.length) {
          const motorState = passive.currentMotorState[idx];
          
          // Only update if motor is enabled for this profile set
          const profileSet = this.passiveProfileSets[passive.currentProfileSet];
          if (profileSet && profileSet.motor && profileSet.motor.enableMotor) {
            // Interpolate speed
            const interpolatedSpeed = this.lerp(motorState.speed, motorState.targetSpeed, progress);
            controller.setSpeed(interpolatedSpeed);
            
            // Update current speed
            motorState.speed = interpolatedSpeed;
            
            // Change direction only at the end of the transition
            if (progress >= 0.95 && motorState.direction !== motorState.targetDirection) {
              controller.setDirection(motorState.targetDirection);
              motorState.direction = motorState.targetDirection;
            }
            
            // Make sure motor is enabled
            controller.setMotorEnable(true);
          } else {
            // If motors should be disabled for this profile set
            controller.setMotorEnable(false);
          }
        }
      });
      
      // Check if transition is complete
      if (progress >= 1) {
        passive.motorTransitioning = false;
      }
    }
  }
    
  updatePassiveMotorTargets() {
    const passive = this.passiveMode;
    const currentSet = this.passiveProfileSets[passive.currentProfileSet];
    
    if (!currentSet || !currentSet.motor) return;
    
    this.controllers.forEach((controller, idx) => {
      if (controller && idx < passive.currentMotorState.length) {
        const motorState = passive.currentMotorState[idx];
        
        if (currentSet.motor.enableMotor) {
          let newTargetSpeed = motorState.speed; // Default to current
          if (currentSet.motor.speedRange) {
            const [min, max] = currentSet.motor.speedRange;
            
            if (currentSet.motor.individualSpeeds) {
              newTargetSpeed = min + Math.random() * (max - min);
            } else {
              if (idx === 0) {
                newTargetSpeed = min + Math.random() * (max - min);
                this._sharedTargetSpeed = newTargetSpeed;
              } else {
                newTargetSpeed = this._sharedTargetSpeed;
              }
            }
          }
          
          let newTargetDirection = motorState.direction;
          if (Math.random() < currentSet.motor.directionChangeProb) {
            newTargetDirection = !motorState.direction;
          }
          
          motorState.targetSpeed = newTargetSpeed;
          motorState.targetDirection = newTargetDirection;
        }
      }
    });
  }

  initializePassiveMotorStates() {
    const passive = this.passiveMode;
    const currentSet = this.passiveProfileSets[passive.currentProfileSet];
    
    if (!currentSet || !currentSet.motor) return;
    
    this.controllers.forEach((controller, idx) => {
      if (controller && idx < passive.currentMotorState.length) {
        let initialSpeed = 0.2; // Default
        if (currentSet.motor.speedRange) {
          const [min, max] = currentSet.motor.speedRange;
          initialSpeed = min + Math.random() * (max - min);
        }
        
        const initialDir = Math.random() > 0.5;
        
        passive.currentMotorState[idx] = {
          speed: initialSpeed,
          direction: initialDir,
          targetSpeed: initialSpeed,
          targetDirection: initialDir,
          enabled: currentSet.motor.enableMotor
        };
        
        if (currentSet.motor.enableMotor) {
          controller.setMotorEnable(true);
          controller.setSpeed(initialSpeed);
          controller.setDirection(initialDir);
        } else {
          controller.setMotorEnable(false);
        }
      }
    });
  }
  
  lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  applyPassiveProfileSet(setIndex) {
    const profileSet = this.passiveProfileSets[setIndex];
    
    if (!profileSet) return;
    
    switch(profileSet.type) {
      case 'sync':
        this.controllers.forEach((controller, idx) => {
          if (controller) {
            const phase = (idx / this.controllers.length) * (profileSet.profile.phase || 0);
            
            const profileRequest = {
              ...profileSet.profile,
              index: idx,
              enabled: true,
              phase: phase
            };
            this.sendProfileToController(idx, profileRequest);
          }
        });
        break;
      default:
        this.controllers.forEach((controller, idx) => {
          if (controller) {
            const profileRequest = {
              ...profileSet.profile,
              index: idx,
              enabled: true
            };
            this.sendProfileToController(idx, profileRequest);
          }
        });
        break;
    }
    
    this.updatePassiveMotorTargets();
  }
  
  setPassiveModeEnabled(enabled) {
    this.passiveMode.enabled = enabled;
    if (!enabled && this.passiveMode.active) {
      this.controllers.forEach((_, idx) => {
        this.sendProfileToController(idx, { stopProfile: true });
      });
      this.passiveMode.active = false;
    }
  }

  cleanupPassiveMode() {
    const passive = this.passiveMode;
    
    this.controllers.forEach((controller, idx) => {
      if (controller) {
        controller.profileExecutor.stopProfile();
      }
    });
    
    passive.active = false;
    passive.transitioning = false;
    passive.motorTransitioning = false;
    passive.profileSetTimer = 0;
    passive.motorChangeTimer = 0;
  }
}

export default NeonManager;