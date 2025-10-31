import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useLocation } from 'react-router-dom';

const Prediction = () => {
  const chartContainerRef = useRef();
  const chart = useRef();
  const liveSeries = useRef();
  const predictiveSeries = useRef();
  const thresholdLine = useRef();
  const baseData = useRef([]);
  const predictiveData = useRef([]);

  const [threshold, setThreshold] = useState(99);
  const [thresholdReachTime, setThresholdReachTime] = useState(null);
  const [timeFrame, setTimeFrame] = useState('2h');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredButton, setHoveredButton] = useState(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const topic = queryParams.get('topic') || '';

  const formatDate = (date) => Math.floor(new Date(date).getTime() / 1000);

  const socket = useRef();
  // === FETCH INITIAL DATA (PER TOPIC) ===
  const fetchInitialData = useCallback(
    async (tf = timeFrame) => {
      if (!topic) return;
      try {
        setIsLoading(true);
        setError(null);

        const response = await axios.get(
          `/mqtt/prediction/${encodeURIComponent(topic)}?timeframe=${tf}`
        );
        const { historical, predictions } = response.data.data;

        // Sort & dedupe historical
        const sorted = [...historical]
          .sort((a, b) => a.time - b.time)
          .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

        baseData.current = sorted;
        predictiveData.current = [...sorted, ...predictions];

        if (chart.current && sorted.length > 0) {
          liveSeries.current.setData(sorted);
          predictiveSeries.current.setData(predictiveData.current);
          updateThresholdLine();
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data for this topic');
      } finally {
        setIsLoading(false);
      }
    },
    [topic, timeFrame]
  );

  // === SAFE THRESHOLD LINE UPDATE ===
  const updateThresholdLine = () => {
    if (!thresholdLine.current || baseData.current.length === 0) {
      thresholdLine.current?.setData([]);
      return;
    }

    const data = baseData.current;
    let start = data[0].time;
    let end = data[data.length - 1].time;

    // Handle single point or same time
    if (data.length === 1 || start >= end) {
      const now = Math.floor(Date.now() / 1000);
      if (now > start) {
        end = now;
      } else {
        thresholdLine.current.setData([]);
        return;
      }
    }

    // Only set if start < end
    if (start < end) {
      thresholdLine.current.setData([
        { time: start, value: threshold },
        { time: end, value: threshold },
      ]);
    }
  };

  // === TIMEFRAME CHANGE ===
  const handleTimeFrameChange = async (newTimeFrame) => {
    if (newTimeFrame === timeFrame || isLoading) return;
    setTimeFrame(newTimeFrame);
    await fetchInitialData(newTimeFrame);
  };

  // === SOCKET.IO SETUP ===
  useEffect(() => {
  if (!topic) return;

  const socketInstance = io('http://13.233.73.61:4000', {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 5000,
  });

  socket.current = socketInstance;

  socketInstance.on('connect', () => {
    setIsConnected(true);
    socketInstance.emit('subscribeToTopic', topic);
  });

  socketInstance.on('disconnect', () => setIsConnected(false));
  socketInstance.on('connect_error', () => setError('Connection failed'));

  return () => {
    socketInstance.emit('unsubscribeFromTopic', topic);
    socketInstance.disconnect();
  };
}, [topic]);

  // === LIVE DATA HANDLER ===
  useEffect(() => {
    if (!socket.current) return;

    const handleLiveData = (data) => {
      if (!data.success) return;

      const rawMessage = data.message?.message?.message || data.message?.message || data.message;
      const timestamp = data.message?.timestamp || new Date().toISOString();
      const value = parseFloat(rawMessage);
      if (isNaN(value)) return;

      const time = formatDate(timestamp);

      // === PREVENT DUPLICATE OR OUT-OF-ORDER TIME ===
      const lastTime = baseData.current.length > 0
        ? baseData.current[baseData.current.length - 1].time
        : 0;

      if (time <= lastTime) return; // Skip

      const newPoint = { time, value };
      baseData.current.push(newPoint);
      if (liveSeries.current) liveSeries.current.update(newPoint);

      // === SIMPLE PREDICTION (TREND + NOISE) ===
      const last5 = baseData.current.slice(-5).map(p => p.value);
      const avg = last5.reduce((a, b) => a + b, 0) / last5.length;
      const trend = last5.length > 1 ? last5[last5.length - 1] - last5[0] : 0;
      const prediction = value + trend * 0.5 + (Math.random() - 0.5) * 2;

      const predPoint = { time, value: prediction };
      predictiveData.current.push(predPoint);
      if (predictiveSeries.current) predictiveSeries.current.update(predPoint);

      // === UPDATE THRESHOLD & ESTIMATE ===
      updateThresholdLine();
      if (prediction >= threshold) {
        setThresholdReachTime(`Threshold reached at ${new Date().toLocaleTimeString()}`);
      } else {
        estimateThresholdReachTime();
      }

      // === TRIM DATA ===
      if (baseData.current.length > 200) {
        baseData.current.shift();
        predictiveData.current.shift();
        liveSeries.current.setData([...baseData.current]);
        predictiveSeries.current.setData([...predictiveData.current]);
      }
    };

    socket.current.on('liveMessage', handleLiveData);

    return () => socket.current.off('liveMessage', handleLiveData);
  }, [threshold]);

  // === ESTIMATE THRESHOLD REACH TIME ===
  const estimateThresholdReachTime = () => {
    const data = predictiveData.current;
    if (data.length < 2) return;

    const last5 = data.slice(-5);
    const x = last5.map((_, i) => i);
    const y = last5.map(p => p.value);

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, i) => a + i * y[i], 0);
    const sumX2 = x.reduce((a, i) => a + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    if (slope > 0) {
      const steps = (threshold - intercept) / slope;
      const timeStep = data[1].time - data[0].time;
      const reachTime = new Date((data[data.length - 1].time + steps * timeStep) * 1000);
      if (reachTime > new Date()) {
        setThresholdReachTime(`Est: ${reachTime.toLocaleTimeString()}`);
      }
    }
  };

  // === THRESHOLD CHANGE ===
  const handleThresholdChange = (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      setThreshold(val);
      updateThresholdLine();
      estimateThresholdReachTime();
    }
  };

  // === CHART INITIALIZATION ===
  useEffect(() => {
    chart.current = createChart(chartContainerRef.current, {
      width: 1200,
      height: 400,
      layout: { backgroundColor: '#ffffff', textColor: '#333' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: true },
    });

    liveSeries.current = chart.current.addLineSeries({
      color: '#1890ff',
      lineWidth: 2,
      title: 'Live Data',
    });

    predictiveSeries.current = chart.current.addLineSeries({
      color: '#FF6B6B',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: 'Predicted',
    });

    thresholdLine.current = chart.current.addLineSeries({
      color: '#FF4D4F',
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      title: 'Threshold',
    });

    // Start empty
    thresholdLine.current.setData([]);

    fetchInitialData();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.current?.remove();
    };
  }, [fetchInitialData]);

  const getButtonStyle = (tf) => ({
    padding: '4px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '4px',
    backgroundColor: timeFrame === tf ? '#1890ff' : hoveredButton === tf ? '#f5f5f5' : 'white',
    color: timeFrame === tf ? 'white' : 'rgba(0,0,0,0.85)',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s',
  });

  return (
    <div style={{ width: '100%', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      <div style={{ width: '1200px', minHeight: '600px', backgroundColor: 'white', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, color: '#333' }}>Prediction Chart: {topic || 'No Topic'}</h3>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Threshold:</span>
              <input
                type="number"
                value={threshold}
                onChange={handleThresholdChange}
                style={{ width: '80px', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                step={0.1}
              />
            </div>

            {thresholdReachTime && (
              <div style={{ backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '4px', padding: '4px 8px', fontSize: '14px', color: '#389e0d' }}>
                {thresholdReachTime}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {['1H', '1D', '1W', '1M', '2h'].map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeFrameChange(tf)}
                disabled={isLoading}
                style={getButtonStyle(tf)}
                onMouseEnter={() => setHoveredButton(tf)}
                onMouseLeave={() => setHoveredButton(null)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '14px' }}>
          <p style={{ margin: '8px 0' }}>
            Live data from MQTT via Socket.IO. Format:{' '}
            <code style={{ background: '#f0f0f0', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace' }}>
              {'{'} "success": true, "message": {'{'} "message": "123.45", "timestamp": "2025-..." {'}} {'}'
            </code>
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li><span style={{ color: '#1890ff' }}>Blue</span> – Live Value</li>
            <li><span style={{ color: '#FF6B6B' }}>Red Dashed</span> – Predicted</li>
            <li><span style={{ color: '#FF4D4F' }}>Red Dotted</span> – Threshold ({threshold})</li>
          </ul>
        </div>

        <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />

        <div style={{ marginTop: '10px', fontSize: '12px', color: isConnected ? '#389e0d' : '#d4380d' }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>

        {error && (
          <div style={{ marginTop: '10px', color: '#d4380d', backgroundColor: '#fff2f0', padding: '8px', borderRadius: '4px', fontSize: '14px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default Prediction;