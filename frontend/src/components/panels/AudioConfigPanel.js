import React, { useState, useEffect, useCallback } from 'react';
import { Flower, Plus, Gauge, Square } from 'lucide-react';
import { useMQTT } from '../../contexts/MQTTClient';
import FrequencyCurve from '../../pages/shared/FrequencyCurve';

const LOW_FREQUENCIES = [46.875, 93.75, 140.625, 187.5, 234.375];
const MID_FREQUENCIES = [281.25, 468.75, 937.5, 1875.0, 3750.0];
const HIGH_FREQUENCIES = [4687.5, 7031.25, 9375.0, 14062.5, 18750.0];

const INIT_LOW_WEIGHTS = [0.4, 0.4, 0.1, 0.1, 0.0];
const INIT_MID_WEIGHTS = [0.2, 0.2, 0.2, 0.2, 0.2];
const INIT_HIGH_WEIGHTS = [0.5, 0.5, 0.0, 0.0, 0.0];

const INIT_THRESHOLD = 0.25;
const INIT_FAST_ALPHA = 0.9;
const INIT_SLOW_ALPHA = 0.2;

const FREQ_LOW = 0x01;
const FREQ_MID = 0x02;
const FREQ_HIGH = 0x04;
const FREQ_NONE = 0x00;

const NUM_BUCKETS = 3;
const DEFAULT_SUPPLIES_PER_CONTROLLER = 2; // Default number of supplies per controller

const AudioConfigPanel = ({ 
  onSubmit, 
  numControllers, 
  getConfigFromDatabase, 
  saveConfigToDatabase, 
  configType, 
  audioAnalyzer,
  isActive,
  suppliesPerController = DEFAULT_SUPPLIES_PER_CONTROLLER, // Allow customizing the number of supplies
}) => {
  const { 
    mqttConnected, 
    publish
  } = useMQTT();
  
  // Track loading state but not using it in UI currently
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [audioConfig, setAudioConfig] = useState({
    audioMode: 'fixed',
    audioAllowMultipleActive: false,
    audioWeights: {
      low: INIT_LOW_WEIGHTS,
      mid: INIT_MID_WEIGHTS,
      high: INIT_HIGH_WEIGHTS
    },
    audioFastAlpha: INIT_FAST_ALPHA,
    audioSlowAlpha: INIT_SLOW_ALPHA,
    audioSupplyFlags: Array(numControllers)
      .fill(0)
      .map(() => Array(suppliesPerController).fill(FREQ_NONE)),
    audioMagnitudeThresholds: Array(NUM_BUCKETS).fill(INIT_THRESHOLD)
  });
  const [fftData, setFFTData] = useState(null);

  const stoolSupplyIcons = [
    <Square className="w-8 h-8" />,
    <Square className="w-6 h-6" />
  ];

  const wallFlowerSupplyIcons = [
    <Flower className="w-6 h-6" />,
    <Plus className="w-6 h-6" />
  ];
  
  // update FFT data when audio analyzer is playing
  useEffect(() => {
    if (!audioAnalyzer) {
      return;
    }
    
    const updateFFTData = () => {
      if (audioAnalyzer.isPlaying) {
        try {
          if (audioAnalyzer.magnitudes) {          
            const lowMagnitudes = [];
            const midMagnitudes = [];
            const highMagnitudes = [];
            
            // get the raw magnitude values from the analyzer
            for (let i = 0; i < LOW_FREQUENCIES.length; i++) {
              if (i < audioAnalyzer.magnitudes.length) {
                lowMagnitudes.push(audioAnalyzer.magnitudes[i]);
              }
            }
            
            for (let i = 0; i < MID_FREQUENCIES.length; i++) {
              const idx = LOW_FREQUENCIES.length + i;
              if (idx < audioAnalyzer.magnitudes.length) {
                midMagnitudes.push(audioAnalyzer.magnitudes[idx]);
              }
            }
            
            for (let i = 0; i < HIGH_FREQUENCIES.length; i++) {
              const idx = LOW_FREQUENCIES.length + MID_FREQUENCIES.length + i;
              if (idx < audioAnalyzer.magnitudes.length) {
                highMagnitudes.push(audioAnalyzer.magnitudes[idx]);
              }
            }
            
            setFFTData({
              low: lowMagnitudes,
              mid: midMagnitudes,
              high: highMagnitudes
            });
          }
        } catch (error) {
          console.error("Error updating FFT data:", error);
        }
      }
      
      requestAnimationFrame(updateFFTData);
    };
    
    const animationId = requestAnimationFrame(updateFFTData);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [audioAnalyzer]);

  const initializeDefaultAudioConfig = useCallback(async () => {
    const defaultAudioConfig = {
      audioMode: 'fixed',
      audioAllowMultipleActive: false,
      audioWeights: {
        low: INIT_LOW_WEIGHTS,
        mid: INIT_MID_WEIGHTS,
        high: INIT_HIGH_WEIGHTS
      },
      audioFastAlpha: INIT_FAST_ALPHA,
      audioSlowAlpha: INIT_SLOW_ALPHA,
      audioSupplyFlags: Array(numControllers)
        .fill(0)
        .map((_, controllerIdx) => {
          const flags = Array(suppliesPerController).fill(FREQ_NONE);
          if (controllerIdx < 3) {
            flags[0] = controllerIdx === 0 ? FREQ_LOW : (controllerIdx === 1 ? FREQ_MID : FREQ_HIGH);
          }
          return flags;
        }),
      audioMagnitudeThresholds: Array(NUM_BUCKETS).fill(INIT_THRESHOLD)
    };
    
    const componentConfig = {
      audioConfig: defaultAudioConfig,
      lastUpdated: new Date().toISOString()
    };
    
    try {
      await saveConfigToDatabase(componentConfig);
    } catch (saveError) {
      console.error(`Error saving default audio config:`, saveError);
    }
    
    setAudioConfig(defaultAudioConfig);
    
    return defaultAudioConfig;
  }, [numControllers, suppliesPerController, saveConfigToDatabase]);

  const loadAudioConfig = useCallback(async () => {
    try {
      setIsConfigLoaded(false);
      
      const componentConfig = await getConfigFromDatabase();
      
      if (!componentConfig) {
        const defaultConfig = await initializeDefaultAudioConfig();

        setIsConfigLoaded(true);
        return;
      }
    
      if (componentConfig.audioConfig) {
        const audioConfig = componentConfig.audioConfig;
        
        if (!audioConfig.audioSupplyFlags || !Array.isArray(audioConfig.audioSupplyFlags)) {
          audioConfig.audioSupplyFlags = Array(numControllers)
            .fill(0)
            .map(() => Array(suppliesPerController).fill(FREQ_NONE));
        } else if (audioConfig.audioSupplyFlags.length < numControllers) {
          const additionalControllers = Array(numControllers - audioConfig.audioSupplyFlags.length)
            .fill(0)
            .map(() => Array(suppliesPerController).fill(FREQ_NONE));
          
          audioConfig.audioSupplyFlags = [...audioConfig.audioSupplyFlags, ...additionalControllers];
        } else if (audioConfig.audioSupplyFlags.length > numControllers) {
          // Trim excess controllers
          audioConfig.audioSupplyFlags = audioConfig.audioSupplyFlags.slice(0, numControllers);
        }
        
        // Ensure each controller has enough supplies
        audioConfig.audioSupplyFlags = audioConfig.audioSupplyFlags.map(supplyFlags => {
          if (!supplyFlags || !Array.isArray(supplyFlags)) {
            return Array(suppliesPerController).fill(FREQ_NONE);
          }
          if (supplyFlags.length < suppliesPerController) {
            return [...supplyFlags, ...Array(suppliesPerController - supplyFlags.length).fill(FREQ_NONE)];
          }
          return supplyFlags.slice(0, suppliesPerController); // Trim if too many
        });
        
        // Ensure other required properties exist
        if (!audioConfig.audioWeights) {
          audioConfig.audioWeights = {
            low: INIT_LOW_WEIGHTS,
            mid: INIT_MID_WEIGHTS,
            high: INIT_HIGH_WEIGHTS
          };
        }
        
        if (!audioConfig.audioMagnitudeThresholds) {
          audioConfig.audioMagnitudeThresholds = [INIT_THRESHOLD, INIT_THRESHOLD, INIT_THRESHOLD];
        }
        
        componentConfig.audioConfig = audioConfig;
        setAudioConfig(audioConfig);
        setIsConfigLoaded(true);
      } else {
        const defaultConfig = await initializeDefaultAudioConfig();
        setIsConfigLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load audio configuration:', error);
      const defaultConfig = await initializeDefaultAudioConfig();
      
      if (mqttConnected && publish) {
        publish(`${configType}/audio_config`, defaultConfig);
        if (onSubmit) {
          onSubmit(defaultConfig);
        }
      }
      
      setIsConfigLoaded(true);
    }
  }, [getConfigFromDatabase, configType, mqttConnected, publish, onSubmit, numControllers, suppliesPerController, initializeDefaultAudioConfig]);
  
  useEffect(() => {
    if (isActive) {
      loadAudioConfig();
    }
  }, [isActive, loadAudioConfig]);


  const handleSupplyFlagChange = (controllerIdx, supplyIdx, value) => {
    if (!audioConfig.audioSupplyFlags) {
      return; // Safety check
    }
    
    const newSupplyFlags = JSON.parse(JSON.stringify(audioConfig.audioSupplyFlags));
    
    if (!newSupplyFlags[controllerIdx]) {
      newSupplyFlags[controllerIdx] = Array(suppliesPerController).fill(FREQ_NONE);
    }
    if (newSupplyFlags[controllerIdx].length <= supplyIdx) {
      newSupplyFlags[controllerIdx] = [
        ...newSupplyFlags[controllerIdx],
        ...Array(supplyIdx + 1 - newSupplyFlags[controllerIdx].length).fill(FREQ_NONE)
      ];
    }
    
    newSupplyFlags[controllerIdx][supplyIdx] = value;

    
    const newAudioConfig = {
      ...audioConfig,
      audioSupplyFlags: newSupplyFlags,
    };
    
    setAudioConfig(newAudioConfig);
    handleSubmit(newAudioConfig);
  };

  const handleThresholdChange = (index, value) => {
    const newThresholds = [...audioConfig.audioMagnitudeThresholds];
    newThresholds[index] = parseFloat(value);
    
    const newAudioConfig = {
      ...audioConfig,
      audioMagnitudeThresholds: newThresholds
    };
    
    setAudioConfig(newAudioConfig);
    handleSubmit(newAudioConfig);
  };

  const handleWeightChange = (band, index, value) => {
    if (!audioConfig.audioWeights || !audioConfig.audioWeights[band]) {
      return; // Safety check
    }
    
    const newWeights = [...audioConfig.audioWeights[band]];
    newWeights[index] = value;
    
    const newAudioConfig = {
      ...audioConfig,
      audioWeights: {
        ...audioConfig.audioWeights,
        [band]: newWeights
      }
    };
    
    setAudioConfig(newAudioConfig);
    handleSubmit(newAudioConfig);
  };

  const handleSubmit = async(newAudioConfig) => {    
    if (!mqttConnected) {
      console.log("Not connected to the server");
      return;
    }
    
    try {
      const updatedAudioConfig = newAudioConfig || audioConfig;
      let componentConfig = await getConfigFromDatabase();
      if (!componentConfig) {
        componentConfig = {
          lastUpdated: new Date().toISOString()
        };
      }
      
      componentConfig.audioConfig = updatedAudioConfig;
      componentConfig.lastUpdated = new Date().toISOString();

      await saveConfigToDatabase(componentConfig);
      
      publish(`${configType}/audio_config`, updatedAudioConfig);
      
      onSubmit(updatedAudioConfig);
    } catch (error) {
      console.error('Error applying audio configuration:', error);
    } 
  };

  const handleFrequencyBandSelection = (controllerIdx, supplyIdx, freqFlag) => {
    const currentFlag = audioConfig.audioSupplyFlags[controllerIdx][supplyIdx];
    if (currentFlag === FREQ_NONE) {
      handleSupplyFlagChange(controllerIdx, supplyIdx, freqFlag);
    } 
    else if (currentFlag !== freqFlag) {
      handleSupplyFlagChange(controllerIdx, supplyIdx, freqFlag);
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <>
      {/* TODO: readd audio mode control */}
      {/* <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Audio Response Mode</label>
            <select
              value={audioConfig.audioMode}
              onChange={handleModeChange}
              className="rounded border border-gray-300 p-2 w-32"
            >
              <option value="fixed">Fixed</option>
              <option value="random">Random</option>
              <option value="sequential">Sequential</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <label className="block text-sm font-medium text-gray-700 mr-2">Allow Multiple Active</label>
            <input
              type="checkbox"
              checked={audioConfig.audioAllowMultipleActive}
              onChange={handleMultipleActiveChange}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
            />
          </div>
        </div>
      </div> */}
      
      <div className="grid grid-cols-3 gap-4 justify-items-center">
        {audioConfig.audioSupplyFlags && audioConfig.audioSupplyFlags.map((controllerSupplies, controllerIdx) => (
          <div 
            key={`controller-${controllerIdx}`} 
            className={`flex flex-col items-center gap-3 rounded-lg ${
              audioConfig.audioSupplyFlags.length === 1 ? 'col-span-3' : ''
            }`}
          >
            {controllerSupplies.map((flag, supplyIdx) => (
              <div key={`supply-${controllerIdx}-${supplyIdx}`} className="flex items-center gap-2">
                {/* Enable/Disable Button with custom icon support */}
                <button
                  onClick={() => handleSupplyFlagChange(
                    controllerIdx, 
                    supplyIdx, 
                    flag === FREQ_NONE ? FREQ_LOW : FREQ_NONE
                  )}
                  type="button"
                  className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                    flag === FREQ_NONE 
                      ? 'bg-gray-100 text-gray-500' 
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  {configType === 'stool' ? stoolSupplyIcons[supplyIdx] : wallFlowerSupplyIcons[supplyIdx]}
                </button>
                
                {/* LMH Buttons Group */}
                <div className="flex justify-center space-x-1 bg-gray-100 p-1 rounded-md">
                  <button
                    key={`low-${controllerIdx}-${supplyIdx}`}
                    type="button"
                    onClick={() => handleFrequencyBandSelection(controllerIdx, supplyIdx, FREQ_LOW)}
                    className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-medium ${
                      flag === FREQ_LOW
                        ? 'bg-yellow-500 text-white'
                        : 'bg-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ border: 'none' }}
                  >
                    L
                  </button>
                  <button
                    key={`mid-${controllerIdx}-${supplyIdx}`}
                    type="button"
                    onClick={() => handleFrequencyBandSelection(controllerIdx, supplyIdx, FREQ_MID)}
                    className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-medium ${
                      flag === FREQ_MID
                        ? 'bg-green-500 text-white'
                        : 'bg-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ border: 'none' }}
                  >
                    M
                  </button>
                  <button
                    key={`high-${controllerIdx}-${supplyIdx}`}
                    type="button"
                    onClick={() => handleFrequencyBandSelection(controllerIdx, supplyIdx, FREQ_HIGH)}
                    className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-medium ${
                      flag === FREQ_HIGH
                        ? 'bg-purple-500 text-white'
                        : 'bg-transparent text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ border: 'none' }}
                  >
                    H
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Frequency Band Selection and Plot */}
      <div className="mt-6 justify-center">
        {/* Frequency Curve Plot */}
        <div className="p-2 rounded-lg" style={{ height: '185px' }}>
          <FrequencyCurve 
            lowFrequencies={LOW_FREQUENCIES}
            midFrequencies={MID_FREQUENCIES}
            highFrequencies={HIGH_FREQUENCIES}
            lowWeights={audioConfig.audioWeights?.low || INIT_LOW_WEIGHTS}
            midWeights={audioConfig.audioWeights?.mid || INIT_MID_WEIGHTS}
            highWeights={audioConfig.audioWeights?.high || INIT_HIGH_WEIGHTS}
            onLowChange={(index, value) => handleWeightChange('low', index, value)}
            onMidChange={(index, value) => handleWeightChange('mid', index, value)}
            onHighChange={(index, value) => handleWeightChange('high', index, value)}
            frequencyRange={[40, 20000]}
            lowColor="#ffc107"  // Yellow
            midColor="#10b981"  // Green
            highColor="#8b5cf6"  // Purple
            fftData={fftData}  // Pass FFT data to the component
          />
        </div>
        
        {/* Threshold Sliders */}
        <div className="flex justify-between mt-4 px-2">
          {Array.from({ length: NUM_BUCKETS }).map((_, index) => {
            const colors = ['#ffc107', '#10b981', '#8b5cf6'];
            return (
              <div key={index} className="flex flex-col items-center px-2" style={{ width: `${100/NUM_BUCKETS}%` }}>
                <div className="flex items-center w-full gap-2">
                  <Gauge className="w-10 h-10" style={{ color: colors[index] }} />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={audioConfig.audioMagnitudeThresholds?.[index] ?? 0.5}
                    onChange={(e) => handleThresholdChange(index, e.target.value)}
                    className="w-full"
                    style={{ height: '20px', zIndex: 10, position: 'relative' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* TODO: readd smoothing settings */}
        {/* <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Smoothing Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fast Response: {(audioConfig.audioFastAlpha * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioConfig.audioFastAlpha}
                onChange={(e) => handleAlphaChange('audioFastAlpha', e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slow Response: {(audioConfig.audioSlowAlpha * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audioConfig.audioSlowAlpha}
                onChange={(e) => handleAlphaChange('audioSlowAlpha', e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div> */}
      </div>
    </>
  );
};

export default AudioConfigPanel;