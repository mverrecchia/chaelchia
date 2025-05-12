import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class FlipDiscManager {
  constructor(group, gridConfig, modelSchema) {
    this.group = group;
    this.modelSchema = modelSchema;
    this.gridConfig = gridConfig;
    this.rows = gridConfig.rows;
    this.cols = gridConfig.cols;
    
    this.discs = [];
    this.state = Array(this.rows * this.cols).fill(false);
    this.isLoading = true;
    this.error = null;
    
    this.drawingGrid = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
    this.cameraData = null;
    this.displayMode = 'drawing';
    
    this.patternData = null;
    this.patternTime = 0;
    this.patternUpdateInterval = 0.2;
    this.lastPatternUpdate = 0;
    
    this.patternStates = {
      clock: {
        size: 1,
        growing: true,
        maxSize: 20,
        minSize: 1
      },
      circle: {
        radius: 1,
        growing: true,
        maxRadius: 20,
        minRadius: 1
      },
      spiral: {
        angle: 0,
        maxLength: 50,
        thickness: 2
      },
      wave: {
        phase: 0,
        amplitude: this.rows / 6
      },
      organism: {
        x: Math.floor(this.cols / 2),
        y: Math.floor(this.rows / 2),
        radius: 1,
        maxRadius: 15,
        food: new Set(),
        consumed: new Set(),
        growthAccumulator: 0
      },
      bounce: {
      }
    };
    
    this.audioEnabled = true;
    this.soundPool = [];
    this.maxSounds = 1; // Maximum number of simultaneous sounds
    this.lastFlipTime = 0;
    this.minFlipInterval = 0; // Minimum time between sounds in ms
    
    this.initializeSoundPool();
    
    this.modelCache = new Map();
    this.initializeFood();
    
    this.ball = {
      x: this.cols / 2,
      y: this.rows / 2,
      dx: 0.5,
      dy: 0.3,
      size: 2
    };
  }
  
  initializeSoundPool() {
    for (let i = 0; i < this.maxSounds; i++) {
      const audio = new Audio('/audio/flipdisc_single.wav');
      audio.preload = 'auto';
      audio.volume = 0.2;
      this.soundPool.push({ 
        audio: audio, 
        inUse: false 
      });
    }
    
    document.addEventListener('click', () => {
      this.soundPool.forEach(sound => {
        sound.audio.load();
      });
    }, { once: true });
  }
  
  playFlipSound() {
    if (!this.audioEnabled) return;
    
    const currentTime = performance.now();
    if (currentTime - this.lastFlipTime < this.minFlipInterval) {
      return;
    }
    
    const availableSound = this.soundPool.find(sound => !sound.inUse);
    if (!availableSound) return;
    
    availableSound.audio.currentTime = 0;
    availableSound.audio.play();
  }
  
  toggleSound(enabled) {
    this.audioEnabled = enabled !== undefined ? enabled : !this.audioEnabled;
    return this.audioEnabled;
  }
    
  initialize(callback) {
    try {
      const loader = new GLTFLoader();
      if (this.modelSchema) {
        this.initializeFromModelSchema(loader, callback);
      } else {
        console.error('No model schema provided');
        if (callback) callback(false);
      }
    } catch (error) {
      console.error('Failed to initialize FlipDiscManager:', error);
      this.error = 'Failed to initialize: ' + error.message;
      this.isLoading = false;
      if (callback) callback(false);
    }
  }
  
  initializeFromModelSchema(loader, callback) {
    if (!this.modelSchema || !this.modelSchema.frame || !this.modelSchema.disc) {
      console.error('Invalid model schema structure');
      if (callback) callback(false);
      return;
    }
    
    // Load the frame model
    this.loadModel(loader, this.modelSchema.frame.model)
      .then(frameModel => {
        if (frameModel) {
          this.setupFrameModel(frameModel, this.modelSchema.frame);
          return this.loadModel(loader, this.modelSchema.disc.model);
        }
        throw new Error('Failed to load frame model');
      })
      .then(discModel => {
        if (discModel) {
          this.setupDiscGrid(discModel, this.modelSchema.disc);
          this.isLoading = false;
          if (callback) callback(true);
        } else {
          throw new Error('Failed to load disc model');
        }
      })
      .catch(error => {
        console.error('Error in model loading process:', error);
        this.error = error.message;
        this.isLoading = false;
        if (callback) callback(false);
      });
  }
  
  async loadModel(loader, modelConfig) {
    if (!modelConfig || !modelConfig.path) {
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
      
      // Cache the model
      this.modelCache.set(modelPath, gltf.scene.clone());
      
      return gltf.scene;
    } catch (error) {
      console.error(`Error loading model ${modelPath}:`, error);
      return null;
    }
  }
  
  setupFrameModel(frameModel, frameConfig) {
    const modelConfig = frameConfig.model;
    
    const scaleFactor = modelConfig.scale;
    frameModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    if (modelConfig.rotation) {
      frameModel.rotation.x = modelConfig.rotation.x * (Math.PI / 180);
      frameModel.rotation.y = modelConfig.rotation.y * (Math.PI / 180);
      frameModel.rotation.z = modelConfig.rotation.z * (Math.PI / 180);
    }
    
    if (modelConfig.position) {
      frameModel.position.set(
        modelConfig.position.x,
        modelConfig.position.y,
        modelConfig.position.z
      );
    }
    
    if (frameConfig.materials && Array.isArray(frameConfig.materials)) {
      frameModel.traverse((node) => {
        if (node.isMesh) {
          const materialConfig = frameConfig.materials.find(m => m.name === node.material.name);          
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
    
    this.group.add(frameModel);
  }
  
  setupDiscGrid(discModel, discConfig) {
    const modelConfig = discConfig.model;
    const scaleFactor = modelConfig.scale;
    
    discModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    const basePosition = modelConfig.position;
    
    const modelSize = new THREE.Box3().setFromObject(discModel).getSize(new THREE.Vector3());
    const spacingX = modelSize.x * 0.1; // 10% of width as spacing
    const spacingY = modelSize.y * 0.12; // 12% of height as spacing
    
    const totalWidth = this.cols * (modelSize.x + spacingX);
    const totalHeight = this.rows * (modelSize.y + spacingY);
    const startX = -totalWidth / 2 + modelSize.x / 2;
    const startY = totalHeight / 2 - modelSize.y / 2;
    
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const disc = discModel.clone();
        
        const x = startX + col * (modelSize.x + spacingX);
        const y = startY - row * (modelSize.y + spacingY);
        
        disc.position.set(
          x + basePosition.x,
          y + basePosition.y,
          basePosition.z
        );
        
        if (modelConfig.rotation) {
          disc.rotation.x = modelConfig.rotation.x * (Math.PI / 180);
          disc.rotation.y = modelConfig.rotation.y * (Math.PI / 180);
          disc.rotation.z = modelConfig.rotation.z * (Math.PI / 180);
        }

        if (discConfig.materials && Array.isArray(discConfig.materials)) {
          disc.traverse((node) => {
            if (node.isMesh) {
              const materialConfig = discConfig.materials.find(m => m.name === node.material.name);          
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
        
        this.group.add(disc);
        
        this.discs.push({
          object: disc,
          row: row,
          col: col,
          flipped: this.drawingGrid[row][col] === 1
        });
      }
    }
  }
    
  updateAnimations(deltaTime) {
    const currentTime = performance.now();
    
    // Update all disc animations
    for (const disc of this.discs) {
      if (disc.animation && disc.animation.active) {
        const elapsed = currentTime - disc.animation.startTime;
        const progress = Math.min(elapsed / disc.animation.duration, 1.0);
        
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress 
          : -1 + (4 - 2 * progress) * progress;
        
        const rotation = disc.animation.startRotation + 
          (disc.animation.endRotation - disc.animation.startRotation) * easeProgress;
        
        disc.object.setRotationFromAxisAngle(disc.animation.axis, rotation);
        
        if (progress >= 1.0) {
          disc.animation.active = false;
        }
      }
    }
  }

  update(deltaTime) {
    if (this.isLoading) return;
    
    this.updateAnimations(deltaTime);
    
    if (this.displayMode === 'camera' && this.cameraData && this.cameraData.faceLandmarks) {
      // Generate and apply face pattern
      const pattern = this.generateFaceLandmarkPattern(
        this.cameraData.faceLandmarks[0], 
        this.cameraData.gestures
      );
      this.applyPatternToDiscs(pattern);
    }
    else if (this.displayMode === 'pattern' && this.patternData) {
      this.patternTime += deltaTime;
      
      const updateInterval = this.patternUpdateInterval / (this.patternData.speed || 1.0);
      if (this.patternTime - this.lastPatternUpdate >= updateInterval) {
        this.updatePattern(deltaTime);
        this.lastPatternUpdate = this.patternTime;
      }
    }
  }

  setCameraData(cameraData) {
    this.cameraData = cameraData;
    if (cameraData) {
      this.displayMode = 'camera';
    }
  }
    
  setDrawingGrid(gridData) {
    if (!gridData) {
      console.error('No grid data provided');
      return;
    }

    // Handle both old format (just grid) and new format (grid + invert)
    const grid = Array.isArray(gridData) ? gridData : gridData.grid;
    const shouldInvert = gridData.invert || false;

    if (!grid || grid.length !== this.rows || grid[0].length !== this.cols) {
      console.error('Invalid grid data provided');
      return;
    }
    
    this.drawingGrid = grid;
    this.displayMode = 'drawing';
    this.patternData = null;

    // Apply inversion if needed
    if (shouldInvert) {
      this.drawingGrid = this.drawingGrid.map(row => 
        row.map(cell => cell === 1 ? 0 : 1)
      );
    }

    this.updateVisualization();
  }
    
  setPattern(patternData) {
    if (patternData) {
      this.patternData = patternData;
      this.displayMode = 'pattern';
      this.patternTime = 0;
      this.lastPatternUpdate = 0;
      
      this.resetPatternState(patternData.id);
    }
    this.updateVisualization();
  }
  
  resetPatternState(patternTypeId) {
    const patternMap = {
      1: 'Clock',
      2: 'Spiral',
      3: 'Wave',
      4: 'Blob',
      5: 'Cascade',
      6: 'Bounce'
    };
    
    const patternName = patternMap[patternTypeId];
    
    if (patternName === 'Clock') {
      this.patternStates.clock = {
        size: 1,
        growing: true,
        maxSize: 20,
        minSize: 1
      };
    } else if (patternName === 'Spiral') {
      this.patternStates.spiral = {
        angle: 0,
        maxLength: 50,
        thickness: 2
      };
    } else if (patternName === 'Wave') {
      this.patternStates.wave = {
        phase: 0,
        amplitude: this.rows / 6
      };
    } else if (patternName === 'Blob') {
      // Wand pattern doesn't need persistent state
    } else if (patternName === 'Cascade') {
      this.patternStates.cascade = {
        flippedDiscs: [],
        totalFlipped: 0,
        maxFlips: Math.min(this.rows, this.cols) * 50,
        currentInterval: 1000, // Start slow (1 second between flips)
        minInterval: 50, // Fastest speed in milliseconds
        lastFlipTime: 0,
        isActive: true
      };
    }
  }
    
  updatePattern(deltaTime) {
    if (!this.patternData) return;
    const patternFunctions = {
      1: this.generateClockPattern.bind(this),
      2: this.generateSpiralPattern.bind(this),
      3: this.generateWavePattern.bind(this),
      4: this.generateBlobPattern.bind(this),
      5: this.generateCascadePattern.bind(this),
      6: this.generateBouncePattern.bind(this)
    };
    
    const patternFunction = patternFunctions[this.patternData.id];
    
    if (patternFunction && this.patternData.enable) {
      patternFunction(deltaTime);
    }
  }
  
  generateSquarePattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    const state = this.patternStates.square;
    const centerRow = Math.floor(this.rows / 2);
    const centerCol = Math.floor(this.cols / 2);
    

    if (state.size == 0) {
      this.setPixel(centerCol - 1, centerRow, true);
      this.setPixel(centerCol + 1, centerRow, true);
      this.setPixel(centerCol, centerRow - 1, true);
      this.setPixel(centerCol, centerRow + 1, true);
    }
    // Draw a square with the current size
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const distX = Math.max(0, Math.abs(col - centerCol + 0.5) - 0.5);
        const distY = Math.max(0, Math.abs(row - centerRow + 0.5) - 0.5);
        const distMax = Math.max(distX, distY);
        
        // Make the square thicker by including adjacent sizes
        if (distMax === state.size || distMax === state.size - 1) {  // Two dots thick
          const index = row * this.cols + col;
          pattern[index] = true;
        }
      }
    }
    
    if (state.growing) {
      state.size++;
      if (state.size >= state.maxSize) {
        state.growing = false;
      }
    } else {
      state.size--;
      if (state.size <= state.minSize) {
        state.growing = true;
      }
    }
    
    this.applyPatternToDiscs(pattern);
  }
  
  generateClockPattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    const hourTens = Math.floor(hours / 10);
    const hourOnes = hours % 10;
    const minuteTens = Math.floor(minutes / 10);
    const minuteOnes = minutes % 10;
    
    const canvas = document.createElement('canvas');
    canvas.width = 13;
    canvas.height = 13;
    const ctx = canvas.getContext('2d');
    
    // Set up text properties
    ctx.font = 'bold 13px verdana';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    const drawDigit = (digit, offsetX, offsetY) => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = 'black';
      ctx.fillText(digit.toString(), canvas.width/2, canvas.height/2);
      
      // Convert to pattern
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const pixelIndex = (y * canvas.width + x) * 4;
          // Check if pixel is black (R value < 128)
          const isBlack = imageData.data[pixelIndex] < 128;
          
          if (isBlack) {
            const patternX = offsetX + x;
            const patternY = offsetY + y;
            
            // Make sure we're within bounds
            if (patternX >= 0 && patternX < this.cols && 
                patternY >= 0 && patternY < this.rows) {
              pattern[patternY * this.cols + patternX] = true;
            }
          }
        }
      }
    };
    
    drawDigit(hourTens, 2, 1);
    drawDigit(hourOnes, 13, 1);
    
    drawDigit(minuteTens, 2, 13);
    drawDigit(minuteOnes, 13, 13);
    
    
    this.applyPatternToDiscs(pattern);
  }
  
  generateSpiralPattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    const state = this.patternStates.spiral;
    const centerRow = Math.floor(this.rows / 2);
    const centerCol = Math.floor(this.cols / 2);
    
    // Increase angle for spiral animation
    state.angle += 0.2;
    
    // Length of the spiral arm
    const maxLength = state.maxLength;
    
    // Draw a spiral
    for (let t = 0; t < 50; t += 0.1) {
      // Parametric equation for spiral
      const r = t * 2;
      const angle = t * 2 + state.angle;
      
      // Convert polar to cartesian coordinates
      const x = Math.round(centerCol + r * Math.cos(angle));
      const y = Math.round(centerRow + r * Math.sin(angle));
      
        // Add thickness by including adjacent points
      const offsets = [
          [0, 0],   // Center point
          [0, 1],   // Point above
          [1, 1],  // Point below
          [1, 0],   // Point right
      ];
      
      // Apply each offset to create thickness
      for (const [dx, dy] of offsets) {
          const newX = x + dx;
          const newY = y + dy;
          
          // Check if the point is within the grid
          if (newX >= 0 && newX < this.cols && newY >= 0 && newY < this.rows) {
              const index = newY * this.cols + newX;
              pattern[index] = true;
          }
      }
      
      // Break if we've reached the maximum length
      if (r > maxLength) break;
    }
    
    this.applyPatternToDiscs(pattern);
  }
  
  generateBlobPattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    // Update organism position - move towards nearest food
    let nearestFood = null;
    let minDistance = Infinity;
    
    // Find nearest unconsumed food
    for (const foodPos of this.patternStates.organism.food) {
      if (!this.patternStates.organism.consumed.has(foodPos)) {
        const [foodX, foodY] = foodPos.split(',').map(Number);
        const dx = foodX - this.patternStates.organism.x;
        const dy = foodY - this.patternStates.organism.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestFood = [foodX, foodY];
        }
      }
    }
    
    // Move towards nearest food
    if (nearestFood) {
      const baseSpeed = 0.15;
      const moveSpeed = baseSpeed * (1 - (this.patternStates.organism.radius / this.patternStates.organism.maxRadius) * 0.5);
      
      const dx = nearestFood[0] - this.patternStates.organism.x;
      const dy = nearestFood[1] - this.patternStates.organism.y;
      const angle = Math.atan2(dy, dx);
      
      this.patternStates.organism.x += Math.cos(angle) * moveSpeed;
      this.patternStates.organism.y += Math.sin(angle) * moveSpeed;
      
      // Check if we're close enough to consume food
      const consumeDistance = this.patternStates.organism.radius;
      if (minDistance < consumeDistance) {
        const foodKey = `${nearestFood[0]},${nearestFood[1]}`;
        if (!this.patternStates.organism.consumed.has(foodKey)) {
          this.patternStates.organism.consumed.add(foodKey);
          
          // Growth logic
          this.patternStates.organism.growthAccumulator += 0.1;
          if (this.patternStates.organism.growthAccumulator >= 1) {
            this.patternStates.organism.radius = Math.min(
              this.patternStates.organism.maxRadius,
              this.patternStates.organism.radius + 0.2
            );
            this.patternStates.organism.growthAccumulator = 0;
          }
          
          // Add new food dot when one is consumed
          this.addNewFoodDot();
        }
      }
    }
    
    // Draw the organism and food
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Draw unconsumed food dots
        const foodKey = `${Math.floor(x)},${Math.floor(y)}`;
        if (this.patternStates.organism.food.has(foodKey) && !this.patternStates.organism.consumed.has(foodKey)) {
          if (Math.floor(x) === Math.floor(parseFloat(foodKey.split(',')[0])) &&
              Math.floor(y) === Math.floor(parseFloat(foodKey.split(',')[1]))) {
            pattern[y * this.cols + x] = true;
          }
          continue;
        }
        
        // Draw the organism
        const dx = x - this.patternStates.organism.x;
        const dy = y - this.patternStates.organism.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.patternStates.organism.radius) {
          const sphereFactor = Math.cos((distance / this.patternStates.organism.radius) * Math.PI * 0.5);
          const shadingThreshold = 0.7 + (sphereFactor * 0.3);
          
          if (Math.random() < shadingThreshold) {
            pattern[y * this.cols + x] = true;
          }
        }
      }
    }
    
    this.applyPatternToDiscs(pattern);
  }
  
  generateWavePattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    const state = this.patternStates.wave;
    state.phase += 0.2; // Increase phase for wave animation
    
    // Draw a sine wave pattern
    for (let col = 0; col < this.cols; col++) {
      // Calculate wave height for this column
      const wave1 = Math.sin(state.phase + col * 0.3) * state.amplitude;
      const wave2 = Math.sin(state.phase * 0.7 + col * 0.4) * (state.amplitude * 0.5);
      const waveHeight = wave1 + wave2;
      
      const centerRow = Math.floor(this.rows / 2);
      const waveRow = Math.round(centerRow + waveHeight);
      
      // Draw the wave with some thickness
      for (let thickness = -1; thickness <= 1; thickness++) {
        const row = waveRow + thickness;
        
        if (row >= 0 && row < this.rows) {
          const index = row * this.cols + col;
          pattern[index] = true;
        }
      }
    }
    
    this.applyPatternToDiscs(pattern);
  }
  
  generateBouncePattern() {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    // Update ball position
    this.ball.x += this.ball.dx;
    this.ball.y += this.ball.dy;
    
    // Bounce off walls with angle reflection
    if (this.ball.x <= this.ball.size || this.ball.x >= this.cols - this.ball.size) {
      this.ball.dx *= -1; // Reverse x direction
      
      // Add some randomness to the bounce angle
      this.ball.dy += (Math.random() - 0.5) * 0.1;
      // Normalize velocity to maintain consistent speed
      const speed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
      this.ball.dx /= speed;
      this.ball.dy /= speed;
    }
    
    if (this.ball.y <= this.ball.size || this.ball.y >= this.rows - this.ball.size) {
      this.ball.dy *= -1; // Reverse y direction
      
      // Add some randomness to the bounce angle
      this.ball.dx += (Math.random() - 0.5) * 0.1;
      // Normalize velocity to maintain consistent speed
      const speed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
      this.ball.dx /= speed;
      this.ball.dy /= speed;
    }
    
    // Draw 2x2 ball
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const x = Math.floor(this.ball.x) + dx;
        const y = Math.floor(this.ball.y) + dy;
        
        // Check bounds
        if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
          pattern[y * this.cols + x] = true;
        }
      }
    }
    
    this.applyPatternToDiscs(pattern);
  }

  generateCascadePattern(deltaTime) {
    const pattern = Array(this.rows * this.cols).fill(false);
    const state = this.patternStates.cascade;
    
    // Initialize direction if it doesn't exist (true = going to white, false = going to black)
    if (state.direction === undefined) {
      state.direction = true;
      state.allDiscs = new Set(); // Track all discs that are currently white
    }
    
    const speedFactor = this.patternData.speed;
    const currentTime = performance.now();
    
    if (currentTime - state.lastFlipTime > state.currentInterval) {
      const flipsPerUpdate = Math.max(1, Math.floor(state.totalFlipped / 20));
      
      for (let f = 0; f < flipsPerUpdate; f++) {
        let availablePositions = [];
        
        for (let row = 0; row < this.rows; row++) {
          for (let col = 0; col < this.cols; col++) {
            const index = row * this.cols + col;
            // When going to white, look for unflipped discs
            // When going to black, look for white discs that haven't been flipped back
            if (state.direction && !state.allDiscs.has(index) ||
                !state.direction && state.allDiscs.has(index) && !state.flippedDiscs.includes(index)) {
              availablePositions.push(index);
            }
          }
        }
        
        if (availablePositions.length > 0) {
          const randomIndex = Math.floor(Math.random() * availablePositions.length);
          const discIndex = availablePositions[randomIndex];
          state.flippedDiscs.push(discIndex);
          
          if (state.direction) {
            state.allDiscs.add(discIndex); // Add to white discs when going up
          } else {
            state.allDiscs.delete(discIndex); // Remove from white discs when going down
          }
          
          state.totalFlipped++;
        } else {
          // Reset pattern when all discs are flipped
          state.direction = !state.direction;
          state.flippedDiscs = [];
          state.totalFlipped = 0;
          state.currentInterval = state.minInterval; // Reset speed
          break;
        }
      }
      
      state.lastFlipTime = currentTime;
      
      const progressFactor = state.totalFlipped / state.maxFlips;
      const accelerationFactor = Math.min(0.9, 0.99 - progressFactor * 0.8);
      const adjustedMinInterval = state.minInterval / speedFactor;
      
      state.currentInterval = Math.max(
        adjustedMinInterval, 
        state.currentInterval * accelerationFactor
      );
    }
    
    // Set the final pattern based on all white discs
    for (const index of state.allDiscs) {
      pattern[index] = true;
    }
    
    this.applyPatternToDiscs(pattern);
  }

  applyPatternToDiscs(pattern) {
    // Count flipped discs for sound throttling
    let flippedCount = 0;
    
    for (let i = 0; i < this.rows * this.cols; i++) {
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      const isFlipped = pattern[i];
      
      // Update state
      if (this.state[i] !== isFlipped) {
        this.state[i] = isFlipped;
        this.flipDisc(row, col);
        flippedCount++;        

        if (flippedCount === 1 || flippedCount % 10 === 0) {
          // this.playFlipSound();
        }
      }
    }
  }
  
  updateVisualization() {
    if (this.displayMode === 'drawing') {
      this.applyDrawingToDiscs();
    } else if (this.displayMode === 'pattern') {
      if (this.patternData.enable) {
        this.updatePattern();
      } else {
        this.clearDiscs();
      }
    } else {
      // Clear mode
      this.clearDiscs();
    }
  }

  applyDrawingToDiscs() {    
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const index = row * this.cols + col;
        const disc = this.discs[index];
        
        if (!disc || !disc.object) continue;
        const shouldBeFlipped = this.drawingGrid[row][col] === 1;
        
        if (disc.flipped !== shouldBeFlipped) {
          this.state[index] = shouldBeFlipped;
          
          this.flipDisc(row, col);
        }
      }
    }
  }
  
  clearDiscs() {
    for (let i = 0; i < this.rows * this.cols; i++) {
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      
      if (this.state[i]) {
        this.flipDisc(row, col);
      }
      
      this.state[i] = false;
    }
  }
  
  flipDisc(row, col) {
    const index = row * this.cols + col;
    const disc = this.discs[index];
    
    if (!disc || !disc.object) {
      console.warn(`Cannot flip disc at row ${row}, col ${col} - not found`);
      return;
    }
    
    disc.flipped = !disc.flipped;
    
    const startTime = performance.now();
    const duration = 200; // Animation duration in milliseconds
    const axis = new THREE.Vector3(1, 1, 0).normalize();
    // 180 degree rotation for each flip
    const startRotation = disc.flipped ? 0 : Math.PI;
    const endRotation = disc.flipped ? Math.PI : 0;
    
    disc.animation = {
      startTime,
      duration,
      axis,
      startRotation,
      endRotation,
      active: true
    };


    // TODO: figure out why this isn't working off teh bat
    this.playFlipSound();
    disc.object.setRotationFromAxisAngle(axis, startRotation);
  }

  clear() {
    this.drawingGrid = Array(this.rows).fill().map(() => Array(this.cols).fill(1));
    this.patternData = null;
    this.displayMode = 'none';
    
    this.clearDiscs();
  }

  generateFaceLandmarkPattern(landmarks, gestures) {
    const pattern = Array(this.rows * this.cols).fill(false);
    
    if (!landmarks || landmarks.length === 0) return pattern;

    // Calculate face bounding box
    const x_coords = landmarks.map(l => l.x);
    const y_coords = landmarks.map(l => l.y);
    const x_min = Math.min(...x_coords);
    const x_max = Math.max(...x_coords);
    const y_min = Math.min(...y_coords);
    const y_max = Math.max(...y_coords);
    
    // Face dimensions in normalized coordinates
    const face_width = x_max - x_min;
    const face_height = y_max - y_min;

    // Helper function to map coordinates to grid positions
    // This now uses the face bounds to normalize the positions
    const mapToGrid = (x, y) => {
      // Normalize the point relative to face bounds
      const normalized_x = (x - x_min) / face_width;
      const normalized_y = (y - y_min) / face_height;
      
      // Map to grid coordinates, leaving margins
      const margin = 4; // Leave 4 pixels margin
      const usable_width = this.cols - (2 * margin);
      const usable_height = this.rows - (2 * margin);
      
      const gridX = Math.min(Math.max(0, Math.floor(normalized_x * usable_width) + margin), this.cols - 1);
      const gridY = Math.min(Math.max(0, Math.floor(normalized_y * usable_height) + margin), this.rows - 1);
      
      return [gridX, gridY];
    };

    // Helper functions remain the same
    const setPixel = (x, y) => {
      if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
        pattern[y * this.cols + x] = true;
      }
    };

    const drawLine = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const sx = x1 < x2 ? 1 : -1;
      const sy = y1 < y2 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        setPixel(x1, y1);
        if (x1 === x2 && y1 === y2) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x1 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y1 += sy;
        }
      }
    };

    // Draw eyebrows using relative positions
    const leftEyebrowIndices = [336, 296, 334, 293, 300];
    const rightEyebrowIndices = [70, 63, 105, 66, 107];

    // Draw left eyebrow
    let prevPoint = null;
    leftEyebrowIndices.forEach(idx => {
      if (landmarks[idx]) {
        const [x, y] = mapToGrid(landmarks[idx].x, landmarks[idx].y - 0.02); // Small offset up
        if (prevPoint) {
          drawLine(prevPoint[0], prevPoint[1], x, y);
        }
        prevPoint = [x, y];
      }
    });

    // Draw right eyebrow
    prevPoint = null;
    rightEyebrowIndices.forEach(idx => {
      if (landmarks[idx]) {
        const [x, y] = mapToGrid(landmarks[idx].x, landmarks[idx].y - 0.02);
        if (prevPoint) {
          drawLine(prevPoint[0], prevPoint[1], x, y);
        }
        prevPoint = [x, y];
      }
    });

    // Draw eyes using relative positions and openness
    const leftEyeTop = landmarks[386];    // Top central point
    const leftEyeBottom = landmarks[374];  // Bottom central point
    const rightEyeTop = landmarks[159];    // Top central point
    const rightEyeBottom = landmarks[145]; // Bottom central point
    
    if (leftEyeTop && leftEyeBottom && rightEyeTop && rightEyeBottom) {
      // Calculate eye openness as distance between top and bottom points
      const left_openness = (leftEyeBottom.y - leftEyeTop.y) / face_height;
      const right_openness = (rightEyeBottom.y - rightEyeTop.y) / face_height;
      
      // Map openness values (typically 0.01-0.1) to our desired size range (1-4)
      // First normalize to 0-1 range, then scale to size range
      const normalizeAndScale = (openness) => {
        const min_openness = 0.01;
        const max_openness = 0.08;
        const normalized = (openness - min_openness) / (max_openness - min_openness);
        // Default to size 2 (3x3) if in middle range
        if (normalized > 0.35 && normalized < 0.8) return 1; // This gives us 3x3 (size=1 means 1 pixel from center)
        // Map to sizes: normalized 0-0.3 -> size 0 (1x1), 0.7-1 -> size 2 (5x5)
        return Math.max(0, Math.min(2, Math.round(normalized * 2)));
      };

      const leftEyeSize = normalizeAndScale(left_openness);
      const rightEyeSize = normalizeAndScale(right_openness);

      // Draw left eye
      const [leftX, leftY] = mapToGrid(leftEyeTop.x, (leftEyeTop.y + leftEyeBottom.y) / 2);
      for (let dy = -leftEyeSize; dy <= leftEyeSize; dy++) {
        for (let dx = -leftEyeSize; dx <= leftEyeSize; dx++) {
          setPixel(leftX + dx, leftY + dy);
        }
      }

      // Draw right eye
      const [rightX, rightY] = mapToGrid(rightEyeTop.x, (rightEyeTop.y + rightEyeBottom.y) / 2);
      for (let dy = -rightEyeSize; dy <= rightEyeSize; dy++) {
        for (let dx = -rightEyeSize; dx <= rightEyeSize; dx++) {
          setPixel(rightX + dx, rightY + dy);
        }
      }
    }

    // Draw mouth
    const mouthCenter = landmarks[0];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];

    const [centerX, centerY] = mapToGrid(mouthCenter.x, mouthCenter.y);
    const [leftX] = mapToGrid(leftMouth.x, leftMouth.y);
    const [rightX] = mapToGrid(rightMouth.x, rightMouth.y);
    
    const mouthWidth = Math.floor((rightX - leftX) / 2);
  
    // TODO: this isn't working
    const showSmile = gestures && gestures.find(g => 
      g.categoryName === "Open_Palm" && g.score > 0.3
    );

    if (showSmile) {
      console.log("showSmile");
      for (let i = -mouthWidth; i <= mouthWidth; i++) {
        const curve = Math.floor((i * i) / (mouthWidth * 0.5));
          setPixel(centerX + i, centerY + curve);
      } 
    } else {
      drawLine(centerX - mouthWidth, centerY, centerX + mouthWidth, centerY);
    }
    
    return pattern;
  }

  initializeFood() {
    const numFood = 30;
    while (this.patternStates.organism.food.size < numFood) {
      this.addNewFoodDot();
    }
  }

  addNewFoodDot() {
    // Try to place food away from the organism
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      const x = Math.floor(Math.random() * this.cols);
      const y = Math.floor(Math.random() * this.rows);
      
      // Check distance from organism
      const dx = x - this.patternStates.organism.x;
      const dy = y - this.patternStates.organism.y;
      const distanceFromOrganism = Math.sqrt(dx * dx + dy * dy);
      
      // Place food if it's far enough from organism and not on existing food
      const foodKey = `${x},${y}`;
      if (distanceFromOrganism > this.patternStates.organism.radius * 2 && 
          !this.patternStates.organism.food.has(foodKey) &&
          !this.patternStates.organism.consumed.has(foodKey)) {
        this.patternStates.organism.food.add(foodKey);
        return true;
      }
      
      attempts++;
    }
    
    return false;
  }
}

export default FlipDiscManager;