import React, { useState, useEffect } from 'react';
import { useMQTT } from '../../contexts/MQTTClient';
import { Disc2, RotateCcw, RotateCw, MoveHorizontal, Lightbulb } from 'lucide-react';
import { ReactComponent as ExponentialIcon } from '../../assets/icons/exponential.svg';
import { ReactComponent as CosineIcon } from '../../assets/icons/cosine.svg';
import { ReactComponent as CascadeIcon } from '../../assets/icons/cascade.svg';

const PRESET_COLORS = {
  blue: '#0066ff',
  red: '#ff0000',
  green: '#00ff66',
  white: '#ffffff'
};

const PRESET_MODES = {
  off: 0,
  static: 1,
  breathe: 2,
  gradual: 3,
  jump: 4
};

const DiscoPanel = ({ onSubmit, getConfigFromDatabase, saveConfigToDatabase, isActive }) => {
  const [discoConfig, setDiscoConfig] = useState({
    rotation: {
      enabled: true,
      speed: 0.1,
      direction: true
    },
    spotlights: {
      enabled: true,
      color: PRESET_COLORS.white,
      mode: PRESET_MODES.off,
      mode_speed: 0.5
    }
  });

  const {
    mqttConnected,
    publish
  } = useMQTT();

  const isStaticMode = discoConfig.spotlights.mode === PRESET_MODES.static;
  const isOffMode = discoConfig.spotlights.mode === PRESET_MODES.off;

  const loadDiscoSettings = async () => {
    const discoSettings = await getConfigFromDatabase('discoKnob');
    setDiscoConfig(discoSettings);

    // Don't publish on initial load - only set the UI state
    // We'll only publish when the user makes changes
  };

  useEffect(() => {
    if (isActive) {
      loadDiscoSettings();
    }
  }, [isActive]);

  const handleSubmit = async (newConfig) => {
    if (!mqttConnected) return;

    if (onSubmit) {
      onSubmit(newConfig);
    }
    await saveConfigToDatabase(newConfig);
    publish('smartknob/disco', newConfig);
  };

  const handleRotationChange = (field, value) => {
    const newConfig = {
      ...discoConfig,
      rotation: {
        ...discoConfig.rotation,
        [field]: value
      }
    };
    setDiscoConfig(newConfig);
    handleSubmit(newConfig);
  };

  const handleSpotlightChange = (field, value) => {
    const newConfig = {
      ...discoConfig,
      spotlights: {
        ...discoConfig.spotlights,
        [field]: value
      }
    };
    setDiscoConfig(newConfig);
    handleSubmit(newConfig);
  };

  const handleModeChange = (mode) => {
    if (discoConfig.spotlights.mode === mode) {
      const newConfig = {
        ...discoConfig,
        spotlights: {
          ...discoConfig.spotlights,
          mode: PRESET_MODES.off
        }
      };
      setDiscoConfig(newConfig);
      handleSubmit(newConfig);
    } else {
      const newConfig = {
        ...discoConfig,
        spotlights: {
          ...discoConfig.spotlights,
          mode: mode
        }
      };
      setDiscoConfig(newConfig);
      handleSubmit(newConfig);
    }
  };

  const handleModeSpeedChange = (value) => {
    const newConfig = {
      ...discoConfig,
      spotlights: {
        ...discoConfig.spotlights,
        mode_speed: value
      }
    };
    setDiscoConfig(newConfig);
    handleSubmit(newConfig);
  };

  const handleColorClick = (colorValue) => {
    if (discoConfig.spotlights.color === colorValue && discoConfig.spotlights.enabled) {
      handleSpotlightChange('enabled', false);
    } else {
      const updates = [
        ['enabled', true],
        ['color', colorValue]
      ];
      
      const newConfig = {
        ...discoConfig,
        spotlights: {
          ...discoConfig.spotlights,
          ...Object.fromEntries(updates)
        }
      };
      setDiscoConfig(newConfig);
      handleSubmit(newConfig);
    }
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col space-y-6 w-64">
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            {Object.entries(PRESET_MODES).filter(([modeName]) => modeName !== 'off').map(([modeName, modeValue]) => (
              <button
                key={modeName}
                onClick={() => handleModeChange(modeValue)}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  discoConfig.spotlights.mode === modeValue ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {modeName === 'static' ? (
                  <Lightbulb className="h-6 w-6" />
                ) : modeName === 'gradual' ? (
                  <CosineIcon className="h-6 w-6" />
                ) : modeName === 'breathe' ? (
                  <ExponentialIcon className="h-6 w-6" />
                ) : (
                  <CascadeIcon className="h-6 w-6" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isStaticMode && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              {Object.entries(PRESET_COLORS).map(([colorName, colorValue]) => (
                <button
                  key={colorName}
                  onClick={() => handleColorClick(colorValue)}
                  className={`h-10 w-10 rounded-lg transition-colors ${
                    discoConfig.spotlights.color === colorValue && discoConfig.spotlights.enabled
                      ? 'ring-2 ring-blue-500 ring-offset-2' 
                      : 'ring-1 ring-gray-200'
                  }`}
                  style={{ backgroundColor: colorValue }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {!isStaticMode && !isOffMode && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-4">
            <MoveHorizontal className="h-10 w-10" />
            <input
              type="range"
              value={discoConfig.spotlights.mode_speed}
              onChange={(e) => handleModeSpeedChange(parseFloat(e.target.value))}
              min="1.0"
              max="5.0"
              step="1.0"
              className="w-full"
            />
          </div>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleRotationChange('enabled', !discoConfig.rotation.enabled)}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                discoConfig.rotation.enabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Disc2 className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <input
                type="range"
                value={discoConfig.rotation.speed}
                onChange={(e) => handleRotationChange('speed', parseFloat(e.target.value))}
                min="0.01"
                max="0.25"
                step="0.0025"
                className={`w-full ${!discoConfig.rotation.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!discoConfig.rotation.enabled}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleRotationChange('direction', false)}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                !discoConfig.rotation.direction ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
              } ${!discoConfig.rotation.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!discoConfig.rotation.enabled}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleRotationChange('direction', true)}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                discoConfig.rotation.direction ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
              } ${!discoConfig.rotation.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!discoConfig.rotation.enabled}
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoPanel;
