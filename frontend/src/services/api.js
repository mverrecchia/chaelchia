export const getWallflowerConfigFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const portfolioConfig = await response.json();
    
    return portfolioConfig.wallflower || {};
  } catch (error) {
    console.error('Error fetching portfolio config:', error);
    return {};
  }
};

export const saveWallflowerConfigToDatabase = async (configData) => {
  try {
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include',
        cache: 'no-store'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.wallflower = configData;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: "include",
      cache: 'no-store'
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      console.error('Server error response:', errorText);
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return configData;
  } catch (error) {
    console.error('Error saving wallflower config:', error);
    throw error;
  }
};

export const getStoolConfigFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const portfolioConfig = await response.json();
    return portfolioConfig.stool || {};
  } catch (error) {
    console.error('Error fetching latest stool config:', error);
    return {};
  }
};

export const saveStoolConfigToDatabase = async (configData) => {
  try {
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.stool = configData;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: "include"
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return configData;
  } catch (error) {
    console.error('Error saving stool config:', error);
    throw error;
  }
};

export const getFlipFrameConfigFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include' 
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const portfolioConfig = await response.json();
    
    return portfolioConfig.flipDisc || {};
  } catch (error) {
    console.error('Error fetching flipDisc config:', error);
    return {};
  }
};

export const saveFlipFrameConfigToDatabase = async (configData) => {
  try {
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.flipDisc = configData;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: 'include'
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return configData;
  } catch (error) {
    console.error('Error saving flipDisc config:', error);
    throw error;
  }
};

export const getDiscoKnobConfigFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const portfolioConfig = await response.json();
    return portfolioConfig.discoKnob || {};
  } catch (error) {
    console.error('Error fetching discoKnob config:', error);
    return {};
  }
};

export const saveDiscoKnobConfigToDatabase = async (configData) => {
  try {    
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.discoKnob = configData;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: 'include'
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return configData;
  } catch (error) {
    console.error('Error saving discoKnob config:', error);
    throw error;
  }
};

export const getLightSwitchConfigFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const portfolioConfig = await response.json();
    return portfolioConfig.lightsOn || false;
  } catch (error) {
    console.error('Error fetching light switch config:', error);
    return false;
  }
};

export const saveLightSwitchConfigToDatabase = async (lightsOn) => {
  try {
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.lightsOn = lightsOn;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: 'include'
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return lightsOn;
  } catch (error) {
    console.error('Error saving light switch config:', error);
    throw error;
  }
};

export const getClientIdFromDatabase = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const portfolioConfig = await response.json();
    return portfolioConfig.clientId || null;
  } catch (error) {
    console.error('Error fetching MQTT client ID:', error);
    return null;
  }
};

export const saveClientIdToDatabase = async (clientId) => {
  try {
    let portfolioConfig;
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
        credentials: 'include'
      });
      if (response.ok) {
        portfolioConfig = await response.json();
      }
    } catch (e) {
      console.log('No existing portfolio found, creating new one');
    }
    
    if (!portfolioConfig) {
      portfolioConfig = {
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {}
      };
    }
    
    portfolioConfig.clientId = clientId;
    
    const saveResponse = await fetch(`${process.env.REACT_APP_API_BASE_URL}/portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(portfolioConfig),
      credentials: 'include'
    });
    
    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      throw new Error(`API error: ${saveResponse.status} - ${errorText}`);
    }
    
    return clientId;
  } catch (error) {
    console.error('Error saving MQTT client ID:', error);
    throw error;
  }
};
