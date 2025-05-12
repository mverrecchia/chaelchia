import React, { useState, useEffect, useRef } from 'react';
import './FlipDiscDraw.css';

const FlipDiscDraw = () => {
  const gridWidthHeight = 28;
  const [token, setToken] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const canvasRef = useRef(null);
  const gridRef = useRef(Array(gridWidthHeight).fill().map(() => Array(gridWidthHeight).fill(1))); // 1 is white, 0 is black
  const isDrawingRef = useRef(false);
  const prevPosRef = useRef({x: -1, y: -1});
  const [isInverted, setIsInverted] = useState(false);

  const GREY = '#dddddd';
  const WHITE = '#ffffff';
  const BLACK = '#000000';
  
  // URL params contain the token
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('t');
    
    if (tokenParam) {
      setToken(tokenParam);
      validateToken(tokenParam);
    } else {
      setMessage({
        text: 'No access token provided',
        type: 'error'
      });
    }
  }, []);
  
  useEffect(() => {
    if (!canvasRef.current || !isValid) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / gridWidthHeight;
    
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 1; i < gridWidthHeight; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasSize, i * cellSize);
      ctx.stroke();
    }
  }, [isValid]);
  
  const validateToken = async (tokenToValidate) => {
    try {
      const API_URL = 'https://flipdisc-api.chaelchia.com';
      const response = await fetch(`${API_URL}/api/validate_token?t=${tokenToValidate}`);
      const data = await response.json();
      
      if (data.valid) {
        setIsValid(true);
      } else {
        setMessage({
          text: 'Invalid or expired token. Please scan the QR code again.',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Error validating token:', error);
      setMessage({
        text: 'Connection error. Please try again.',
        type: 'error'
      });
    }
  };
  
  const startDrawing = (e) => {
    isDrawingRef.current = true;
    draw(e);
  };
  
  const stopDrawing = () => {
    isDrawingRef.current = false;
    prevPosRef.current = {x: -1, y: -1};
  };

  const sendDrawingUpdate = async (currentGrid) => {
    if (!token) return;
    
    try {
      const response = await fetch(`https://flipdisc-api.chaelchia.com/api/submit_drawing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: token,
          matrix: currentGrid
        })
      });
      
    } catch (error) {
      console.error('Error updating drawing:', error);
    }
  };
  
  const draw = (e) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / (canvas.width / gridWidthHeight));
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / (canvas.height / gridWidthHeight));
    
    if (x < 0 || x >= gridWidthHeight || y < 0 || y >= gridWidthHeight) return;
    
    if (x !== prevPosRef.current.x || y !== prevPosRef.current.y) {
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / gridWidthHeight;
      
      if (isInverted) {
        gridRef.current[y][x] = 1;
        ctx.fillStyle = WHITE;
      }
      else {
        gridRef.current[y][x] = 0;
        ctx.fillStyle = BLACK;
      }

      // draw filled cell
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      
      prevPosRef.current = {x, y};
      
      sendDrawingUpdate([...gridRef.current]);
    }
  };
  
  const clearDrawing = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / gridWidthHeight;
    
    // reset grid data
    if (isInverted) {
      gridRef.current = Array(gridWidthHeight).fill().map(() => Array(gridWidthHeight).fill(0));
    }
    else {
      gridRef.current = Array(gridWidthHeight).fill().map(() => Array(gridWidthHeight).fill(1));
    }
    
    // then clear the grid
    if (isInverted) {
      ctx.fillStyle = BLACK;
      ctx.fillRect(1, 1, canvasSize, canvasSize);
    }
    else {
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, canvasSize, canvasSize);
    }
    
    // redraw grid lines
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 1; i < gridWidthHeight; i++) {
      // Y lines, then X lines
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasSize, i * cellSize);
      ctx.stroke();
    }
    submitDrawing();
  };
  
  const invertDrawing = () => {
    setIsInverted(!isInverted);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / gridWidthHeight;

    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;

    // invert each cell
    for (let y = 0; y < gridWidthHeight; y++) {
      for (let x = 0; x < gridWidthHeight; x++) {
        gridRef.current[y][x] = gridRef.current[y][x] === 1 ? 0 : 1;
        
        // and then fill cell based on new value
        ctx.fillStyle = gridRef.current[y][x] === 1 ? WHITE : BLACK;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    
    for (let i = 1; i < gridWidthHeight; i++) {
      // Y lines, then X lines
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasSize, i * cellSize);
      ctx.stroke();
    }
  
    sendDrawingUpdate([...gridRef.current]);
  };
  
  const submitDrawing = async () => {
    if (!token) return;
    
    setIsSubmitting(true);
    
    try {
      const API_URL = 'https://flipdisc-api.chaelchia.com';
      const response = await fetch(`${API_URL}/api/submit_drawing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: token,
          matrix: gridRef.current
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error submitting drawing:', error);
    }
  };
  
  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  };
  
  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  };
  
  return (
    <div className="flip-disc-draw">      
      {message && (
        <div className={`p-4 mb-4 rounded ${
          message.type === 'error' ? 'bg-red-100 text-red-800' :
          message.type === 'success' ? 'bg-green-100 text-green-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}
      
      {!isValid && !message?.type === 'error' && (
        <div className="text-center p-4">
          <p>Validating your access...</p>
        </div>
      )}
      
      {isValid && (
        <div className="flex flex-col items-center">          
          <div className="border-2 border-gray-800 shadow-lg mb-6">
            <canvas 
              ref={canvasRef}
              width={560}
              height={560}
              className="touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={stopDrawing}
            />
          </div>
          
          <div className="flex gap-4 mb-6">
            <button 
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              onClick={clearDrawing}
            >
              Clear
            </button>
            <button 
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              onClick={invertDrawing}
            >
              Invert
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlipDiscDraw;