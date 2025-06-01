import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { getClientIdFromDatabase, saveClientIdToDatabase } from '../services/api';

const MQTTContext = createContext();
export const useMQTT = () => useContext(MQTTContext);

const wallFlowerTopic = 'wallflower/manager/status';
const stoolTopic = 'stool/manager/status';
const flipFrameTopic = 'flip/manager/status';
const discoKnobTopic = 'smartknob/manager/status';

const wallFlowerLockTopic = 'wallflower/lock/request';
const stoolLockTopic = 'stool/lock/request';
const flipFrameLockTopic = 'flip/lock/request';
const discoKnobLockTopic = 'smartknob/lock/request';

const wallFlowerLockResponseTopic = 'wallflower/lock/response';
const stoolLockResponseTopic = 'stool/lock/response';
const flipFrameLockResponseTopic = 'flip/lock/response';
const discoKnobLockResponseTopic = 'smartknob/lock/response';

export const MQTTProvider = ({ children }) => {
  const [clientId, setClientId] = useState(`web_temp_${Math.random().toString(16).slice(2, 10)}`);
  const [socket, setSocket] = useState(null);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [stoolManagerState, setStoolManagerState] = useState({ status: 'offline' });
  const [wallflowerManagerState, setWallflowerManagerState] = useState({ status: 'offline' });
  const [flipdiscManagerState, setFlipdiscManagerState] = useState({ status: 'offline' });
  const [discoKnobManagerState, setDiscoKnobManagerState] = useState({ status: 'offline' });
  const [lastMessages, setLastMessages] = useState({});
  const [connectionError, setConnectionError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervals = useRef({});
  
  useEffect(() => {
    const loadClientId = async () => {
      try {
        const storedClientId = await getClientIdFromDatabase();
        
        if (storedClientId && storedClientId.length > 0) {
          setClientId(storedClientId);
        } else {
          const newClientId = `web_${Math.random().toString(16).slice(2, 10)}`;
          setClientId(newClientId);
          
          await saveClientIdToDatabase(newClientId);
        }
      } catch (error) {
        console.error("Error managing client ID:", error);
      }
    };
    
    loadClientId();
  }, []);
  
  const [deviceLocks, setDeviceLocks] = useState({
    wallflower: { locked: false, lockedBy: null, isOwner: false, timeRemaining: 0 },
    stool:      { locked: false, lockedBy: null, isOwner: false, timeRemaining: 0 },
    flipframe:  { locked: false, lockedBy: null, isOwner: false, timeRemaining: 0 },
    discoKnob:  { locked: false, lockedBy: null, isOwner: false, timeRemaining: 0 }
  });
  
  // only allow MQTT connection when we have a valid client ID
  useEffect(() => {
    if (clientId.startsWith('web_temp_')) {
      return;
    }

    const baseUrl = process.env.REACT_APP_API_BASE_URL.replace('/api', '');
    const socketConnection = io(baseUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      secure: window.location.protocol === 'https:',
      rejectUnauthorized: false
    });

    socketConnection.on('connect', () => {
      setMqttConnected(true);
      setConnectionError(null);
      console.log('Connected to backend via Socket.io');
    });

    socketConnection.on('mqtt-message', (data) => {
      try {
        const { topic, message } = data;
        const payload = JSON.parse(message);
        
        const timestamp = Date.now();
        setLastMessages(prev => {
          const updatedMessages = {
            ...prev,
            [topic]: { 
              payload,
              timestamp
            }
          };

          return updatedMessages;
        });

        switch(topic) {
          case stoolTopic:
            setStoolManagerState(payload);
            if (payload.locked !== undefined) {
              handleLockStatusFromManager('stool', payload);
            }
            break;
          case wallFlowerTopic:
            setWallflowerManagerState(payload);
            if (payload.locked !== undefined) {
              handleLockStatusFromManager('wallflower', payload);
            }
            break;
          case flipFrameTopic:
            setFlipdiscManagerState(payload);
            if (payload.locked !== undefined) {
              handleLockStatusFromManager('flipframe', payload);
            }
            break;
          case discoKnobTopic:
            setDiscoKnobManagerState(payload);
            if (payload.locked !== undefined) {
              handleLockStatusFromManager('discoKnob', payload);
            }
            break;
          
          case wallFlowerLockResponseTopic:
            handleLockResponse('wallflower', payload);
            break;
          case stoolLockResponseTopic:
            handleLockResponse('stool', payload);
            break;
          case flipFrameLockResponseTopic: 
            handleLockResponse('flipframe', payload);
            break;
          case discoKnobLockResponseTopic:
            handleLockResponse('discoKnob', payload);
            break;
          
          default:
            break;
        }
      } catch (err) {
        console.error('Error processing MQTT message:', err);
      }
    });

    const handleLockResponse = (deviceType, response) => {      
      const isOwner = response.locked ? (response.lockedBy === clientId) : false;
      
      setDeviceLocks(prev => {        
        const newState = {
          ...prev,
          [deviceType]: {
            locked: response.locked,
            lockedBy: response.lockedBy,
            isOwner: isOwner,
            timeRemaining: response.timeRemaining || 0
          }
        };
        
        return newState;
      });
      
      if (isOwner && response.success && response.locked) {
        setupHeartbeat(deviceType);
      } else {
        clearHeartbeat(deviceType);
      }
    };
    
    const handleLockStatusFromManager = (deviceType, status) => {      
      if (status.locked === undefined) return;
      
      const isOwner = status.locked ? (status.lockedBy === clientId) : false;
      
      setDeviceLocks(prev => {
        if (prev[deviceType]?.locked === status.locked && 
            prev[deviceType]?.lockedBy === status.lockedBy) {
          return prev;
        }
        
        const newState = {
          ...prev,
          [deviceType]: {
            locked: status.locked,
            lockedBy: status.lockedBy,
            isOwner: isOwner,
            timeRemaining: status.lockTimeRemaining || 0
          }
        };
          
        return newState;
      });
      
      if (isOwner && status.locked) {
        setupHeartbeat(deviceType);
      } else if (!status.locked || !isOwner) {
        clearHeartbeat(deviceType);
      }
    };

    socketConnection.on('connect_error', (err) => {
      console.error('Socket.io connection error:', err);
      setConnectionError(`Connection error: ${err.message}`);
    });

    socketConnection.on('disconnect', () => {
      console.log('Socket.io connection closed');
      setMqttConnected(false);
    });

    socketConnection.on('reconnect', () => {
      console.log('Socket.io: Reconnecting to backend');
    });

    setSocket(socketConnection);
    
    const setupHeartbeat = (deviceType) => {
      clearHeartbeat(deviceType);

      if (!socketConnection || !socketConnection.connected) {
        console.warn(`Cannot setup heartbeat for ${deviceType} - Socket.io not connected`);
        return;
      }

      const interval = setInterval(() => {
        if (socketConnection && socketConnection.connected) {
          sendHeartbeat(deviceType, socketConnection);
        }
      }, 30000);

      heartbeatIntervals.current[deviceType] = interval;
      console.log(`Heartbeat setup for ${deviceType}`);
    };

    const clearHeartbeat = (deviceType) => {
      if (heartbeatIntervals.current && heartbeatIntervals.current[deviceType]) {
        clearInterval(heartbeatIntervals.current[deviceType]);
        delete heartbeatIntervals.current[deviceType];
      }
    };

    const sendHeartbeat = (deviceType, socketInstance) => {
      const activeSocket = socketInstance || socket;

      if (!activeSocket || !activeSocket.connected) {
        console.warn(`Cannot send heartbeat for ${deviceType} - Socket.io not connected`);
        return;
      }

      const topic = getDeviceLockTopic(deviceType);
      if (!topic) {
        console.warn(`Invalid topic for ${deviceType} heartbeat`);
        return;
      }

      const payload = {
        action: 'heartbeat',
        clientId: clientId,
        timestamp: Date.now()
      };

      try {
        activeSocket.emit('publish-mqtt', { topic, message: JSON.stringify(payload) });
        console.log(`Sent heartbeat for ${deviceType}`);
      } catch (error) {
        console.error(`Error sending heartbeat for ${deviceType}:`, error);
      }
    };
    
    const getDeviceLockTopic = (deviceType) => {
      switch(deviceType) {
        case 'wallflower': return wallFlowerLockTopic;
        case 'stool': return stoolLockTopic;
        case 'flipframe': return flipFrameLockTopic;
        case 'discoKnob': return discoKnobLockTopic;
        default: return null;
      }
    };

    return () => {
      // clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      Object.keys(heartbeatIntervals.current).forEach(clearHeartbeat);
      
      if (socketConnection) {
        socketConnection.disconnect();
      }
    };
  }, [clientId]);

  const requestDeviceLock = useCallback((deviceType) => {
    // return early if we don't have a valid Socket.io connection
    if (!socket || !mqttConnected) return false;
    
    const topic = getDeviceLockTopic(deviceType);
    // return early if we don't have a valid lock topic
    if (!topic) return false;
    
    const payload = {
      action: 'lock',
      clientId: clientId,
      timestamp: Date.now()
    };
    
    socket.emit('publish-mqtt', { topic, message: JSON.stringify(payload) });
    return true;
  }, [socket, mqttConnected, clientId]);
  
  const releaseDeviceLock = useCallback((deviceType) => {
    // return early if we don't have a valid Socket.io connection
    if (!socket || !mqttConnected) return false;
    
    const topic = getDeviceLockTopic(deviceType);
    // return early if we don't have a valid lock topic
    if (!topic) return false;
    
    const currentLockState = deviceLocks[deviceType];
    
    // return early if we don't own the lock
    if (!currentLockState?.isOwner) {
      console.warn(`Cannot release lock for ${deviceType} - we are not the owner`);
      return false;
    }
    
    const payload = {
      action: 'unlock',
      clientId: clientId,
      timestamp: Date.now()
    };
    const jsonPayload = JSON.stringify(payload);
    
    socket.emit('publish-mqtt', { topic, message: jsonPayload });
    
    if (heartbeatIntervals.current[deviceType]) {
      clearInterval(heartbeatIntervals.current[deviceType]);
      delete heartbeatIntervals.current[deviceType];
    }
    
    return true;
  }, [socket, mqttConnected, clientId, deviceLocks]);
  
  const getDeviceLockTopic = useCallback((deviceType) => {
    switch(deviceType) {
      case 'wallflower': return wallFlowerLockTopic;
      case 'stool': return stoolLockTopic;
      case 'flipframe': return flipFrameLockTopic;
      case 'discoKnob': return discoKnobLockTopic;
      default: return null;
    }
  }, []);
  
  const publish = useCallback((topic, message) => {
    if (!socket || !mqttConnected) {
      return false;
    }
    
    let deviceType = null;
    if (topic.startsWith('wallflower/')) deviceType = 'wallflower';
    else if (topic.startsWith('stool/')) deviceType = 'stool';
    else if (topic.startsWith('flip/')) deviceType = 'flipframe';
    else if (topic.startsWith('smartknob/')) deviceType = 'discoKnob';
    
    const isLockTopic = topic.includes('/lock/');
    
    // if we don't own the lock, block the publish
    if (deviceType && !isLockTopic) {
      const deviceLock = deviceLocks[deviceType];
      if (deviceLock?.locked && !deviceLock?.isOwner) {
        console.warn(`Cannot publish to ${topic} - device is locked by ${deviceLock.lockedBy}`);
        return false;
      }
    }
    
    // append client ID
    const messageWithClientId = typeof message === 'object' 
      ? { ...message, clientId: clientId }
      : message;
    
    const payload = typeof messageWithClientId === 'object' 
      ? JSON.stringify(messageWithClientId) 
      : messageWithClientId;
    
    socket.emit('publish-mqtt', { topic, message: payload });
    return true;
  }, [socket, mqttConnected, clientId, deviceLocks]);
  
  // check if we have a valid persistent client ID
  const hasValidClientId = !clientId.startsWith('web_temp_');

  const value = {
    socket,
    mqttConnected,
    connectionError,
    stoolManagerState,
    wallflowerManagerState,
    flipdiscManagerState,
    discoKnobManagerState,
    lastMessages,
    publish,
    clientId,
    deviceLocks,
    requestDeviceLock,
    releaseDeviceLock,
    hasValidClientId
  };

  return (
    <MQTTContext.Provider value={value}>
      {children}
    </MQTTContext.Provider>
  );
};