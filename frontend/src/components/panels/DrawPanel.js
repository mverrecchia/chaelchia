import React, { useState, useEffect, useRef } from 'react';
import { useMQTT } from '../../contexts/MQTTClient';
import { ArrowRightCircle, ArrowUpCircle, Delete } from 'lucide-react';

const DrawPanel = ({ onSubmit, getConfigFromDatabase, saveConfigToDatabase, isActive }) => {
  const gridSize = 28;
  const perimeterSize = 1; // 1 cell thick perimeter
  const totalSize = gridSize + (perimeterSize * 2); // Add perimeter to both sides
  const canvasRef = useRef(null);
  const [grid, setGrid] = useState(Array(gridSize).fill().map(() => Array(gridSize).fill(0))); // 0 is black, 1 is white
  const [isInverted, setIsInverted] = useState(false);
  const isDrawingRef = useRef(false);
  const prevPosRef = useRef({x: -1, y: -1});
  const configRef = useRef(null);

  const GREY = '#dddddd';
  const WHITE = '#ffffff';
  const BLACK = '#000000';

  const {
    mqttConnected,
    publish
  } = useMQTT();

  useEffect(() => {
    if (!canvasRef.current) return;
    initializeCanvas();
  }, [canvasRef.current]);

  useEffect(() => {
    if (isActive && canvasRef.current) {
      loadDrawingSettings();
    }
  }, [isActive, canvasRef.current]);

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / totalSize;
    
    ctx.fillStyle = '#C5FFFA';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    ctx.fillStyle = BLACK;
    ctx.fillRect(
      cellSize * perimeterSize, 
      cellSize * perimeterSize, 
      cellSize * gridSize, 
      cellSize * gridSize
    );
    
    drawGridLines(ctx, cellSize);
  };

  const drawGridLines = (ctx, cellSize) => {
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 1; i < gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo((i + perimeterSize) * cellSize, perimeterSize * cellSize);
      ctx.lineTo((i + perimeterSize) * cellSize, (gridSize + perimeterSize) * cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(perimeterSize * cellSize, (i + perimeterSize) * cellSize);
      ctx.lineTo((gridSize + perimeterSize) * cellSize, (i + perimeterSize) * cellSize);
      ctx.stroke();
    }
  };

  const loadDrawingSettings = async () => {
    if (!canvasRef.current) return;
    
    try {
      const componentConfig = await getConfigFromDatabase();
      configRef.current = componentConfig;

      const hasValidGrid = componentConfig && 
                          componentConfig.drawing && 
                          componentConfig.drawing.grid && 
                          Array.isArray(componentConfig.drawing.grid) &&
                          componentConfig.drawing.grid.length === gridSize &&
                          componentConfig.drawing.grid.every(row => Array.isArray(row) && row.length === gridSize);
      
      let gridToLoad, invertToLoad;
      if (hasValidGrid) {
        gridToLoad = componentConfig.drawing.grid;
        invertToLoad = !!componentConfig.drawing.invert;
      } else {
        gridToLoad = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
        invertToLoad = false;
        
        const newComponentConfig = {
          ...(componentConfig || {}),
          drawing: {
            grid: gridToLoad,
            invert: invertToLoad
          },
          lastUpdated: new Date().toISOString()
        };
        
        await saveConfigToDatabase(newComponentConfig);
        configRef.current = newComponentConfig;
      }
      
      setGrid(gridToLoad);
      setIsInverted(invertToLoad);
      drawCanvas(gridToLoad, invertToLoad);

      if (mqttConnected && publish) {
        publish('flip/draw', gridToLoad);
        if (onSubmit) {
          onSubmit(gridToLoad);
        }
      }
    } catch (error) {
      console.error('Failed to load drawing:', error);
      
      const defaultGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
      setGrid(defaultGrid);
      setIsInverted(false);
      drawCanvas(defaultGrid, false);
      // publish default grid anyway
      if (mqttConnected && publish) {
        publish('flip/draw', defaultGrid);
        if (onSubmit) {
          onSubmit(defaultGrid);
        }
      }
    }
  };

  const drawCanvas = (gridData, isInverted) => {
    if (!canvasRef.current) return;
    
    if (!gridData || !Array.isArray(gridData) || !gridData.length) {
      console.error('Invalid grid data for drawCanvas');
      gridData = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / totalSize;
    
    // Clear canvas with perimeter color
    ctx.fillStyle = '#C5FFFA';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Draw each cell from the grid
    for (let y = 0; y < gridSize; y++) {
      // Check if row exists
      if (!gridData[y] || !Array.isArray(gridData[y])) {
        console.warn(`Row ${y} is missing or invalid in grid data`);
        continue;
      }
      
      for (let x = 0; x < gridSize; x++) {
        // Check if cell exists
        if (gridData[y][x] === undefined) {
          console.warn(`Cell at [${y}][${x}] is undefined`);
          continue;
        }
        
        // Determine cell color based on value and invert state
        const cellValue = gridData[y][x];
        // const fillValue = isInverted ? (cellValue === 0 ? 1 : 0) : cellValue;
        
        ctx.fillStyle = cellValue === 1 ? WHITE : BLACK;
        
        // Draw the cell
        const drawX = (x + perimeterSize) * cellSize;
        const drawY = (y + perimeterSize) * cellSize;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);
      }
    }
    
    // Draw grid lines
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= gridSize; i++) {
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo((i + perimeterSize) * cellSize, perimeterSize * cellSize);
      ctx.lineTo((i + perimeterSize) * cellSize, (gridSize + perimeterSize) * cellSize);
      ctx.stroke();
      
      // Horizontal lines
      ctx.beginPath();
      ctx.moveTo(perimeterSize * cellSize, (i + perimeterSize) * cellSize);
      ctx.lineTo((gridSize + perimeterSize) * cellSize, (i + perimeterSize) * cellSize);
      ctx.stroke();
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
  
  const draw = (e) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const cellSize = canvas.width / totalSize;
    
    // Calculate mouse position in grid coordinates
    const mouseX = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
    const mouseY = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
    
    // Convert to grid coordinates (removing perimeter offset)
    const x = mouseX - perimeterSize;
    const y = mouseY - perimeterSize;
    
    // Only allow drawing within the inner 28x28 grid
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;
    
    if (x !== prevPosRef.current.x || y !== prevPosRef.current.y) {
      const ctx = canvas.getContext('2d');
      
      const newGrid = [...grid];
      newGrid[y] = [...grid[y]];
      
      // inverted is black, not inverted is white
      const newValue = isInverted ? 0 : 1;
      newGrid[y][x] = newValue;
      
      ctx.fillStyle = newValue === 1 ? WHITE : BLACK;
      
      const drawX = (x + perimeterSize) * cellSize;
      const drawY = (y + perimeterSize) * cellSize;
      ctx.fillRect(drawX, drawY, cellSize, cellSize);
      
      ctx.strokeStyle = GREY;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(drawX + cellSize, drawY);
      ctx.lineTo(drawX + cellSize, drawY + cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(drawX, drawY + cellSize);
      ctx.lineTo(drawX + cellSize, drawY + cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(drawX, drawY);
      ctx.lineTo(drawX, drawY + cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(drawX, drawY);
      ctx.lineTo(drawX + cellSize, drawY);
      ctx.stroke();
      
      prevPosRef.current = {x, y};
      
      setGrid(newGrid);
      handleSubmit(newGrid);
    }
  };
  
  const clearDrawing = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / totalSize;
    
    // First draw the perimeter
    ctx.fillStyle = '#C5FFFA';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Clear only the inner grid area
    const clearValue = isInverted ? 1 : 0;
    ctx.fillStyle = clearValue === 1 ? WHITE : BLACK;
    ctx.fillRect(
      cellSize * perimeterSize,
      cellSize * perimeterSize,
      cellSize * gridSize,
      cellSize * gridSize
    );
    
    const newGrid = Array(gridSize).fill().map(() => 
      Array(gridSize).fill(clearValue)
    );
    
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= gridSize; i++) {
      // Y lines, then X lines
      ctx.beginPath();
      ctx.moveTo((i + perimeterSize) * cellSize, perimeterSize * cellSize);
      ctx.lineTo((i + perimeterSize) * cellSize, (gridSize + perimeterSize) * cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(perimeterSize * cellSize, (i + perimeterSize) * cellSize);
      ctx.lineTo((gridSize + perimeterSize) * cellSize, (i + perimeterSize) * cellSize);
      ctx.stroke();
    }
    
    setGrid(newGrid);
    handleSubmit(newGrid);
  };
  
  const invertDrawing = () => {
    const newInvertedState = !isInverted;
    setIsInverted(newInvertedState);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const canvasSize = canvas.width;
    const cellSize = canvasSize / totalSize;
  
    const newGrid = grid.map(row => 
      row.map(cell => cell === 1 ? 0 : 1)
    );
    
    ctx.fillStyle = '#C5FFFA';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        ctx.fillStyle = newGrid[y][x] === 1 ? WHITE : BLACK;
        const drawX = (x + perimeterSize) * cellSize;
        const drawY = (y + perimeterSize) * cellSize;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);
      }
    }
    
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo((i + perimeterSize) * cellSize, perimeterSize * cellSize);
      ctx.lineTo((i + perimeterSize) * cellSize, (gridSize + perimeterSize) * cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(perimeterSize * cellSize, (i + perimeterSize) * cellSize);
      ctx.lineTo((gridSize + perimeterSize) * cellSize, (i + perimeterSize) * cellSize);
      ctx.stroke();
    }
  
    setGrid(newGrid);
    handleSubmit(newGrid);
  };

  const handleSubmit = (newGrid) => {
    if (!mqttConnected) return;

    if (onSubmit) {
      onSubmit(newGrid);
    }
    
    if (!configRef.current) {
      configRef.current = {
        drawing: {
          grid: newGrid,
          invert: isInverted
        }
      };
    } else {
      configRef.current.drawing = {
        grid: newGrid,
        invert: isInverted
      };
    }
    
    configRef.current.lastUpdated = new Date().toISOString();
    
    saveConfigToDatabase(configRef.current)
      .catch(error => console.error('Error saving drawing:', error));
    
    publish('flip/draw', newGrid);
  };
  
  const handleTouchStart = (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    startDrawing({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  };
  
  const handleTouchMove = (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    draw({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  };
  
  const handleTouchEnd = () => {
    stopDrawing();
  };

  return (
    <div className="w-full p-4 bg-white rounded-lg">      
      <div className="border-2 mb-4 flex justify-center">
        <canvas 
          ref={canvasRef}
          width={330}
          height={330}
          className="touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>
      
      <div className="flex justify-end gap-4">
        <button 
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm"
          onClick={clearDrawing}
        >
          <Delete className="w-5 h-5" />
        </button>
        <button 
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm"
          onClick={invertDrawing}
        >
          {isInverted ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowRightCircle className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default DrawPanel;