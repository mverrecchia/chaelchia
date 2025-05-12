export const ProfileType = {
  COS: 0,
  BOUNCE: 1,
  EXPONENTIAL: 2,
  PULSE: 3,
  TRIANGLE: 4,
  ELASTIC: 5,
  CASCADE: 6,
  FLICKER: 7
};

class ProfileExecutor {
  constructor() {
    this.active = false;
    this.elapsedTime = 0.0;
    this.currentProfile = null;
  }
  
  startProfile(profile) {
    this.currentProfile = profile;
    this.active = true;
  }
  
  stopProfile() {
    this.active = false;
  }
  
  getProfileActive() {
    return this.active;
  }
  
  updateProfileValues(deltaTime, values) {
    if (!this.active || !this.currentProfile) return false;
    
    this.elapsedTime += deltaTime;
    const baseValue = this.calculateProfileValue();
    const scaledValue = baseValue * this.currentProfile.magnitude;
    
    if (values.supplies && Array.isArray(values.supplies)) {
      for (let i = 0; i < values.supplies.length; i++) {
        values.supplies[i] = scaledValue;
      }
    }
    
    values.motorValue = scaledValue;
    
    return true;
  }

  calculateProfileValue() {
    if (!this.currentProfile) return 0;
    
    const frequency = this.currentProfile.frequency;
    const phaseOffset = this.currentProfile.phase || 0;
    const scaledTime = (this.elapsedTime * frequency) + phaseOffset;
    const t = scaledTime % 1.0;
    
    let profileValue = 0.0;
    
    switch (this.currentProfile.type) {
      case ProfileType.COS:
        profileValue = 0.5 + 0.5 * Math.cos(2 * Math.PI * t);
        break;
        
      case ProfileType.EXPONENTIAL:
        profileValue = 1.0 - Math.exp(-3.0 * t);
        break;
        
      case ProfileType.BOUNCE:
        profileValue = 1.0 - (1.0 - t) * (1.0 - t);
        break;
        
      case ProfileType.PULSE:
        const HEARTBEAT_PERIOD = 1.0;
        const FIRST_PEAK_START = 0.0;
        const FIRST_PEAK_END = 0.15;
        const SECOND_PEAK_START = 0.075;
        const SECOND_PEAK_END = 0.40;
        
        const FIRST_RISE_RATIO = 0.3;
        const FIRST_RISE_POWER = 1.5;
        const FIRST_FALL_POWER = 2.0;
        
        const SECOND_RISE_RATIO = 0.15;
        const SECOND_RISE_POWER = 1.2;
        const SECOND_FALL_POWER = 1.2;

        const FIRST_PULSE_HEIGHT = 1.0;
        const SECOND_PULSE_HEIGHT = 0.7;
        const MIN_PULSE_VALUE = 0.08;
        
        const cyclePosition = (t % HEARTBEAT_PERIOD) / HEARTBEAT_PERIOD;

        let firstPulseValue = 0;
        let secondPulseValue = 0;
              
        if (cyclePosition >= FIRST_PEAK_START && cyclePosition < FIRST_PEAK_END) {
          const phase = (cyclePosition - FIRST_PEAK_START) / (FIRST_PEAK_END - FIRST_PEAK_START);
          
          if (phase < FIRST_RISE_RATIO) {
            firstPulseValue = Math.pow(phase / FIRST_RISE_RATIO, FIRST_RISE_POWER);
          } else {
            firstPulseValue = Math.pow(1 - ((phase - FIRST_RISE_RATIO) / (1 - FIRST_RISE_RATIO)), FIRST_FALL_POWER);
          }
          firstPulseValue *= FIRST_PULSE_HEIGHT;
        }
        
        if (cyclePosition >= SECOND_PEAK_START && cyclePosition < SECOND_PEAK_END) {
          const phase = (cyclePosition - SECOND_PEAK_START) / (SECOND_PEAK_END - SECOND_PEAK_START);
          
          if (phase < SECOND_RISE_RATIO) {
            secondPulseValue = Math.pow(phase / SECOND_RISE_RATIO, SECOND_RISE_POWER);
          } else {
            secondPulseValue = Math.pow(1 - ((phase - SECOND_RISE_RATIO) / (1 - SECOND_RISE_RATIO)), SECOND_FALL_POWER);
          }
          secondPulseValue *= SECOND_PULSE_HEIGHT;
        }
        
        let pulseValue = Math.max(firstPulseValue, secondPulseValue);
        profileValue = Math.max(MIN_PULSE_VALUE, Math.min(pulseValue, 1.0));
        break;

      case ProfileType.TRIANGLE:
        profileValue = (t < 0.5) ? (2.0 * t) : (2.0 * (1.0 - t));
        break;
        
      case ProfileType.ELASTIC:
        const decay = 3.0;
        const oscillations = 3.0;
        profileValue = 1.0 - (Math.exp(-decay * t) * Math.cos(2.0 * Math.PI * oscillations * t));
        break;
        
      case ProfileType.CASCADE:
        const bounceCount = 3.0;
        profileValue = Math.pow(1.0 - t, 2.0) * 
                        Math.sin(2.0 * Math.PI * bounceCount * t);
        break;
        
      case ProfileType.FLICKER:
        const base = 0.5;
        const variance = 0.8;
        
        const random = Math.random();
        const highFreqNoise = Math.sin(t * 50.0 + random * 10.0);
        
        profileValue = base + (highFreqNoise * variance);
        break;
        
      default:
        profileValue = 0.0;
        break;
    }
    
    return Math.max(0, Math.min(profileValue, 1));
  }
}

export default ProfileExecutor;