import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MQTTProvider } from './contexts/MQTTClient';
import UnifiedDashboard from './pages/UnifiedDashboard';

function App() {
  return (
    <MQTTProvider>
      <BrowserRouter>
        <div className="container mx-auto px-4">
          <Routes>
            <Route path="/" element={<UnifiedDashboard />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MQTTProvider>
  );
}

export default App;