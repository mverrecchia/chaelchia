require('dotenv').config();

const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes');
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
  
  return server;
}

module.exports = { createServer };
