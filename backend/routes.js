// routes.js
const express = require('express');
const { PortfolioConfig } = require('./models');
function createRoutes() {
const router = express.Router();

router.get('/portfolio', async (req, res) => {
  try {
    const sessionId = req.session.id;    
    
    // Just try to find the existing config without creating a new one
    let config = await PortfolioConfig.findOne({ sessionId });
    
    // If no config exists, just return an empty one
    if (!config) {
      config = {
        sessionId,
        clientId: "",
        stool: {},
        wallflower: {},
        flipDisc: {},
        discoKnob: {},
        lightsOn: true
      };
    }
    
    res.json(config);
  } catch (err) {
    console.error('Error details for GET /portfolio:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

router.post('/portfolio', async (req, res) => {
  try {
    const sessionId = req.session.id;
    
    const configData = { ...req.body };
    delete configData._id;
    
    const expireAt = new Date(Date.now() + 10*60*1000);
    
    let config = await PortfolioConfig.findOne({ sessionId });
    
    if (config) {      
      const result = await PortfolioConfig.findByIdAndUpdate(
        config._id,
        { 
          $set: {
            ...configData,
            sessionId,
            expireAt,
            lastUpdated: new Date()
          } 
        },
        { 
          new: true,
          runValidators: true
        }
      );
      
      if (!result) {
        throw new Error('Failed to update portfolio: document not found after update');
      }
      
      res.status(200).json(result);
    } else {
      const newConfig = new PortfolioConfig({
        ...configData,
        sessionId,
        expireAt,
        lastUpdated: new Date()
      });
      await newConfig.save();
      res.status(201).json(newConfig);
    }
  } catch (err) {
    console.error('Error details for POST /portfolio:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

  return router;
}

module.exports = createRoutes;