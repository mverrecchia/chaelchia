import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Disc2, RotateCcw, RotateCw, Plus, Flower, Square } from 'lucide-react';
import { useMQTT } from '../../contexts/MQTTClient';

const DEBOUNCE_DELAY = 50;

const createDefaultController = (index) => ({
  index,
  mac: `00:00:00:00:00:${index.toString(16).padStart(2, '0')}`,
  connected: false,
  profileActive: false,
  supplies: [
    {
      id: 0,
      type: "supply0",
      enabled: false,
      brightness: 0.5
    },
    {
      id: 1,
      type: "supply1",
      enabled: false,
      brightness: 0.5
    }
  ],
  motorEnable: false,
  motorDirection: false,
  motorSpeed: 0.5,
  distance: 0,
  lastUpdated: new Date().toISOString()
});

const ManualControlPanel = ({ 
  onSubmit, 
  numControllers, 
  getConfigFromDatabase, 
  saveConfigToDatabase, 
  configType, 
  features, 
  activeMode,
  isActive
}) => {

  const { 
    mqttConnected, 
    publish
  } = useMQTT();

  // Initialize with proper default controllers
  const [projectConfig, setProjectConfig] = useState(null);
  const [controllers, setControllers] = useState(Array(numControllers).fill(0).map((_, index) => createDefaultController(index)));
  const [isLoading, setIsLoading] = useState(true);
  const publishTimers = useRef(Array(numControllers).fill(null));
  const stoolSupplyIcons = [<Square className="w-8 h-8" />, <Square className="w-6 h-6" />];
  const wallFlowerSupplyIcons = [<Flower className="w-6 h-6" />, <Plus className="w-6 h-6" />];

  const loadControllerSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const defaultControllers = Array(numControllers).fill(0).map((_, index) => createDefaultController(index));
      let componentConfig = await getConfigFromDatabase();
      let configNeedsSaving = false;
      
      // Initialize component if it doesn't exist or is empty
      if (!componentConfig || Object.keys(componentConfig).length === 0) {
        console.log(`No ${configType} config found, creating default`);
        componentConfig = {
          controllers: defaultControllers,
          lastUpdated: new Date().toISOString()
        };
        configNeedsSaving = true;
      }
      
      // Check for controllers array
      if (!componentConfig.controllers || !Array.isArray(componentConfig.controllers) || componentConfig.controllers.length < numControllers) {
        // console.log(`Controllers array missing or incomplete for ${configType}, creating default controllers`);
        componentConfig.controllers = defaultControllers;
        configNeedsSaving = true;
      }
      
      // Check each controller for supplies
      componentConfig.controllers.forEach((controller, index) => {
        if (!controller.supplies || !Array.isArray(controller.supplies) || controller.supplies.length < 2) {
          console.log(`Controller ${index} has invalid supplies in ${configType}, fixing`);
          controller.supplies = defaultControllers[index].supplies;
          configNeedsSaving = true;
        }
      });
      
      // Only save back to database if changes were needed
      if (configNeedsSaving) {
        try {
          await saveConfigToDatabase(componentConfig);
        } catch (saveError) {
          console.error(`Error saving default ${configType} config:`, saveError);
        }
      }
      
      // Update local state with loaded config
      setProjectConfig(componentConfig);
      setControllers(prevControllers => {
        const newControllers = [...prevControllers];
        
        componentConfig.controllers.slice(0, numControllers).forEach((loadedController, index) => {
          if (index < newControllers.length) {
            newControllers[index] = {
              ...createDefaultController(index),
              ...loadedController,
              index
            };
          }
        });
        
        return newControllers;
      });
      
      setIsLoading(false);
    } catch (error) {
      console.error(`Error loading ${configType} controller settings:`, error);
      setControllers(Array(numControllers).fill(0).map((_, index) => createDefaultController(index)));
      setIsLoading(false);
    }
  }, [getConfigFromDatabase, saveConfigToDatabase, configType, numControllers, mqttConnected, publish, onSubmit]);

  useEffect(() => {
    // load config when panel becomes active
    if (isActive) {
      loadControllerSettings();
    }
    
    return () => {
      publishTimers.current.forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [isActive, loadControllerSettings]);

  const handleSubmit = async (controller, index, brightnessChange = false) => {
    if (!mqttConnected) {
      console.log("Not connected to the server");
      return;
    }
    
    try {
      // First, get the current component config
      let componentConfig = await getConfigFromDatabase();
      
      // Initialize if needed
      if (!componentConfig || Object.keys(componentConfig).length === 0) {
        componentConfig = {
          controllers: Array(numControllers).fill(0).map((_, i) => createDefaultController(i)),
          lastUpdated: new Date().toISOString()
        };
      }
      
      if (!componentConfig.controllers || !Array.isArray(componentConfig.controllers)) {
        componentConfig.controllers = Array(numControllers).fill(0).map((_, i) => createDefaultController(i));
      }
      
      componentConfig.controllers[index] = controller;
      componentConfig.lastUpdated = new Date().toISOString();
      
      setProjectConfig(componentConfig);
      
      if (publish) {
        if (brightnessChange) {
          if (publishTimers.current[index]) {
            clearTimeout(publishTimers.current[index]);
          }
          
          publishTimers.current[index] = setTimeout(async () => {
            publish(`${configType}/manual/${index}`, controller);
            await saveConfigToDatabase(componentConfig);
            publishTimers.current[index] = null;
          }, DEBOUNCE_DELAY);
        } else {
          // for button presses, publish immediately, don't debounce
          publish(`${configType}/manual/${index}`, controller);
          await saveConfigToDatabase(componentConfig);
        }
      }
      
      if (onSubmit) {
        onSubmit(controller, index);
      }
    } catch (error) {
      console.error('Error saving controller settings:', error);
    }
  };

  const handleSupplyChange = useCallback((controllerIndex, supplyIndex, field, value) => {
    if (!mqttConnected) return;
    const newControllers = [...controllers];
    newControllers[controllerIndex].supplies[supplyIndex][field] = value;
    newControllers[controllerIndex].lastUpdated = new Date().toISOString();
    setControllers(newControllers);
    
    const updatedController = newControllers[controllerIndex];
    handleSubmit(updatedController, controllerIndex, field === 'brightness');
  }, [controllers, mqttConnected]);

  const handleControllerChange = useCallback((index, field, value) => {
    if (!mqttConnected) return;
    const newControllers = [...controllers];
    newControllers[index][field] = value;
    newControllers[index].lastUpdated = new Date().toISOString();
    setControllers(newControllers);
    
    const updatedController = newControllers[index];
    handleSubmit(updatedController, index, field === 'motorSpeed');
  }, [controllers, mqttConnected]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '24px' }}>
        {controllers.map((controller, controllerIndex) => {
          if (!controller) {controller = createDefaultController(controllerIndex);}
          return (
            <div key={controllerIndex} className="space-y-4" style={{ width: '150px', flex: '0 0 auto' }}>
              {controller.supplies.map((supply, supplyIndex) => {
                const supplyType = `supply${supplyIndex}`;
                if (features && !features.includes(supplyType)) {
                  return null;
                }
                
                return (
                  <div 
                    key={`${controllerIndex}-${supplyIndex}`} 
                    className="flex items-center gap-4 bg-gray-50 p-2 rounded-lg w-full"
                  >
                    <button
                      onClick={() => {handleSupplyChange(controllerIndex, supplyIndex, 'enabled', !supply.enabled);}}
                      type="button"
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        supply.enabled ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {configType === 'stool' 
                        ? stoolSupplyIcons[supplyIndex]
                        : wallFlowerSupplyIcons[supplyIndex]
                      }
                    </button>
                    <div className="flex-1">
                      <input
                        type="range"
                        value={supply.brightness !== undefined ? supply.brightness : 0.5}
                        onChange={(e) => {handleSupplyChange(controllerIndex, supplyIndex, 'brightness', parseFloat(e.target.value));}}
                        min="0"
                        max="1"
                        step="0.01"
                        className={`w-full ${!supply.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!supply.enabled}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Motor Controls - Only show if "motor" is in features */}
              {features && features.includes("motor") && (
                <div className="bg-gray-50 p-2 rounded-lg w-full">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        handleControllerChange(controllerIndex, 'motorEnable', !controller.motorEnable);
                      }}
                      type="button"
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        controller.motorEnable ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Disc2 className="h-5 w-5" />
                    </button>
                    <div className="flex-1 flex items-center">
                      <input
                        type="range"
                        value={controller.motorSpeed !== undefined ? controller.motorSpeed : 0.5}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          handleControllerChange(controllerIndex, 'motorSpeed', newValue);
                        }}
                        min="0"
                        max="1"
                        step="0.01"
                        className={`w-full ${!controller.motorEnable || activeMode === 'profile' || activeMode === 'audio' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!controller.motorEnable}
                      />
                    </div>
                  </div>
                </div>
              )}

              {features && features.includes("motor") && (
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      handleControllerChange(controllerIndex, 'motorDirection', false);
                    }}
                    type="button"
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      !controller.motorDirection ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    } ${!controller.motorEnable || activeMode === 'profile' || activeMode === 'audio' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!controller.motorEnable}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                  </button>
                  <button
                    onClick={() => {
                      handleControllerChange(controllerIndex, 'motorDirection', true);
                    }}
                    type="button"
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      controller.motorDirection ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    } ${!controller.motorEnable || activeMode === 'profile' || activeMode === 'audio' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!controller.motorEnable}
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ManualControlPanel;