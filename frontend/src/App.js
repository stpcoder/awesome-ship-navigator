import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import MapView from './components/MapView';
import MapViewReal from './components/MapViewReal';
import ShipInfo from './components/ShipInfo';
import SensorInfo from './components/SensorInfo';
import RoutePlanner from './components/RoutePlanner';
import TimeController from './components/TimeController';
import ChatBot from './components/ChatBot';
import CCTVVideo from './components/CCTVVideo';
import LiDARStats from './components/LiDARStats';
import Emergency from './components/Emergency';
import Messages from './components/Messages';
import obstaclesData from './data/obstacles_latlng.json';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

function MainDashboard() {
  const [ships, setShips] = useState([]);
  const [selectedShip, setSelectedShip] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [realtimeData, setRealtimeData] = useState([]);
  const [sensorData, setSensorData] = useState({ cctv: [], lidar: [] });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState(null);
  const [mapClickMode, setMapClickMode] = useState(null); // 'start' or 'goal'
  const [routePoints, setRoutePoints] = useState({ start: null, goal: null });
  const [showRealtimeShips, setShowRealtimeShips] = useState(true); // Always show realtime ships
  const [showRoutes, setShowRoutes] = useState(false); // Only show routes for selected ship
  const [useRealMap, setUseRealMap] = useState(true); // Always use real map
  const [shipMapClickHandler, setShipMapClickHandler] = useState(null);
  // Dark mode removed
  const [sosAlerts, setSOSAlerts] = useState([]); // SOS alerts
  const [messages, setMessages] = useState([]); // Chat messages
  const [unreadCount, setUnreadCount] = useState(0); // Unread message count
  const [selectedChatShip, setSelectedChatShip] = useState('all'); // Selected ship for chat
  const [messageInput, setMessageInput] = useState(''); // Chat input
  const [isLiveMode, setIsLiveMode] = useState(false); // Live/Demo mode toggle
  const [selectedCCTV, setSelectedCCTV] = useState(null); // Selected CCTV for video display
  const [selectedCCTVMarker, setSelectedCCTVMarker] = useState(null); // Selected CCTV to show on map
  const [selectedLiDAR, setSelectedLiDAR] = useState(null); // Selected LiDAR for statistics display
  const [showCCTVMarkers, setShowCCTVMarkers] = useState(false); // Show CCTV markers on map
  const [showLiDARMarkers, setShowLiDARMarkers] = useState(false); // Show LiDAR markers on map
  const [showEntryExitStats, setShowEntryExitStats] = useState(false); // Show entry/exit statistics window

  // Always show realtime ships regardless of mode
  useEffect(() => {
    setShowRealtimeShips(true);  // Always show realtime ships
  }, []);

  // Fetch initial data and refresh when Live/Demo mode changes
  useEffect(() => {
    fetchShips();
    fetchSensorData();
    fetchRoutes();
    fetchSOSAlerts();
    fetchMessages();
    fetchUnreadCount();
  }, [isLiveMode]);  // Refetch when mode changes

  // Dark mode removed - this effect is no longer needed

  // Always fetch realtime data
  useEffect(() => {
    fetchRealtimeData(); // Fetch immediately
    const interval = setInterval(fetchRealtimeData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [isLiveMode]);  // Re-run when Live mode changes

  // Listen for map marker click events to sync selection
  useEffect(() => {
    const handler = (e) => {
      const { shipId, devId, id } = e.detail || {};
      // Prefer matching by numeric id when available
      if (typeof id === 'number') {
        const match = ships.find(s => s.id === id);
        if (match) {
          setSelectedShip(match);
          return;
        }
      }
      if (typeof devId === 'number') {
        const match = ships.find(s => s.id === devId);
        if (match) {
          setSelectedShip(match);
          return;
        }
      }
      if (shipId) {
        const match = ships.find(s => String(s.shipId) === String(shipId));
        if (match) {
          setSelectedShip(match);
        }
      }
    };
    window.addEventListener('map-ship-marker-click', handler);
    return () => window.removeEventListener('map-ship-marker-click', handler);
  }, [ships]);

  // Fetch SOS alerts periodically
  useEffect(() => {
    const interval = setInterval(fetchSOSAlerts, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch messages periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
      fetchUnreadCount();
    }, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchShips = async () => {
    try {
      const endpoint = isLiveMode
        ? `${API_BASE}/api/eum/ships/live`  // Live API endpoint
        : `${API_BASE}/api/eum/ships`;      // Demo (existing DB) endpoint

      const response = await axios.get(endpoint);
      console.log(`Fetched ships (${isLiveMode ? 'LIVE' : 'DEMO'}):`, response.data);
      setShips(response.data);
    } catch (error) {
      console.error('Failed to fetch ships:', error);
    }
  };

  const fetchSensorData = async () => {
    try {
      const [cctvRes, lidarRes] = await Promise.all([
        axios.get(`${API_BASE}/api/eum/cctv`),
        axios.get(`${API_BASE}/api/eum/lidar`)
      ]);
      setSensorData({
        cctv: cctvRes.data,
        lidar: lidarRes.data
      });
    } catch (error) {
      console.error('Failed to fetch sensor data:', error);
      // Set empty sensor data on error
      setSensorData({ cctv: [], lidar: [] });
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/ships`);
      setRoutes(response.data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
    }
  };

  const fetchRealtimeData = async () => {
    try {
      const endpoint = isLiveMode
        ? `${API_BASE}/api/eum/ships/realtime/live`  // Live API endpoint
        : `${API_BASE}/api/eum/ships/realtime/demo`; // Demo endpoint aligned with DB ship IDs

      const response = await axios.get(endpoint);
      console.log(`Fetched realtime data (${isLiveMode ? 'LIVE' : 'DEMO'}):`, response.data.length, 'ships');
      setRealtimeData(response.data);
    } catch (error) {
      console.error('Failed to fetch realtime data:', error);
    }
  };

  // Clicking a marker on the map selects the corresponding ship in the left dropdown
  const handleShipMarkerClick = (markerId) => {
    // markerId is devId (number) in demo/live endpoints; match against DB ship id
    const byId = ships.find(s => s.id === markerId);
    if (byId) {
      setSelectedShip(byId);
      return;
    }
    // Fallback: try matching string-based shipId
    const markerIdStr = String(markerId);
    const byShipId = ships.find(s => String(s.shipId) === markerIdStr);
    if (byShipId) {
      setSelectedShip(byShipId);
    }
  };

  const fetchSOSAlerts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/sos/active`);
      setSOSAlerts(response.data);
    } catch (error) {
      console.error('Failed to fetch SOS alerts:', error);
    }
  };

  const handleSOSUpdate = async (alertId, status) => {
    try {
      await axios.patch(`${API_BASE}/api/sos/${alertId}`, { status });
      fetchSOSAlerts(); // Refresh the list
    } catch (error) {
      console.error('Failed to update SOS alert:', error);
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/messages/unread-count`);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim()) return;

    try {
      await axios.post(`${API_BASE}/api/messages`, {
        sender_id: 'control_center',
        recipient_id: selectedChatShip,
        message: messageInput,
        message_type: selectedChatShip === 'all' ? 'broadcast' : 'text'
      });

      setMessageInput('');
      fetchMessages(); // Refresh messages
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const markMessagesAsRead = async (messageIds) => {
    try {
      await axios.patch(`${API_BASE}/api/messages/mark-read`, {
        message_ids: messageIds
      });
      fetchMessages();
      fetchUnreadCount();
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const handlePlanRoute = async (shipId, departureTime, acceptRecommendation, startPos, goalPos) => {
    // Use provided positions from RoutePlanner instead of map click points
    const start = startPos || routePoints.start;
    const goal = goalPos || routePoints.goal;

    if (!start || !goal) {
      alert('출발점과 도착점이 설정되지 않았습니다.');
      return;
    }

    try {
      // Clear previous planned route
      setPlannedRoute(null);

      // Plan route using the single endpoint
      const planResponse = await axios.post(`${API_BASE}/api/route/plan`, {
        ship_id: shipId,
        start_position: start,
        goal_position: goal,
        departure_time: departureTime,
        speed_knots: 12.0
      });

      setPlannedRoute(planResponse.data);

      // The route is already stored in the database by the backend
      // Just refresh the routes list
      fetchRoutes();

      const modeText = acceptRecommendation ? '수용 O (Flexible)' : '수용 X (Fixed)';
      const message = acceptRecommendation
        ? `경로 계획 완료!\n모드: ${modeText}\n추천 출발 시간: ${planResponse.data.recommended_departure?.toFixed(1)}분 후`
        : `경로 계획 완료!\n모드: ${modeText}\n고정 출발 시간: ${departureTime}분 후`;

      alert(message);

      // Clear route points for next planning
      setRoutePoints({ start: null, goal: null });
    } catch (error) {
      console.error('Failed to plan route:', error);
      alert('경로 계획 실패: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleMapClick = (position) => {
    if (mapClickMode === 'start') {
      setRoutePoints({ ...routePoints, start: position });
      setMapClickMode(null);
    } else if (mapClickMode === 'goal') {
      setRoutePoints({ ...routePoints, goal: position });
      setMapClickMode(null);
    }
  };

  const handleUpdatePositions = (shipId, positions) => {
    // Update the ship positions in the ships array
    setShips(prevShips => prevShips.map(ship =>
      ship.shipId === shipId
        ? { ...ship, ...positions }
        : ship
    ));

    // Update selected ship if it's the one being updated
    if (selectedShip?.shipId === shipId) {
      setSelectedShip(prev => ({ ...prev, ...positions }));
    }
  };

  // Handle sensor selection from SensorInfo component
  const handleSensorSelect = (type, data) => {
    if (type === 'cctv-single') {
      // Show single CCTV marker and select it for video
      setShowCCTVMarkers(true);
      setShowLiDARMarkers(false);
      setSelectedCCTV(data);
      setSelectedLiDAR(null);
      setShowEntryExitStats(false);
    } else if (type === 'lidar-single') {
      // Show single LiDAR marker and automatically show stats
      setShowLiDARMarkers(true);
      setShowCCTVMarkers(false);
      setSelectedLiDAR(data);
      setSelectedCCTV(null);
      setShowEntryExitStats(true);  // Automatically show stats when LiDAR is selected
    } else if (type === 'clear') {
      // Clear all sensor markers and hide stats
      setShowCCTVMarkers(false);
      setShowLiDARMarkers(false);
      setSelectedCCTV(null);
      setSelectedLiDAR(null);
      setShowEntryExitStats(false);
    }
  };

  const handleShipMapClickMode = (handler) => {
    setShipMapClickHandler(() => handler);
  };

  // Handle LiDAR selection for stats display
  const handleLiDARSelect = (lidar) => {
    console.log('LiDAR selected:', lidar);
    setSelectedLiDAR(lidar);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>소규모 항구 통합 관제 시스템</h1>
        <div style={{
          position: 'absolute',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          {/* Live/Demo Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '30px',
            padding: '4px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <button
              onClick={() => setIsLiveMode(false)}
              style={{
                padding: '6px 14px',
                background: !isLiveMode ? 'white' : 'transparent',
                color: !isLiveMode ? '#667eea' : 'white',
                border: 'none',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              Demo
            </button>
            <button
              onClick={() => setIsLiveMode(true)}
              style={{
                padding: '6px 14px',
                background: isLiveMode ? 'white' : 'transparent',
                color: isLiveMode ? '#667eea' : 'white',
                border: 'none',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              Live
              {isLiveMode && (
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  background: '#4ade80',
                  borderRadius: '50%',
                  marginLeft: '6px',
                  animation: 'pulse 2s infinite'
                }} />
              )}
            </button>
          </div>


          {/* AI Chatbot Button */}
          <Link to="/chatbot" className="chatbot-nav-button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            AI 챗봇
          </Link>
        </div>
      </header>

      <div className="main-container">
        <div className="left-panel">
          <ShipInfo
            ships={ships}
            selectedShip={selectedShip}
            onSelectShip={setSelectedShip}
            onUpdatePositions={handleUpdatePositions}
            onMapClick={handleShipMapClickMode}
          />

          <SensorInfo
            sensorData={sensorData}
            onSensorSelect={handleSensorSelect}
          />
        </div>

        <div className="center-panel">
          <MapViewReal
            ships={realtimeData}  // Always show realtime data
            routes={selectedShip && !isLiveMode ? routes.filter(r => r.ship_id === selectedShip.ship_id) : []}  // Show routes only for selected ship in Demo mode
            selectedShip={selectedShip}
            obstacles={obstaclesData} // Pass obstacle data
            onSetStart={() => setMapClickMode('start')}
            onSetGoal={() => setMapClickMode('goal')}
            routePoints={routePoints}
            plannedRoute={plannedRoute}
            onMapClick={shipMapClickHandler}
            sosAlerts={sosAlerts}  // Pass SOS alerts
            selectedCCTVMarker={selectedCCTVMarker}  // Pass selected CCTV to show marker
            selectedCCTV={selectedCCTV}  // Pass currently selected CCTV for filtering
            onCCTVSelect={setSelectedCCTV}  // Handle CCTV video selection
            cctvData={sensorData.cctv}  // Pass CCTV data
            showCCTVMarkers={showCCTVMarkers}  // Control CCTV marker visibility
            lidarData={sensorData.lidar}  // Pass LiDAR data
            showLiDARMarkers={showLiDARMarkers}  // Control LiDAR marker visibility
            onLiDARSelect={handleLiDARSelect}  // Handle LiDAR selection
            onShipSelect={(ids) => {
              // Directly select ship to force re-render/highlight immediately
              const match = ships.find(s => s.id === ids.id) || ships.find(s => String(s.shipId) === String(ids.shipId));
              if (match) setSelectedShip(match);
            }}
          />

          <TimeController
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
          />

          {/* CCTV Video Display */}
          {selectedCCTV && (
            <CCTVVideo
              cctvId={selectedCCTV.id}
              cctvName={selectedCCTV.name}
              onClose={() => {
                setSelectedCCTV(null);
                setShowCCTVMarkers(false);
              }}
            />
          )}

          {/* LiDAR Statistics Display */}
          {selectedLiDAR && showEntryExitStats && (
            <LiDARStats
              lidar={selectedLiDAR}
              onClose={() => {
                setSelectedLiDAR(null);
                setShowEntryExitStats(false);
              }}
            />
          )}
        </div>

        <div className="right-panel">
          <RoutePlanner
            ships={ships}
            selectedShip={selectedShip}
            onPlanRoute={handlePlanRoute}
          />


          <Emergency
            sosAlerts={sosAlerts}
            onSOSUpdate={handleSOSUpdate}
          />

          <Messages
            messages={messages}
            unreadCount={unreadCount}
            selectedChatShip={selectedChatShip}
            setSelectedChatShip={setSelectedChatShip}
            messageInput={messageInput}
            setMessageInput={setMessageInput}
            sendMessage={sendMessage}
            markMessagesAsRead={markMessagesAsRead}
            ships={ships}
          />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainDashboard />} />
        <Route path="/chatbot" element={<ChatBot />} />
      </Routes>
    </Router>
  );
}

export default App;