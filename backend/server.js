require('dotenv').config();

const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
async function createServer() {
  const app = express();

  app.use(cors({
    origin: [
      'http://localhost:3000',
      'http://chaelchia.com',
      'http://www.chaelchia.com',
      'https://chaelchia.com',
      'https://www.chaelchia.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });

  app.use(bodyParser.json());
  
  // Trust the reverse proxy (important for cookies when behind HTTPS proxy)
  app.set('trust proxy', 1);
  
  try {
    await mongoose.connect(process.env.REACT_APP_MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, 
    saveUninitialized: true,
    cookie: { 
      maxAge: 20 * 60 * 1000,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'none' // Allow cross-site cookies
    },
    proxy: true // Trust the reverse proxy
  }));

  app.use('/api', apiRoutes());

  const server = http.createServer(app);
  server.on('close', () => {
    console.log('Closing server connections');
    
    mongoose.connection.close(() => {
      console.log('MongoDB connection closed');
    });
  });

  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://chaelchia.com',
        'http://www.chaelchia.com',
        'https://chaelchia.com',
        'https://www.chaelchia.com'
      ],
      credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
  });

  const mqttClient = mqtt.connect(process.env.MQTT_BROKER, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
  });

  // forward mqtt messages to frontend
  mqttClient.on('message', (topic, message) => {
    io.emit('mqtt-message', { topic, message: message.toString() });
  });

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe('wallflower/manager/status');
    mqttClient.subscribe('stool/manager/status');
    mqttClient.subscribe('flip/manager/status');
    mqttClient.subscribe('smartknob/manager/status');
    mqttClient.subscribe('wallflower/lock/response');
    mqttClient.subscribe('stool/lock/response');
    mqttClient.subscribe('flip/lock/response');
    mqttClient.subscribe('smartknob/lock/response');
  });

  io.on('connection', (socket) => {
    console.log('Frontend connected');

    socket.on('publish-mqtt', (data) => {
      mqttClient.publish(data.topic, data.message);
    });
  });

  return server;
}

module.exports = { createServer };
