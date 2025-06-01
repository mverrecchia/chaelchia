require('dotenv').config();
const { createServer } = require('./server');

async function start() {
  try {
    console.log("Backend is starting...");

    const server = await createServer();
    
    const PORT = process.env.REACT_APP_BACKEND_PORT
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
      });
    });
    
    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
      });
    });
    
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
