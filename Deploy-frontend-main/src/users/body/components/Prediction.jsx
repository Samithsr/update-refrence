import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const Prediction = () => {
  const chartContainerRef = useRef();
  const chart = useRef();
  const resizeObserver = useRef();
  // const liveSeries = useRef();
  // const predictiveSeries = useRef();
  const baseData = useRef([]);
  const predictiveData = useRef([]);
  const [threshold, setThreshold] = useState(99);
  const [thresholdReachTime, setThresholdReachTime] = useState(null);
  const thresholdLine = useRef();
  const predictionInfoRef = useRef(null);

  const formatDate = (date) => {
    const d = new Date(date);
    return d.getTime() / 1000; // Convert to Unix timestamp (seconds)
  };

  useEffect(() => {
    // Initialize chart
    chart.current = createChart(chartContainerRef.current, {
      width: 1200, // Increased width
      height: 400,
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
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      }
    });

    // Add threshold line
    thresholdLine.current = chart.current.addLineSeries({
      color: '#FF4D4F',
      lineWidth: 2,
      lineStyle: 3, // Dotted line
      title: 'Threshold',
    });
    
    // Set initial threshold line
    thresholdLine.current.setData([
      { time: baseData.current[0]?.time || 0, value: threshold },
      { time: baseData.current[baseData.current.length - 1]?.time || Date.now()/1000, value: threshold }
    ]);

    // Add predictive line (dashed)
    const predictiveSeries = chart.current.addLineSeries({
      color: '#FF6B6B',
      lineWidth: 2,
      lineStyle: 2, // Dashed line
      title: 'Predictive',
    });

    // Add live data line (solid)
    const liveSeries = chart.current.addLineSeries({
      color: '#1890ff',
      lineWidth: 2,
      title: 'Live Data',
    });

    // Store series references
    window.predictionSeries = predictiveSeries;
    window.liveSeries = liveSeries;

    // Generate initial data
    const currentDate = Date.now();
    const initialBaseData = [];
    const initialPredictiveData = [];
    
    for (let i = 0; i < 200; i++) { // Increased data points for wider chart
      const time = new Date(currentDate - (199 - i) * 1000 * 60 * 60 * 24); // Daily data
      const timestamp = formatDate(time);
      const baseValue = 50 + Math.sin(i / 5) * 30;
      
      initialBaseData.push({
        time: timestamp,
        value: baseValue + Math.random() * 5,
      });

      initialPredictiveData.push({
        time: timestamp,
        value: baseValue + 5 + Math.sin(i / 3) * 10 + Math.random() * 3,
      });
    }

    // Set initial data
    baseData.current = initialBaseData;
    predictiveData.current = initialPredictiveData;
    
    liveSeries.setData(initialBaseData);
    predictiveSeries.setData(initialPredictiveData);

    // Calculate threshold reach time
    calculateThresholdReachTime(initialPredictiveData, threshold);

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        const { height } = chartContainerRef.current.getBoundingClientRect();
        chart.current.applyOptions({ height: height - 40 });
      }
    };

    // Initial resize
    handleResize();

    // Add resize observer
    resizeObserver.current = new ResizeObserver(handleResize);
    resizeObserver.current.observe(chartContainerRef.current);

    // Simulate live data updates
    const interval = setInterval(() => {
      const lastData = baseData.current[baseData.current.length - 1];
      const newTime = new Date(lastData.time * 1000);
      newTime.setSeconds(newTime.getSeconds() + 1);
      
      const newValue = 50 + Math.sin(baseData.current.length / 5) * 30 + Math.random() * 5;
      const newPredictiveValue = newValue + 5 + Math.sin(baseData.current.length / 3) * 10 + Math.random() * 3;

      const newDataPoint = {
        time: formatDate(newTime),
        value: newValue,
      };

      const newPredictivePoint = {
        time: formatDate(newTime),
        value: newPredictiveValue,
      };

      // Add new data
      baseData.current.push(newDataPoint);
      predictiveData.current.push(newPredictivePoint);

      // Update chart
      if (window.liveSeries) window.liveSeries.update(newDataPoint);
      if (window.predictionSeries) window.predictionSeries.update(newPredictivePoint);

      // Update threshold line
      if (thresholdLine.current) {
        thresholdLine.current.setData([
          { time: baseData.current[0]?.time || 0, value: threshold },
          { time: newDataPoint.time, value: threshold }
        ]);
      }

      // Check if threshold is reached
      if (newPredictivePoint.value >= threshold) {
        setThresholdReachTime(new Date().toLocaleTimeString());
      } else {
        // Recalculate threshold reach time
        calculateThresholdReachTime([...predictiveData.current, newPredictivePoint], threshold);
      }

      // Shift data to maintain window
      if (baseData.current.length > 200) {
        baseData.current.shift();
        predictiveData.current.shift();
        if (window.liveSeries) window.liveSeries.setData([...baseData.current]);
        if (window.predictionSeries) window.predictionSeries.setData([...predictiveData.current]);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (resizeObserver.current) {
        resizeObserver.current.disconnect();
      }
      if (chart.current) {
        chart.current.remove();
      }
    };
  }, []);

  // For connecting to real data
  const updateLiveData = (newValue, prediction) => {
    const now = Math.floor(Date.now() / 1000);
    
    const newDataPoint = {
      time: now,
      value: newValue,
    };

    const newPredictivePoint = {
      time: now,
      value: prediction,
    };

    // Add new data
    baseData.current.push(newDataPoint);
    predictiveData.current.push(newPredictivePoint);

    // Update chart
    // liveSeries.current?.update(newDataPoint);
    // predictiveSeries.current?.update(newPredictivePoint);

    // Maintain data window
    if (baseData.current.length > 200) { // Increased window size
      baseData.current.shift();
      predictiveData.current.shift();
      // liveSeries.current?.setData([...baseData.current]);
      // predictiveSeries.current?.setData([...predictiveData.current]);
    }
  };

  const calculateThresholdReachTime = (data, thresholdValue) => {
    if (!data || data.length < 2) return;
    
    // Find the first point where value crosses the threshold
    for (let i = 1; i < data.length; i++) {
      const prev = data[i-1].value;
      const curr = data[i].value;
      
      if (prev <= thresholdValue && curr > thresholdValue) {
        // Linear interpolation to find exact time
        const t = (thresholdValue - prev) / (curr - prev);
        const timeDiff = (data[i].time - data[i-1].time) * t;
        const reachTime = new Date((data[i-1].time + timeDiff) * 1000);
        setThresholdReachTime(reachTime.toLocaleString());
        return;
      }
    }
    
    // If threshold not reached yet, estimate based on trend
    const lastPoints = data.slice(-5);
    if (lastPoints.length < 2) return;
    
    const xSum = lastPoints.reduce((sum, _, i) => sum + i, 0);
    const ySum = lastPoints.reduce((sum, p) => sum + p.value, 0);
    const xySum = lastPoints.reduce((sum, p, i) => sum + (i * p.value), 0);
    const xSquaredSum = lastPoints.reduce((sum, _, i) => sum + (i * i), 0);
    const n = lastPoints.length;
    
    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    
    if (slope > 0) { // Only predict if trend is increasing
      const pointsToThreshold = (thresholdValue - intercept) / slope;
      const timeToReach = pointsToThreshold * (lastPoints[1].time - lastPoints[0].time);
      const reachTime = new Date((lastPoints[lastPoints.length-1].time + timeToReach) * 1000);
      
      if (reachTime > new Date()) {
        setThresholdReachTime(`Estimated: ${reachTime.toLocaleString()}`);
      } else {
        setThresholdReachTime('Threshold not expected to be reached with current trend');
      }
    } else {
      setThresholdReachTime('Trend not increasing - threshold not expected');
    }
  };

  const handleThresholdChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setThreshold(value);
      
      // Update threshold line
      if (thresholdLine.current && baseData.current.length > 0) {
        thresholdLine.current.setData([
          { time: baseData.current[0].time, value },
          { time: baseData.current[baseData.current.length - 1].time, value }
        ]);
      }
      
      // Recalculate threshold reach time
      calculateThresholdReachTime(predictiveData.current, value);
    }
  };

  return (
    <div style={{ 
      width: '100%',
      height: '100%',
      padding: '20px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      overflowX: 'auto' // Enable horizontal scrolling
    }}>
      <div style={{
        width: '1200px', // Fixed width for the chart container
        minHeight: '600px',
        backgroundColor: 'white',
        borderRadius: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '20px',
        position: 'relative'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <h3 style={{ margin: 0, color: '#333' }}>Prediction Chart</h3>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Threshold:</span>
              <input 
                type="number" 
                value={threshold} 
                onChange={handleThresholdChange}
                style={{ 
                  width: '80px',
                  padding: '4px 8px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px'
                }}
                min={0}
                step={0.1}
              />
              <button 
                onClick={() => calculateThresholdReachTime(predictiveData.current, threshold)}
                style={{
                  background: '#1890ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>ⓘ</span> Update
              </button>
            </div>
            
            {thresholdReachTime && (
              <div style={{ 
                backgroundColor: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '14px',
                color: '#389e0d'
              }}>
                {thresholdReachTime.startsWith('Threshold reached') ? (
                  <span>🚨 {thresholdReachTime}</span>
                ) : thresholdReachTime.startsWith('Estimated') ? (
                  <span>⏱️ {thresholdReachTime}</span>
                ) : (
                  <span>ℹ️ {thresholdReachTime}</span>
                )}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={buttonStyle}>1H</button>
            <button style={{...buttonStyle, backgroundColor: '#1890ff', color: 'white'}}>1D</button>
            <button style={buttonStyle}>1W</button>
            <button style={buttonStyle}>1M</button>
            <button style={buttonStyle}>1Y</button>
          </div>
        </div>
        
        <div 
          ref={chartContainerRef} 
          style={{ 
            width: '100%', 
            height: '400px',
            minWidth: '1000px',
            marginBottom: '20px'
          }}
        />
        
        <div ref={predictionInfoRef} style={{ 
          backgroundColor: '#f0f8ff', 
          padding: '15px', 
          borderRadius: '4px',
          borderLeft: '4px solid #1890ff'
        }}>
          <h4>Prediction Information</h4>
          <p>This chart shows the predicted values based on current trends.</p>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>The <span style={{ color: '#1890ff' }}>blue line</span> shows actual data points</li>
            <li>The <span style={{ color: '#FF6B6B' }}>red dashed line</span> shows predicted values</li>
            <li>The <span style={{ color: '#FF4D4F' }}>red dotted line</span> shows the threshold value</li>
          </ul>
          {thresholdReachTime && (
            <div style={{ marginTop: '10px', fontWeight: '500' }}>
              {thresholdReachTime.startsWith('Threshold reached') ? (
                <span>🚨 <strong>{thresholdReachTime}</strong></span>
              ) : thresholdReachTime.startsWith('Estimated') ? (
                <span>⏱️ <strong>Predicted to reach threshold: </strong>{thresholdReachTime.replace('Estimated: ', '')}</span>
              ) : (
                <span>ℹ️ <strong>{thresholdReachTime}</strong></span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const buttonStyle = {
  padding: '4px 12px',
  border: '1px solid #d9d9d9',
  borderRadius: '4px',
  backgroundColor: 'white',
  color: '#666',
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'all 0.3s',
  ':hover': {
    backgroundColor: '#f5f5f5',
  }
};

export default Prediction;