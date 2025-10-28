import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useLocation } from 'react-router-dom';
import './PredictionGraph.css';

const PredictionGraph = () => {
  const chartContainerRef = useRef();
  const chart = useRef();
  const resizeObserver = useRef();
  const [threshold, setThreshold] = useState(99);
  const [thresholdReachTime, setThresholdReachTime] = useState(null);
  const [showInfo, setShowInfo] = useState(true);
  const thresholdLine = useRef();
  const location = useLocation();
  const topic = new URLSearchParams(location.search).get('topic');

  const formatDate = (date) => {
    const d = new Date(date);
    return d.getTime() / 1000; // Convert to Unix timestamp (seconds)
  };

  // Simulated data for demonstration
  const generateData = (count, startValue, variance, startTime) => {
    const data = [];
    let value = startValue;
    for (let i = 0; i < count; i++) {
      value = value + (Math.random() * 2 - 1) * variance;
      data.push({
        time: startTime + i * 1000,
        value: Math.max(0, value) // Ensure value doesn't go below 0
      });
    }
    return data;
  };

  // Calculate when the threshold will be reached
  const calculateThresholdReach = (data) => {
    if (!data || data.length < 2) return null;
    
    // Find the first point where value crosses the threshold
    for (let i = 1; i < data.length; i++) {
      const prev = data[i-1].value;
      const curr = data[i].value;
      
      if (prev <= threshold && curr > threshold) {
        // Linear interpolation to find exact time
        const t = (threshold - prev) / (curr - prev);
        const timeDiff = (data[i].time - data[i-1].time) * t;
        const reachTime = new Date((data[i-1].time + timeDiff) * 1000);
        return `Threshold reached at ${reachTime.toLocaleTimeString()}`;
      }
    }
    
    // If threshold not reached, estimate based on trend
    const lastPoints = data.slice(-5);
    if (lastPoints.length < 2) return 'Not enough data to predict';
    
    const xSum = lastPoints.reduce((sum, _, i) => sum + i, 0);
    const ySum = lastPoints.reduce((sum, p) => sum + p.value, 0);
    const xySum = lastPoints.reduce((sum, p, i) => sum + (i * p.value), 0);
    const xSquaredSum = lastPoints.reduce((sum, _, i) => sum + (i * i), 0);
    const n = lastPoints.length;
    
    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    
    if (slope > 0) { // Only predict if trend is increasing
      const pointsToThreshold = (threshold - intercept) / slope;
      const timeToReach = pointsToThreshold * (lastPoints[1].time - lastPoints[0].time);
      const reachTime = new Date((lastPoints[lastPoints.length-1].time + timeToReach) * 1000);
      
      if (reachTime > new Date()) {
        return `Estimated to reach threshold at ${reachTime.toLocaleString()}`;
      }
    }
    
    return 'Threshold not expected to be reached with current trend';
  };

  useEffect(() => {
    // Initialize chart
    chart.current = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        backgroundColor: '#ffffff',
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
        borderColor: '#f0f0f0',
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: '#f0f0f0',
      },
    });

    // Add threshold line
    thresholdLine.current = chart.current.addLineSeries({
      color: '#FF4D4F',
      lineWidth: 2,
      lineStyle: 3, // Dotted line
      title: 'Threshold',
    });

    // Add live data line (solid)
    const liveSeries = chart.current.addLineSeries({
      color: '#1890ff',
      lineWidth: 2,
      title: 'Live Data',
    });

    // Add predictive line (dashed)
    const predictiveSeries = chart.current.addLineSeries({
      color: '#FF6B6B',
      lineWidth: 2,
      lineStyle: 2, // Dashed line
      title: 'Prediction',
    });

    // Generate initial data
    const now = Date.now();
    const initialData = generateData(100, 50, 5, now - 100000);
    const predictionData = generateData(50, initialData[initialData.length - 1].value, 3, now);

    // Set initial data
    liveSeries.setData(initialData);
    predictiveSeries.setData(predictionData);
    
    // Set initial threshold line
    thresholdLine.current.setData([
      { time: initialData[0].time, value: threshold },
      { time: predictionData[predictionData.length - 1].time, value: threshold }
    ]);

    // Calculate initial threshold reach time
    const reachTime = calculateThresholdReach([...initialData, ...predictionData]);
    setThresholdReachTime(reachTime);

    // Handle window resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    // Add resize observer
    resizeObserver.current = new ResizeObserver(handleResize);
    resizeObserver.current.observe(chartContainerRef.current);

    // Cleanup
    return () => {
      if (resizeObserver.current) {
        resizeObserver.current.disconnect();
      }
      if (chart.current) {
        chart.current.remove();
      }
    };
  }, [topic]);

  const handleThresholdChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setThreshold(value);
      
      // Update threshold line
      if (thresholdLine.current) {
        // Get current time range
        const timeScale = chart.current.timeScale();
        const range = timeScale.getVisibleRange();
        
        thresholdLine.current.setData([
          { time: range.from * 1000, value },
          { time: range.to * 1000, value }
        ]);
      }
      
      // Recalculate threshold reach time
      // In a real app, you would regenerate the prediction data here
      const reachTime = calculateThresholdReach([]);
      setThresholdReachTime(reachTime || 'Recalculating...');
    }
  };

  const toggleInfo = () => {
    setShowInfo(!showInfo);
  };

  return (
    <div className="prediction-container">
      <div className="prediction-header">
        <h2>Prediction for: {topic || 'Unknown Topic'}</h2>
        <div className="threshold-controls">
          <div className="threshold-input">
            <label>Threshold:</label>
            <input
              type="number"
              value={threshold}
              onChange={handleThresholdChange}
              min="0"
              step="0.1"
              className="threshold-input-field"
            />
            <button 
              onClick={toggleInfo}
              className="info-toggle"
              title={showInfo ? 'Hide info' : 'Show info'}
            >
              {showInfo ? 'ℹ️' : 'ℹ️'}
            </button>
          </div>
          
          {thresholdReachTime && (
            <div className={`threshold-status ${thresholdReachTime.includes('reached') ? 'status-warning' : 'status-info'}`}>
              {thresholdReachTime}
            </div>
          )}
        </div>
      </div>
      
      <div ref={chartContainerRef} className="chart-container" />
      
      {showInfo && (
        <div className="prediction-info">
          <h4>Prediction Information</h4>
          <p>This chart shows the predicted values based on current trends for <strong>{topic || 'the selected topic'}</strong>.</p>
          <ul>
            <li>The <span className="blue-text">blue line</span> shows actual data points</li>
            <li>The <span className="red-text">red dashed line</span> shows predicted values</li>
            <li>The <span className="threshold-text">red dotted line</span> shows the threshold value ({threshold})</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default PredictionGraph;
