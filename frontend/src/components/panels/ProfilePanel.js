import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMQTT } from '../../contexts/MQTTClient';
import { StopCircle, MoveVertical, MoveHorizontal, Square } from 'lucide-react';
import { ReactComponent as CosineIcon } from '../../assets/icons/cosine.svg';
import { ReactComponent as BounceIcon } from '../../assets/icons/bounce.svg';
import { ReactComponent as ExponentialIcon } from '../../assets/icons/exponential.svg';
import { ReactComponent as PulseIcon } from '../../assets/icons/pulse.svg';
import { ReactComponent as TriangleIcon } from '../../assets/icons/triangle.svg';
import { ReactComponent as ElasticIcon } from '../../assets/icons/elastic.svg';
import { ReactComponent as CascadeIcon } from '../../assets/icons/cascade.svg';
import { ReactComponent as FlickerIcon } from '../../assets/icons/flicker.svg';

const profileTypes = [
  { id: 0, name: "Cosine", icon: <CosineIcon className="w-6 h-6" /> },
  { id: 1, name: "Bounce", icon: <BounceIcon className="w-6 h-6" /> },
  { id: 2, name: "Exponential", icon: <ExponentialIcon className="w-6 h-6" /> },
  { id: 3, name: "Pulse", icon: <PulseIcon className="w-6 h-6" /> },
  { id: 4, name: "Triangle", icon: <TriangleIcon className="w-6 h-6" /> },
  { id: 5, name: "Elastic", icon: <ElasticIcon className="w-6 h-6" /> },
  { id: 6, name: "Cascade", icon: <CascadeIcon className="w-6 h-6" /> },
  { id: 7, name: "Flicker", icon: <FlickerIcon className="w-6 h-6" /> },
];  

const ProfilePanel = ({ onSubmit, numControllers, getConfigFromDatabase, saveConfigToDatabase, configType, isActive }) => {
  const { 
    mqttConnected, 
    managerState, 
    publish
  } = useMQTT();

  const [globalPhaseOffset, setGlobalPhaseOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [projectConfig, setProjectConfig] = useState(null);
  const [profiles, setProfiles] = useState(
    Array(numControllers).fill(0).map((_, idx) => ({
      index: idx,
      profileType: 0,
      magnitude: 0.5,
      frequency: 0.5,
      phase: 0,
      enable: false,
      stopProfile: false
    }))
  );
  const mqttDebounceTimers = useRef(Array(numControllers).fill(null));

  const loadProfileSettings = useCallback(async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const componentConfig = await getConfigFromDatabase();
      
      if (componentConfig && componentConfig.profiles && Array.isArray(componentConfig.profiles)) {
        const loadedProfiles = componentConfig.profiles.slice(0, numControllers);
        
        setProfiles(prev => {
          const updatedProfiles = [...prev];
          
          loadedProfiles.forEach((loadedProfile, idx) => {
            if (idx < updatedProfiles.length) {
              updatedProfiles[idx] = {
                ...updatedProfiles[idx],
                ...loadedProfile,
                index: idx
              };
            }
          });
          
          return updatedProfiles;
        });
        
        setProjectConfig(componentConfig);

        // don't publish on initial load - only set the UI state
        // we'll only publish when the user makes changes
      } else {
        const defaultProfiles = Array(numControllers).fill(0).map((_, idx) => ({
          index: idx,
          profileType: 0,
          magnitude: 0.5,
          frequency: 0.5,
          phase: 0,
          enable: false
        }));
        
        const newComponentConfig = {
          ...(componentConfig || {}),
          profiles: defaultProfiles,
          lastUpdated: new Date().toISOString()
        };
        
        await saveConfigToDatabase(newComponentConfig);
        
        setProjectConfig(newComponentConfig);
        setProfiles(defaultProfiles);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getConfigFromDatabase, saveConfigToDatabase, mqttConnected, publish, onSubmit, numControllers, configType]);

  useEffect(() => {
    if (isActive) {
      loadProfileSettings();
    }
    
    return () => {
      if (mqttDebounceTimers.current) {
        mqttDebounceTimers.current.forEach(timer => {
          if (timer) clearTimeout(timer);
        });
      }
    };
  }, [isActive, loadProfileSettings]);


  const handleSubmit = async (updatedProfiles) => {
    if (!mqttConnected) {
      console.log("MQTT not connected, cannot submit profiles");
      return false;
    }

    try {
      const componentConfig = await getConfigFromDatabase();
      
      const updatedConfig = {
        ...(componentConfig || {}),
        profiles: updatedProfiles,
        lastUpdated: new Date().toISOString()
      };
      
      await saveConfigToDatabase(updatedConfig);
      
      if (publish) {
        const enabledProfiles = updatedProfiles.filter(p => p.enable);
        if (enabledProfiles.length > 0) {
          publish(`${configType}/profile`, enabledProfiles);
        }
      }
      
      setProjectConfig(updatedConfig);
      setProfiles(updatedProfiles);
      
      if (onSubmit) {
        onSubmit(updatedProfiles.filter(p => p.enable).length > 0 ? 
                updatedProfiles.filter(p => p.enable) : 
                updatedProfiles);
      }
      
      return true;
    } catch (error) {
      console.error('Error saving profiles:', error);
      return false;
    }
  };

  const calculatePhaseForController = (controllerIdx, basePhase) => {
    return (controllerIdx / numControllers) * basePhase;
  };

  const handleProfileTypeSelection = async (controllerId, profileTypeId) => {
    if (!mqttConnected) return;
    
    const updatedProfiles = [...profiles];
    const currentProfile = updatedProfiles[controllerId];
    const enableState = !(currentProfile.profileType === profileTypeId && currentProfile.enable);
    const calculatedPhase = calculatePhaseForController(controllerId, globalPhaseOffset);
    
    updatedProfiles[controllerId] = {
      ...updatedProfiles[controllerId],
      profileType: profileTypeId,
      enable: enableState,
      index: controllerId,
      phase: calculatedPhase
    };
    
    setProfiles(updatedProfiles);
    
    if (!enableState) {
      const stopRequest = {
        index: controllerId,
        stopProfile: true
      };
      
      if (publish) {
        publish(`${configType}/profile`, [stopRequest]);
      }
      
      if (onSubmit) {
        onSubmit([stopRequest]);
      }
    } else {
      handleSubmit(updatedProfiles);
    }
  };
  
  const handleInputChange = useCallback(async (controllerId, field, value) => {
    if (!mqttConnected) return;
    const updatedProfiles = [...profiles];
  
    updatedProfiles[controllerId] = {
      ...updatedProfiles[controllerId],
      [field]: field === 'magnitude' ? Math.max(0, Math.min(1, parseFloat(value))) : 
              field === 'frequency' ? Math.max(0.1, Math.min(0.5, parseFloat(value))) : 
              field === 'phase' ? calculatePhaseForController(controllerId, parseFloat(value)) : 
              field === 'profileType' ? parseInt(value, 10) : 
              field === 'enable' ? Boolean(value) : 
              value === '' ? '' : parseFloat(value)
    }
  
    setProfiles(updatedProfiles);
    handleSubmit(updatedProfiles);
  }, [profiles, mqttConnected, handleSubmit]);
  
  const handleStopAll = useCallback(async () => {
    if (!mqttConnected) return;
    
    const stopRequests = Array(numControllers).fill(0).map((_, idx) => ({
      index: idx,
      stopProfile: true
    }));
    
    handleSubmit(profiles);
    
    if (publish) {
      publish(`${configType}/profile`, stopRequests);
    }
    
    if (onSubmit) {
      onSubmit(stopRequests);
    }
  }, [mqttConnected, onSubmit, profiles, numControllers, publish, configType, handleSubmit]);
  
  const handlePhaseOffsetChange = useCallback((value) => {
    const newPhaseOffset = parseFloat(value);
    setGlobalPhaseOffset(newPhaseOffset);
  
    const updatedProfiles = profiles.map((profile, idx) => ({
      ...profile,
      phase: (idx / numControllers) * newPhaseOffset
    }));
  
    setProfiles(updatedProfiles);
    
    handleSubmit(updatedProfiles);
  }, [profiles, numControllers, handleSubmit]);
  
  const isProfileActive = (controllerId) => {
    if (!managerState || !managerState.controllers || 
        !Array.isArray(managerState.controllers) || 
        controllerId >= managerState.controllers.length) {
      return false;
    }
    
    const controller = managerState.controllers[controllerId];
    return controller && controller.profileActive;
  };
  
  const renderControllerProfile = (controllerId) => {
    const profile = profiles[controllerId];
    if (!profile) return null;
    
    return (
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap justify-center gap-2">
              {profileTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleProfileTypeSelection(controllerId, type.id)}
                  className={`w-9 h-9 flex items-center justify-center border rounded-md
                    ${profile.profileType === type.id && profile.enable
                      ? 'bg-blue-500 text-white border-blue-600' 
                      : 'bg-white hover:bg-gray-100 border-gray-300'}`}
                  title={type.name}
                  disabled={!mqttConnected}
                >
                  {type.icon}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MoveVertical className="w-8 h-8 text-gray-500" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={profile.magnitude !== undefined ? profile.magnitude : 0.5}
                onChange={(e) => handleInputChange(controllerId, 'magnitude', e.target.value)}
                className={`w-full ${!mqttConnected ? 'opacity-70' : ''}`}
                disabled={!mqttConnected}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MoveHorizontal className="w-8 h-8 text-gray-500" />
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.025"
                value={profile.frequency !== undefined ? profile.frequency : 0.25}
                onChange={(e) => handleInputChange(controllerId, 'frequency', e.target.value)}
                className={`w-full ${!mqttConnected ? 'opacity-70' : ''}`}
                disabled={!mqttConnected}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  const getGridColsClass = () => {
    switch(numControllers) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-2";
      default:
      case 3: return "grid-cols-3";
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="w-full">
      <div className={`grid ${getGridColsClass()} gap-4 ${numControllers === 1 ? 'justify-items-center' : ''}`}>
        {profiles.map((profile, index) => (
          <div 
            key={index} 
            className={`bg-gray-50 rounded-lg p-4 flex justify-center ${numControllers === 1 ? 'col-span-1' : ''}
              ${isProfileActive(index) ? 'ring-2 ring-blue-500' : ''}`} 
            style={{ maxWidth: "150px" }}
          >
            <div className="w-full">
              {renderControllerProfile(index)}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex flex-col items-center mt-6 space-y-4">
        {configType === 'wallflower' && (
          <div className="flex items-center gap-2 w-48">
            <div className="relative h-10 w-12">
            <div className="absolute top-0 left-0 bg-white rounded">
              <Square className="w-5 h-5 text-grey" />
            </div>
            <div className="absolute top-2 left-2 bg-white rounded">
              <Square className="w-5 h-5 text-grey" />
            </div>
            <div className="absolute top-4 left-4 bg-white rounded">
              <Square className="w-5 h-5 text-grey" />
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={globalPhaseOffset === '' ? 0 : globalPhaseOffset}
            onChange={(e) => handlePhaseOffsetChange(e.target.value)}
            className={`w-full ${!mqttConnected ? 'opacity-70' : ''}`}
            disabled={!mqttConnected}
          />
          </div>
      )}
        <button
          onClick={handleStopAll}
          disabled={!mqttConnected}
          className={`px-4 py-2 rounded-md items-end justify-end ${
            !mqttConnected
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            <StopCircle className="w-4 h-4" />
          </button>
        </div>
    </div>
  );
};

export default ProfilePanel;