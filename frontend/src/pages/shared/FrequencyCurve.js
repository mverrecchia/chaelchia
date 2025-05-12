import React, { useRef, useEffect, useState, useCallback } from 'react';

const FrequencyCurve = ({ 
  lowFrequencies, 
  midFrequencies,
  highFrequencies,
  lowWeights,
  midWeights,
  highWeights,
  onLowChange,
  onMidChange,
  onHighChange,
  frequencyRange = [40, 20000], // 40Hz to 20kHz
  lowColor = '#3b82f6',   // Blue
  midColor = '#10b981',   // Green
  highColor = '#8b5cf6',  // Purple
  fftData = null
}) => {
  const canvasRef = useRef(null);
  const fftCanvasRef = useRef(null);
  const pointsRef = useRef([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const ctxRef = useRef(null);
  const fftCtxRef = useRef(null);
  
  // this dimensioning works for now - should be dynamic but maybe later
  const width = 600;
  const height = 225;
  const padding = { left: 15, right: 15, top: 5, bottom: 75 };
  const canvasWidth = width - padding.left - padding.right;
  const canvasHeight = height - padding.top - padding.bottom;

  const allFrequencies = useCallback(() => {
    let freqs = [];
    if (lowFrequencies) freqs = freqs.concat(lowFrequencies);
    if (midFrequencies) freqs = freqs.concat(midFrequencies);
    if (highFrequencies) freqs = freqs.concat(highFrequencies);
    return [...new Set(freqs)].sort((a, b) => a - b); // Deduplicate and sort
  }, [lowFrequencies, midFrequencies, highFrequencies]);
  
  const getFrequencyIndex = useCallback((freq) => {
    const freqs = allFrequencies();
    return freqs.findIndex(f => f === freq);
  }, [allFrequencies]);

  // evenly space the frequencies on the x-axis
  const mapFrequencyToX = useCallback((freq) => {
    const freqs = allFrequencies();
    const totalFrequencies = freqs.length;
    if (totalFrequencies <= 1) return padding.left;
    
    const index = getFrequencyIndex(freq);
    if (index === -1) return padding.left;
    
    const spacing = canvasWidth / (totalFrequencies - 1);
    return padding.left + (index * spacing);
  }, [canvasWidth, padding.left, allFrequencies, getFrequencyIndex]);

  // map a weight value (0-1) to the y-axis
  const mapWeightToY = useCallback((weight) => {
    return padding.top + (1 - weight) * canvasHeight;
  }, [canvasHeight, padding.top]);

  // map the y-axis to a weight value (0-1)
  const mapYToWeight = useCallback((y) => {
    return Math.max(0, Math.min(1, 1 - (y - padding.top) / canvasHeight));
  }, [canvasHeight, padding.top]);

  useEffect(() => {
    if (pointsRef.current.length > 0) return;

    let newPoints = [];
    if (lowFrequencies && midFrequencies && highFrequencies) {
      if (lowFrequencies && lowWeights && lowFrequencies.length === lowWeights.length) {
        lowFrequencies.forEach((freq, idx) => {
          const x = mapFrequencyToX(freq);
          const y = mapWeightToY(lowWeights[idx]);
          newPoints.push({ 
            x, y, 
            frequency: freq, 
            weight: lowWeights[idx], 
            band: 'low', 
            index: idx,
            color: lowColor
          });
        });
      }
      
      if (midFrequencies && midWeights && midFrequencies.length === midWeights.length) {
        midFrequencies.forEach((freq, idx) => {
          const x = mapFrequencyToX(freq);
          const y = mapWeightToY(midWeights[idx]);
          newPoints.push({ 
            x, y, 
            frequency: freq, 
            weight: midWeights[idx], 
            band: 'mid', 
            index: idx,
            color: midColor
          });
        });
      }
      
      if (highFrequencies && highWeights && highFrequencies.length === highWeights.length) {
        highFrequencies.forEach((freq, idx) => {
          const x = mapFrequencyToX(freq);
          const y = mapWeightToY(highWeights[idx]);
          newPoints.push({ 
            x, y, 
            frequency: freq, 
            weight: highWeights[idx], 
            band: 'high', 
            index: idx,
            color: highColor
          });
        });
      }
    } 
    else {
      console.warn('Invalid frequency or weight data');
      return;
    }
    
    pointsRef.current = newPoints;

    if (ctxRef.current) {
      drawCanvas();
    }
  }, [
    lowFrequencies, midFrequencies, highFrequencies,
    lowWeights, midWeights, highWeights,
    mapFrequencyToX, mapWeightToY,
    lowColor, midColor, highColor
  ]);
  
  // Update point positions when weights change (only for non-dragging state)
  useEffect(() => {
    if (isDragging || pointsRef.current.length === 0) return;

    if (lowFrequencies && lowWeights && lowFrequencies.length === lowWeights.length) {
      lowFrequencies.forEach((freq, idx) => {
        const point = pointsRef.current.find(p => p.band === 'low' && p.index === idx);
        if (point) {
          point.y = mapWeightToY(lowWeights[idx]);
          point.weight = lowWeights[idx];
        }
      });
    }
    
    if (midFrequencies && midWeights && midFrequencies.length === midWeights.length) {
      midFrequencies.forEach((freq, idx) => {
        const point = pointsRef.current.find(p => p.band === 'mid' && p.index === idx);
        if (point) {
          point.y = mapWeightToY(midWeights[idx]);
          point.weight = midWeights[idx];
        }
      });
    }
    
    if (highFrequencies && highWeights && highFrequencies.length === highWeights.length) {
      highFrequencies.forEach((freq, idx) => {
        const point = pointsRef.current.find(p => p.band === 'high' && p.index === idx);
        if (point) {
          point.y = mapWeightToY(highWeights[idx]);
          point.weight = highWeights[idx];
        }
      });
    }
    
    // redraw canvas with updated points
    if (ctxRef.current) {
      drawCanvas();
    }
  }, [
    lowWeights, midWeights, highWeights, 
    isDragging, mapWeightToY
  ]);

  // Draw grid lines with evenly spaced frequency divisions
  const drawGrid = useCallback((ctx) => {
    if (!ctx) return;

    // Clear the canvas first
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + canvasHeight);
    ctx.lineTo(width - padding.right, padding.top + canvasHeight);
    ctx.stroke();
    
    const frequencies = allFrequencies();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    frequencies.forEach(freq => {
      const x = mapFrequencyToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + canvasHeight);
      ctx.stroke();
    });
    
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    const formatFreq = (freq) => {
      if (freq >= 1000) {
        return `${(freq/1000).toFixed(freq % 1000 === 0 ? 0 : 1)}kHz`;
      } else {
        return `${freq}Hz`;
      }
    };
    
    const [minFreq, maxFreq] = frequencyRange;
    ctx.fillText(formatFreq(minFreq), padding.left, height - padding.bottom + 15);
    ctx.fillText(formatFreq(maxFreq), width - padding.right, height - padding.bottom + 15);
    
  }, [width, height, padding, canvasHeight, mapFrequencyToX, allFrequencies, frequencyRange]);

  const drawPoints = useCallback((ctx) => {
    if (!ctx || pointsRef.current.length < 1) return;

    const lowPoints = pointsRef.current.filter(p => p.band === 'low').sort((a, b) => a.frequency - b.frequency);
    const midPoints = pointsRef.current.filter(p => p.band === 'mid').sort((a, b) => a.frequency - b.frequency);
    const highPoints = pointsRef.current.filter(p => p.band === 'high').sort((a, b) => a.frequency - b.frequency);
    
    const drawBandLine = (points, color) => {
      if (points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    
    // draw each band with its solid color
    if (lowPoints.length >= 2) drawBandLine(lowPoints, lowColor);
    if (midPoints.length >= 2) drawBandLine(midPoints, midColor);
    if (highPoints.length >= 2) drawBandLine(highPoints, highColor);
    
    // draw all points with their individual colors
    pointsRef.current.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = point.color; // use the point's original color
      ctx.fill();
      ctx.strokeStyle = selectedPoint === index ? 'white' : 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = selectedPoint === index ? 3 : 2;
      ctx.stroke();
    });
  }, [selectedPoint, lowColor, midColor, highColor]);

  // FFT data overlay
  const drawFFTOverlay = useCallback(() => {
    const ctx = fftCtxRef.current;
    if (!ctx || !fftData) return;
    
    ctx.clearRect(0, 0, width, height);
    
    const drawFFTBar = (freq, magnitude, color) => {
      const x = mapFrequencyToX(freq);
      const barHeight = magnitude * canvasHeight;
      const y = padding.top + canvasHeight - barHeight;
      
      // 50% opacity 
      ctx.fillStyle = `${color}80`; 
      ctx.fillRect(x - 6, y, 12, barHeight);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 6, y, 12, barHeight);

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    
    // Draw FFT data for each frequency band
    if (fftData.low && lowFrequencies) {
      lowFrequencies.forEach((freq, idx) => {
        if (idx < fftData.low.length) {
          drawFFTBar(freq, fftData.low[idx], lowColor);
        }
      });
    }
    
    if (fftData.mid && midFrequencies) {
      midFrequencies.forEach((freq, idx) => {
        if (idx < fftData.mid.length) {
          drawFFTBar(freq, fftData.mid[idx], midColor);
        }
      });
    }
    
    if (fftData.high && highFrequencies) {
      highFrequencies.forEach((freq, idx) => {
        if (idx < fftData.high.length) {
          drawFFTBar(freq, fftData.high[idx], highColor);
        }
      });
    }
  }, [fftData, lowFrequencies, midFrequencies, highFrequencies, 
      canvasHeight, padding.top, mapFrequencyToX, lowColor, midColor, highColor, width, height]);

  // Combined drawing function for main canvas
  const drawCanvas = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    
    drawGrid(ctx);
    drawPoints(ctx);
  }, [drawGrid, drawPoints]);

  // init. canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const fftCanvas = fftCanvasRef.current;
    
    if (canvas) {
      ctxRef.current = canvas.getContext('2d');
      if (ctxRef.current) {
        drawCanvas();
      }
    }
    
    if (fftCanvas) {
      fftCtxRef.current = fftCanvas.getContext('2d');
    }
  }, [drawCanvas]);

  // FFT canvas update when FFT data changes
  useEffect(() => {
    if (fftCtxRef.current && fftData) {
      drawFFTOverlay();
    }
  }, [fftData, drawFFTOverlay]);

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const findClosestPoint = (pos) => {
    return pointsRef.current.findIndex(point => 
      Math.hypot(point.x - pos.x, point.y - pos.y) < 10
    );
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    const pointIndex = findClosestPoint(pos);
    
    if (pointIndex !== -1) {
      setSelectedPoint(pointIndex);
      setIsDragging(true);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || selectedPoint === null) return;

    e.preventDefault();
    
    const pos = getMousePos(e);
    const y = Math.max(padding.top, Math.min(padding.top + canvasHeight, pos.y));
    const weight = mapYToWeight(y);
    
    const point = pointsRef.current[selectedPoint];
    point.y = y;
    point.weight = weight;
    
    drawCanvas();
  };

  const handleMouseUp = () => {
    if (isDragging && selectedPoint !== null) {
      const point = pointsRef.current[selectedPoint];
      
      if (point.band === 'low' && onLowChange) {
        onLowChange(point.index, point.weight);
      } else if (point.band === 'mid' && onMidChange) {
        onMidChange(point.index, point.weight);
      } else if (point.band === 'high' && onHighChange) {
        onHighChange(point.index, point.weight);
      }
    }
    
    setIsDragging(false);
    setSelectedPoint(null);
  };

  return (
    <div className="frequency-curve relative">
      <canvas
        ref={fftCanvasRef}
        width={width}
        height={height}
        className="rounded-md absolute top-0 left-0"
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-md relative z-10"
        style={{ backgroundColor: 'transparent' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        tabIndex="0"
      />
    </div>
  );
};

export default FrequencyCurve;