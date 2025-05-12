import React, { useState, useEffect, useRef } from 'react';
import { useMQTT } from '../../contexts/MQTTClient';
import { Clock, TriangleIcon, Wand2, Waves, CircleDot, Circle, MoveHorizontal } from 'lucide-react';

const PatternPanel = ({ onSubmit, getConfigFromDatabase, saveConfigToDatabase, isActive }) => {
  const [pattern, setPattern] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const configRef = useRef(null);

  const { 
    mqttConnected, 
    publish
  } = useMQTT();

  const patternTypes = [
    { id: 1, name: 'Clock', icon: <Clock /> },
    { id: 2, name: 'Spiral', icon: <TriangleIcon /> },
    { id: 3, name: 'Waves', icon: <Waves /> },
    { id: 4, name: 'Blob', icon: <Wand2 /> },
    { id: 5, name: 'Cascade', icon: <CircleDot /> },
    { id: 6, name: 'Bounce', icon: <Circle /> },
  ];

  // simplified useEffect to only load when panel becomes active
  useEffect(() => {
    if (isActive) {
      loadPatternSettings();
    }
  }, [isActive]);

  const loadPatternSettings = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const componentConfig = await getConfigFromDatabase();
      configRef.current = componentConfig;

      let patternToLoad;
      if (componentConfig && componentConfig.pattern) {
        patternToLoad = {
          id: componentConfig.pattern.id,
          name: componentConfig.pattern.name,
          speed: componentConfig.pattern.speed,
          enable: componentConfig.pattern.enable
        };
      } else {
        // Create default pattern
        patternToLoad = {
          id: 1,
          name: "Clock",
          speed: 2.0,
          enable: true
        };
        
        const newComponentConfig = {
          pattern: patternToLoad,
          lastUpdated: new Date().toISOString()
        };
        // save to database
        await saveConfigToDatabase(newComponentConfig);
        configRef.current = newComponentConfig;
      }
      
      setPattern(patternToLoad);

      // don't publish on initial load - only set the UI state
      // we'll only publish when the user makes changes
    } catch (error) {
      console.error('Failed to load patterns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePatternTypeSelection = (type) => {    
    const isDeselecting = pattern.name === type.name;
    
    const updatedPattern = isDeselecting ? {
      id: 0,
      name: null,
      speed: pattern.speed,
      enable: false
    } : {
      ...pattern,
      id: type.id,
      name: type.name,
      enable: true
    };
    
    setPattern(updatedPattern);
    handleSubmit(updatedPattern);
  };

  const handleSpeedChange = (value) => {
    const updatedPattern = {
      ...pattern,
      speed: parseFloat(value)
    };
    
    setPattern(updatedPattern);
    handleSubmit(updatedPattern);
  };

  const handleSubmit = async (patternToSubmit = pattern) => {
    if (!mqttConnected) return;

    if (onSubmit) {
      onSubmit(patternToSubmit);
    }

    configRef.current.pattern = patternToSubmit;
    await saveConfigToDatabase(configRef.current);
  
    publish(`flip/pattern`, patternToSubmit);
  };

  if (!pattern) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="w-full p-4 bg-white rounded-lg">      
      <div className="grid grid-cols-3 gap-4 mb-6">
        {patternTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => handlePatternTypeSelection(type)}
            className={`w-16 h-16 flex items-center justify-center border rounded-md
              ${pattern.name === type.name
                ? 'bg-blue-500 text-white border-blue-600' 
                : 'bg-white hover:bg-gray-100 border-gray-300'}`}
            title={type.name}
          >
            {type.icon}
            <span className="sr-only">{type.name}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MoveHorizontal className="w-8 h-8 text-gray-500" />
          <input
            type="range"
            min="2.0"
            max="5.0"
            step="0.2"
            value={pattern.speed}
            onChange={(e) => handleSpeedChange(e.target.value)}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default PatternPanel;