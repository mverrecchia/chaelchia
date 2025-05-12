// models.js
const mongoose = require('mongoose');

const SupplySchema = new mongoose.Schema({
  id: { type: Number, default: 0 },
  type: { type: String, default: 'supply0' },
  enabled: { type: Boolean, default: false },
  brightness: { type: Number, default: 0.5 }
});

const ControllerConfigSchema = new mongoose.Schema({
  controllers: {
    type: [{
      mac: { type: String, default: "00:00:00:00:00:00" },
      connected: { type: Boolean, default: false },
      profileActive: { type: Boolean, default: false },
      supplies: [SupplySchema],
      
      motorEnable: { type: Boolean, default: false },
      motorDirection: { type: Boolean, default: false },
      motorSpeed: { type: Number, default: 0 },
      
      distance: { type: Number, default: 0 },
    }],
    default: []
  },
  
  profiles: {
    type: [{
      index: { type: Number, default: 0 },
      profileType: { type: Number, default: 0 },
      magnitude: { type: Number, default: 0.5 },
      frequency: { type: Number, default: 1.0 },
      phase: { type: Number, default: 0.0 },
      enable: { type: Boolean, default: true },
      stopProfile: { type: Boolean, default: false },
    }],
    default: []
  },
  
  audioConfig: {
    type: {
      audioMode: {
        type: String,
        enum: ["fixed", "random", "sequential"],
        default: "fixed"
      },
      audioAllowMultipleActive: {
        type: Boolean,
        default: false
      },
      audioWeights: {
        low: {
          type: [Number],
          default: [0.4, 0.4, 0.1, 0.1, 0.0]
        },
        mid: {
          type: [Number],
          default: [0.2, 0.2, 0.2, 0.2, 0.2]
        },
        high: {
          type: [Number],
          default: [0.5, 0.5, 0.0, 0.0, 0.0]
        }
      },
      audioFastAlpha: {
        type: Number,
        default: 0.9
      },
      audioSlowAlpha: {
        type: Number,
        default: 0.1
      },
      audioMagnitudeThresholds: {
        type: [Number],
        default: [0.25, 0.25, 0.25]
      },
      audioSupplyFlags: {
        type: [[Number]],
        default: [[1, 0], [2, 0], [4, 0]]
      }
    },
    default: {}
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const FlipDiscConfigSchema = new mongoose.Schema({
  pattern: {
    id: { type: Number, default: 1 },
    name: { type: String, default: 'Clock' },
    speed: { type: Number, default: 2.0 },
    enable: { type: Boolean, default: true },
  },
  drawing: {
    grid: { type: [[Number]], default: [] },
    invert: { type: Boolean, default: false },
  }
});

const DiscoKnobConfigSchema = new mongoose.Schema({
  rotation: {
    enabled: { type: Boolean, default: true },
    speed: { type: Number, default: 0.1 },
    direction: { type: Boolean, default: true },
  },
  spotlights: {
    enabled: { type: Boolean, default: true },
    color: { type: String, default: '#ffffff' },
    mode: { type: Number, default: 0 },
    mode_speed: { type: Number, default: 0.0 },
  }
});

const PortfolioConfigSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  expireAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 30*24*60*60*1000) // 30 days from now
  },
  
  stool: {
    type: ControllerConfigSchema,
    default: () => ({})
  },
  wallflower: {
    type: ControllerConfigSchema,
    default: () => ({})
  },
  flipDisc: {
    type: FlipDiscConfigSchema,
    default: () => ({})
  },
  discoKnob: {
    type: DiscoKnobConfigSchema,
    default: () => ({})
  },

  lightsOn: {
    type: Boolean,
    default: true
  },

  clientId: {
    type: String,
    default: ''
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

PortfolioConfigSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const StoolConfig = mongoose.model('StoolConfig', ControllerConfigSchema);
const WallflowerConfig = mongoose.model('WallflowerConfig', ControllerConfigSchema);
const FlipDiscConfig = mongoose.model('FlipDiscConfig', FlipDiscConfigSchema);
const DiscoKnobConfig = mongoose.model('DiscoKnobConfig', DiscoKnobConfigSchema);
const PortfolioConfig = mongoose.model('PortfolioConfig', PortfolioConfigSchema);
module.exports = {
  StoolConfig,
  WallflowerConfig,
  FlipDiscConfig,
  DiscoKnobConfig,
  PortfolioConfig
};